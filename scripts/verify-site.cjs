/**
 * 端到端验证脚本（零依赖：Node 22 内置 fetch / WebSocket 驱动 Chromium）。
 *
 * 用法：
 *   1) npx vite --port 5199
 *   2) node scripts/verify-site.cjs
 *
 * 可选环境变量：
 *   VIEWPORT_W / VIEWPORT_H   指定视口（默认 1440x900）
 *   NO_WEBGL=1                关闭 WebGL，验证静态降级路径
 *   CYLINDER_IMAGE_FAILURE=1  阻断一张 Era 图，验证 stage 图片回退
 *   SITE                      覆盖站点地址
 */
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 9333;
const SITE = process.env.SITE || 'http://localhost:5199/';
const VIEWPORT_W = Number(process.env.VIEWPORT_W || 1440);
const VIEWPORT_H = Number(process.env.VIEWPORT_H || 900);
const NO_WEBGL = process.env.NO_WEBGL === '1';
const CYLINDER_IMAGE_FAILURE = process.env.CYLINDER_IMAGE_FAILURE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isFile(candidate) {
  try { return fs.statSync(candidate).isFile(); } catch { return false; }
}

function findChromiumExecutable() {
  const override = process.env.CHROME_PATH?.trim();
  if (override) return isFile(override) ? path.resolve(override) : undefined;

  const executableNames = process.platform === 'win32'
    ? ['chrome.exe', 'chromium.exe', 'chrome-headless-shell.exe']
    : process.platform === 'darwin'
      ? ['Google Chrome', 'Chromium', 'google-chrome', 'chromium']
      : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const name of executableNames) {
      const candidate = path.join(directory, name);
      if (isFile(candidate)) return candidate;
    }
  }
  if (process.platform === 'darwin') {
    const appPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ];
    const installedApp = appPaths.find(isFile);
    if (installedApp) return installedApp;
  }

  const browserRoots = [];
  const configuredRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (configuredRoot && configuredRoot !== '0') browserRoots.push(configuredRoot);
  if (process.platform === 'win32') {
    const localData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    browserRoots.push(path.join(localData, 'ms-playwright'));
  } else {
    const cacheRoot = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    browserRoots.push(path.join(cacheRoot, 'ms-playwright'));
  }

  const relativeCandidates = process.platform === 'win32'
    ? [
      path.join('chrome-win64', 'chrome.exe'), path.join('chrome-win', 'chrome.exe'),
      path.join('chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
    ]
    : process.platform === 'darwin'
      ? [path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')]
      : [
        path.join('chrome-linux64', 'chrome'), path.join('chrome-linux', 'chrome'),
        path.join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
      ];

  for (const browserRoot of browserRoots) {
    let versions;
    try {
      versions = fs.readdirSync(browserRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^(?:chromium|chrome-headless-shell)-/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, 'en-US', { numeric: true }));
    } catch { continue; }
    for (const version of versions) {
      for (const relative of relativeCandidates) {
        const candidate = path.join(browserRoot, version, relative);
        if (isFile(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

const glFlags = NO_WEBGL
  ? ['--disable-gpu', '--disable-software-rasterizer', '--disable-webgl']
  : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

async function main() {
  const CHROME = findChromiumExecutable();
  if (!CHROME) {
    throw new Error('未找到 Chromium。请将浏览器加入 PATH，或通过 CHROME_PATH 指定可执行文件。');
  }
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--no-sandbox',
      ...glFlags,
      '--autoplay-policy=no-user-gesture-required',
      '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-e2e-' + Date.now()),
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=' + VIEWPORT_W + ',' + VIEWPORT_H,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let startupError;
  child.once('error', (error) => { startupError = error; });
  process.once('exit', () => child.kill());
  child.stderr.on('data', () => {});

  let target = null;
  for (let i = 0; i < 40; i++) {
    if (startupError) throw new Error(`无法启动 Chromium (${CHROME}): ${startupError.message}`);
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch { /* not ready */ }
  }
  if (!target) throw new Error('无法连接到 Chromium');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const pageErrors = [];
  const consoleLogs = [];
  const failedChecks = [];
  const check = (label, passed, detail = '') => {
    console.log(`${passed ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
    if (!passed) failedChecks.push(label);
  };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(
        m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
      );
    }
  });
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.result?.exceptionDetails) return 'EXCEPTION: ' + (out.result.exceptionDetails.exception?.description || '');
    return out.result?.result?.value;
  };
  const shot = async (name) => {
    const out = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const data = out.result?.data;
    if (!data) { console.log('截图失败:', name); return; }
    const suffix = `${VIEWPORT_W}x${VIEWPORT_H}${NO_WEBGL ? '-nowebgl' : ''}`;
    const file = path.join(os.tmpdir(), `${name}-${suffix}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('截图:', file);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1, mobile: false,
  });
  if (CYLINDER_IMAGE_FAILURE) {
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['*audio/fearless/artwork/presentation.webp*'] });
  }
  await send('Page.navigate', { url: SITE });
  await sleep(7000);

  console.log(`=== 视口 ${VIEWPORT_W}x${VIEWPORT_H}${NO_WEBGL ? ' · 无 WebGL' : ''} ===`);
  check('主内容区已渲染', await evaluate("!!document.querySelector('#main-content')"));
  check('静态或 WebGL 主视觉已渲染', await evaluate("!!document.querySelector('#main-content canvas, #main-content .cylinder-fallback')"));
  check('Loader 已消失', await evaluate("!document.querySelector('.loader') || getComputedStyle(document.querySelector('.loader')).opacity === '0'"));
  if (VIEWPORT_W <= 430) {
    const pageWidth = await evaluate("JSON.stringify({viewport: window.innerWidth, document: document.documentElement.scrollWidth})");
    const dimensions = JSON.parse(pageWidth);
    check('窄屏页面没有横向溢出', dimensions.document <= dimensions.viewport + 1, pageWidth);
  }
  if (CYLINDER_IMAGE_FAILURE) {
    check('损坏 Era 图片触发 stage 图片回退', consoleLogs.some((line) => line.includes('Cylinder image failed; trying the existing stage fallback')));
    check('图片回退后 WebGL 场景仍初始化', await evaluate("!!document.querySelector('#main-content canvas')"));
  }

  if (!NO_WEBGL) {
    console.log('\n--- 3D 主视觉在首屏的分量 ---');
    console.log('圆柱占画面宽度:', await evaluate(`(() => {
      const c = document.querySelector('canvas');
      return JSON.stringify({ canvas: { w: c.clientWidth, h: c.clientHeight }, viewport: { w: window.innerWidth, h: window.innerHeight } });
    })()`));
  }

  console.log('\n=== 1. 顶栏背景音乐开关 + 悬浮播放卡 ===');
  const TOGGLE = '[aria-label="Toggle background music"]';
  console.log('初始 aria-pressed:', await evaluate(`document.querySelector('${TOGGLE}').getAttribute('aria-pressed')`));
  console.log('初始播放卡存在:', await evaluate("!!document.querySelector('.music-dock')"));
  await evaluate(`document.querySelector('${TOGGLE}').click(); 'clicked'`);
  await sleep(3200);
  console.log('点击后 aria-pressed:', await evaluate(`document.querySelector('${TOGGLE}').getAttribute('aria-pressed')`));
  console.log('播放卡几何:', await evaluate(`(() => {
    const d = document.querySelector('.music-dock');
    if (!d) return 'missing';
    const r = d.getBoundingClientRect();
    const bar = d.querySelector('.music-dock-progress input');
    const br = bar.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      widthPctOfScreen: +(r.width / window.innerWidth * 100).toFixed(1),
      progressW: Math.round(br.width),
      progressPctOfScreen: +(br.width / window.innerWidth * 100).toFixed(1)
    });
  })()`));
  console.log('音频状态:', await evaluate(`(async () => {
    const a = document.querySelector('audio');
    return JSON.stringify({ src: (a.currentSrc||'').split('/').slice(-1)[0], paused: a.paused });
  })()`));
  await shot('ts-hero-playing');

  await evaluate(`document.querySelector('${TOGGLE}').click(); 'pause'`);
  await sleep(1200);
  console.log('暂停后播放卡卸载:', await evaluate("!document.querySelector('.music-dock')"));

  console.log('\n=== 2. 播放器抽屉与资源 ===');
  await evaluate("document.querySelector('.chapter-nav button').click(); 'opened'");
  await sleep(1500);
  const drawer = await evaluate(`(() => {
    const d = document.querySelector('.music-drawer');
    if (!d) return null;
    return JSON.stringify({ h: d.clientHeight, vh: window.innerHeight, fills: Math.abs(d.clientHeight - window.innerHeight) < 2, overflowY: getComputedStyle(d).overflowY });
  })()`);
  check('播放器抽屉占满视口', drawer && JSON.parse(drawer).fills, drawer || 'missing');
  check('播放器与曲目滚轮已渲染', await evaluate("!!document.querySelector('.music-main-grid .music-track-cylinder')"));
  check('同步歌词区域已渲染', await evaluate("!!document.querySelector('[data-lyrics-window]')"));
  const carousel = await evaluate(`(() => {
    const strip = document.querySelector('.music-era-strip');
    const items = [...document.querySelectorAll('.music-era-item[data-era-copy="1"]')];
    if (!strip) return null;
    return JSON.stringify({
      count: items.length,
      stripScrollable: strip.scrollWidth > strip.clientWidth + 1,
      stripW: strip.clientWidth,
      contentW: strip.scrollWidth,
      selected: document.querySelectorAll('.music-era-item[data-selected="true"]').length
    });
  })()`);
  check('Era carousel 显示已发现的专辑', carousel && JSON.parse(carousel).count > 0, carousel || 'missing');
  check('当前歌曲信息已显示', await evaluate("Boolean(document.querySelector('.music-center-track-info h1')?.textContent?.trim())"));

  console.log('\n=== 3. 专辑选择与播放控制 ===');
  const selectedEra = await evaluate(`(() => {
    const item = [...document.querySelectorAll('.music-era-item[data-era-copy="1"]')]
      .find((element) => element.getAttribute('aria-label')?.toLowerCase().includes('tortured poets'));
    if (!item) return false;
    item.click();
    return true;
  })()`);
  let selectedAlbumLabel = '';
  for (let attempt = 0; attempt < 25 && !selectedAlbumLabel.toLowerCase().includes('tortured poets'); attempt++) {
    await sleep(200);
    selectedAlbumLabel = await evaluate("document.querySelector('.music-center-track-info p')?.textContent?.trim() || ''");
  }
  check('可选择《The Tortured Poets Department》', selectedEra === true
    && selectedAlbumLabel.toLowerCase().includes('tortured poets'), selectedAlbumLabel || 'not selected');
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await evaluate("document.querySelectorAll('.music-lyric-row').length > 0")) break;
    await sleep(150);
  }
  check('选中曲目后按需加载 LRC 歌词', await evaluate("document.querySelectorAll('.music-lyric-row').length > 0"));
  const beforeNext = await evaluate("document.querySelector('.music-center-track-info h1')?.textContent?.trim()");
  await evaluate("document.querySelector('.music-control-button[aria-label=\\\"Next track\\\"]')?.click(); 'next'");
  let afterNext = beforeNext;
  for (let attempt = 0; attempt < 20 && afterNext === beforeNext; attempt++) {
    await sleep(200);
    afterNext = await evaluate("document.querySelector('.music-center-track-info h1')?.textContent?.trim()");
  }
  check('下一首切换曲目', Boolean(afterNext && beforeNext !== afterNext), `${beforeNext} → ${afterNext}`);
  const lyricStateAfterSwitch = await evaluate("JSON.stringify({track: document.querySelector('.music-cover-composition')?.dataset.trackId, rows: document.querySelectorAll('.music-lyric-row').length})");
  check('切歌时歌词区域与当前曲目同步', Boolean(lyricStateAfterSwitch && JSON.parse(lyricStateAfterSwitch).track), lyricStateAfterSwitch || 'missing');
  await evaluate("document.querySelector('.music-play-toggle')?.click(); 'play'");
  for (let attempt = 0; attempt < 30; attempt++) {
    const ready = await evaluate("(() => { const audio=document.querySelector('audio'); return Boolean(audio && !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA); })()");
    if (ready) break;
    await sleep(150);
  }
  const playerAudio = await evaluate(`(() => {
    const audio = document.querySelector('audio');
    return JSON.stringify({ playing: Boolean(audio && !audio.paused), source: audio?.currentSrc?.split('/').at(-1) || '' });
  })()`);
  check('播放器控制可播放所选音频', playerAudio && JSON.parse(playerAudio).playing, playerAudio || 'missing');
  const rapidStart = await evaluate("document.querySelector('.music-cover-composition')?.dataset.trackId");
  const rapidStartNumber = Number(await evaluate("document.querySelector('.music-track-wheel-row[data-current=\"true\"] .music-track-wheel-number')?.textContent"));
  const rapidClick = await evaluate("document.querySelector('.music-control-button[aria-label=\"Next track\"]')?.click(); document.querySelector('.music-control-button[aria-label=\"Next track\"]')?.click(); 'rapid-next'");
  let rapidState = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    rapidState = await evaluate("JSON.stringify({selected: document.querySelector('.music-cover-composition')?.dataset.trackId, loaded: document.querySelector('audio')?.dataset.trackId, paused: document.querySelector('audio')?.paused})");
    if (rapidState && JSON.parse(rapidState).selected !== rapidStart && JSON.parse(rapidState).selected === JSON.parse(rapidState).loaded) break;
    await sleep(150);
  }
  await sleep(900);
  const rapidEndNumber = Number(await evaluate("document.querySelector('.music-track-wheel-row[data-current=\"true\"] .music-track-wheel-number')?.textContent"));
  check('连续两次下一首确实前进两首', rapidEndNumber === rapidStartNumber + 2, `${rapidStartNumber} → ${rapidEndNumber}`);
  const rapidFinalStateText = await evaluate("JSON.stringify({selected:document.querySelector('.music-cover-composition')?.dataset.trackId,loaded:document.querySelector('audio')?.dataset.trackId,paused:document.querySelector('audio')?.paused})");
  const rapidFinalState = rapidFinalStateText ? JSON.parse(rapidFinalStateText) : null;
  check('连续下一首后切换到新曲目且音频一致', rapidClick === 'rapid-next' && rapidFinalState
    && rapidFinalState.selected !== rapidStart && rapidFinalState.selected === rapidFinalState.loaded,
  rapidFinalState ? JSON.stringify({ changed: rapidFinalState.selected !== rapidStart, synced: rapidFinalState.selected === rapidFinalState.loaded, playing: !rapidFinalState.paused }) : 'missing');
  await evaluate("document.querySelector('.music-control-button[aria-label=\"Previous track\"]')?.click(); 'previous'");
  let previousNumber = rapidEndNumber;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(150);
    previousNumber = Number(await evaluate("document.querySelector('.music-track-wheel-row[data-current=\"true\"] .music-track-wheel-number')?.textContent"));
    if (previousNumber === rapidEndNumber - 1) break;
  }
  check('上一首返回前一曲', previousNumber === rapidEndNumber - 1, `${rapidEndNumber} → ${previousNumber}`);
  for (let attempt = 0; attempt < 25; attempt++) {
    const ready = await evaluate("(() => { const a=document.querySelector('audio'); return !!a && !a.paused && a.volume > 0.1 && !document.querySelector('.music-center-track-info.is-changing'); })()");
    if (ready) break;
    await sleep(150);
  }

  const wrapMetaText = await evaluate(`(async () => {
    const catalog = await (await fetch('/catalog.json')).json();
    const selectedId = document.querySelector('.music-cover-composition')?.dataset.trackId;
    const album = catalog.albums?.find((item) => item.tracks.some((track) => track.id === selectedId));
    return JSON.stringify({
      count: album?.tracks.length || 0,
      index: album?.tracks.findIndex((track) => track.id === selectedId) ?? -1,
      firstId: album?.tracks[0]?.id || '',
    });
  })()`);
  const wrapMeta = wrapMetaText ? JSON.parse(wrapMetaText) : { count: 0, index: -1, firstId: '' };
  let reachedLastTrack = wrapMeta.count > 1 && wrapMeta.index >= 0;
  for (let index = wrapMeta.index + 1; reachedLastTrack && index < wrapMeta.count; index++) {
    await evaluate("document.querySelector('.music-control-button[aria-label=\\\"Next track\\\"]')?.click(); 'next-to-end'");
    let selectedStateText = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      await sleep(100);
      selectedStateText = await evaluate(`(() => {
        const audio = document.querySelector('audio');
        const selected = document.querySelector('.music-cover-composition')?.dataset.trackId;
        const number = Number(document.querySelector('.music-track-wheel-row[data-current="true"] .music-track-wheel-number')?.textContent);
        return JSON.stringify({ number, loaded: audio?.dataset.trackId === selected, playing: Boolean(audio && !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) });
      })()`);
      const selectedState = selectedStateText ? JSON.parse(selectedStateText) : null;
      if (selectedState?.number === index + 1 && selectedState.loaded && selectedState.playing) break;
    }
    const selectedState = selectedStateText ? JSON.parse(selectedStateText) : null;
    reachedLastTrack = selectedState?.number === index + 1 && selectedState.loaded && selectedState.playing;
  }
  const lastTrackControls = await evaluate(`(() => {
    const button = document.querySelector('.music-control-button[aria-label="Next track"]');
    const number = Number(document.querySelector('.music-track-wheel-row[data-current="true"] .music-track-wheel-number')?.textContent);
    return JSON.stringify({ enabled: Boolean(button && !button.disabled), number });
  })()`);
  const lastControls = lastTrackControls ? JSON.parse(lastTrackControls) : { enabled: false, number: 0 };
  check('专辑末尾仍可使用下一首控制', reachedLastTrack && lastControls.enabled && lastControls.number === wrapMeta.count,
    JSON.stringify({ atEnd: reachedLastTrack, enabled: lastControls.enabled, position: lastControls.number, total: wrapMeta.count }));
  const endSeekText = await evaluate(`(() => {
    const audio = document.querySelector('audio');
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0 || audio.paused) {
      return JSON.stringify({ attempted: false, durationKnown: Boolean(audio && Number.isFinite(audio.duration) && audio.duration > 0), playing: Boolean(audio && !audio.paused) });
    }
    audio.currentTime = Math.max(0, audio.duration - 0.12);
    return JSON.stringify({ attempted: true, durationKnown: true, playing: !audio.paused });
  })()`);
  const endSeek = endSeekText ? JSON.parse(endSeekText) : { attempted: false, durationKnown: false, playing: false };
  let wrappedPlaybackText = '';
  if (endSeek.attempted && reachedLastTrack) {
    for (let attempt = 0; attempt < 120; attempt++) {
      wrappedPlaybackText = await evaluate(`(() => {
        const audio = document.querySelector('audio');
        const selected = document.querySelector('.music-cover-composition')?.dataset.trackId;
        const number = Number(document.querySelector('.music-track-wheel-row[data-current="true"] .music-track-wheel-number')?.textContent);
        return JSON.stringify({ first: selected === ${JSON.stringify(wrapMeta.firstId)}, loaded: audio?.dataset.trackId === selected, playing: Boolean(audio && !audio.paused), number });
      })()`);
      if (wrappedPlaybackText) {
        const state = JSON.parse(wrappedPlaybackText);
        if (state.first && state.loaded && state.playing && state.number === 1) break;
      }
      await sleep(100);
    }
  }
  const wrappedPlayback = wrappedPlaybackText ? JSON.parse(wrappedPlaybackText) : null;
  check('顺序播放结束后回到本专辑第一首并继续播放', Boolean(wrappedPlayback?.first && wrappedPlayback.loaded
    && wrappedPlayback.playing && wrappedPlayback.number === 1), JSON.stringify({ endSeek, atEnd: reachedLastTrack, final: wrappedPlayback || 'missing' }));
  for (let attempt = 0; attempt < 30; attempt++) {
    const ready = await evaluate("(() => { const audio=document.querySelector('audio'); return Boolean(audio && !audio.paused && audio.volume > 0.1 && !document.querySelector('.music-center-track-info.is-changing')); })()");
    if (ready) break;
    await sleep(150);
  }

  const seekRect = await evaluate("(() => { const r=document.querySelector('.music-progress-slider')?.getBoundingClientRect(); return r ? JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}) : null; })()");
  if (seekRect) {
    const r = JSON.parse(seekRect);
    const x = r.x + r.w * 0.48;
    const y = r.y + r.h / 2;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(200);
  }
  const seekState = await evaluate("JSON.stringify({time:document.querySelector('audio')?.currentTime,duration:document.querySelector('audio')?.duration})");
  check('拖动进度可跳转音频', seekState && JSON.parse(seekState).duration > 0
    && JSON.parse(seekState).time > JSON.parse(seekState).duration * 0.35,
  seekState ? JSON.stringify({ ratio: +(JSON.parse(seekState).time / JSON.parse(seekState).duration).toFixed(2), durationKnown: JSON.parse(seekState).duration > 0 }) : 'missing');

  await evaluate("document.querySelector('.music-volume-button')?.click(); 'open-volume'");
  for (let attempt = 0; attempt < 15; attempt++) {
    if (await evaluate("getComputedStyle(document.querySelector('.music-volume-popover')).visibility === 'visible'")) break;
    await sleep(100);
  }
  const volumeRect = await evaluate("(() => { const r=document.querySelector('.music-volume-popover input')?.getBoundingClientRect(); return r ? JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}) : null; })()");
  if (volumeRect) {
    const r = JSON.parse(volumeRect);
    const x = r.x + r.w * 0.3;
    const y = r.y + r.h / 2;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(400);
  }
  const volumeState = await evaluate("(() => { const i=document.querySelector('.music-volume-popover input'); const r=i?.getBoundingClientRect(); const hit=r && document.elementFromPoint(r.x+r.width*.3,r.y+r.height/2); return JSON.stringify({slider:i?.value,audio:document.querySelector('audio')?.volume,open:document.querySelector('.music-volume-popover')?.classList.contains('is-open'),rect:r && {x:r.x,y:r.y,w:r.width,h:r.height},hit:hit?.className||hit?.tagName}); })()");
  check('调节音量会改变实际音频音量', volumeState && Math.abs(Number(JSON.parse(volumeState).slider) - JSON.parse(volumeState).audio) < 0.12
    && JSON.parse(volumeState).audio < 0.55, volumeState || 'missing');
  const modeButton = '.music-mode-button';
  const modeLabels = [];
  for (let i = 0; i < 4; i++) {
    modeLabels.push(await evaluate(`document.querySelector('${modeButton}')?.getAttribute('aria-label')`));
    await evaluate(`document.querySelector('${modeButton}')?.click(); 'mode'`);
    await sleep(80);
  }
  check('随机与循环模式可完整轮换', new Set(modeLabels).size === 4, modeLabels.join(' → '));
  await evaluate("document.querySelector('.music-play-toggle')?.click(); 'rapid-pause'");
  await sleep(70);
  await evaluate("document.querySelector('.music-play-toggle')?.click(); 'rapid-play'");
  await sleep(900);
  const rapidPlayback = await evaluate("JSON.stringify({paused:document.querySelector('audio')?.paused,volume:document.querySelector('audio')?.volume,requested:document.querySelector('.music-volume-popover input')?.value})");
  check('快速暂停再播放不会卡在淡出或恢复错误音量', rapidPlayback
    && !JSON.parse(rapidPlayback).paused
    && Math.abs(JSON.parse(rapidPlayback).volume - Number(JSON.parse(rapidPlayback).requested)) < 0.08,
  rapidPlayback || 'missing');
  const beforeRotation = await evaluate("document.querySelector('.music-cover-composition')?.dataset.trackId");
  await evaluate("document.querySelector('.music-rotation-button')?.click(); 'start-rotation'");
  for (let attempt = 0; attempt < 25; attempt++) {
    const state = await evaluate("JSON.stringify({active:document.querySelector('.music-rotation-button')?.getAttribute('aria-pressed'),selected:document.querySelector('.music-cover-composition')?.dataset.trackId,loaded:document.querySelector('audio')?.dataset.trackId})");
    if (state && JSON.parse(state).active === 'true' && JSON.parse(state).selected !== beforeRotation
      && JSON.parse(state).selected === JSON.parse(state).loaded) break;
    await sleep(150);
  }
  const rotationState = await evaluate("JSON.stringify({active:document.querySelector('.music-rotation-button')?.getAttribute('aria-pressed'),selected:document.querySelector('.music-cover-composition')?.dataset.trackId,loaded:document.querySelector('audio')?.dataset.trackId})");
  check('时代轮换切换到对应音频', rotationState && JSON.parse(rotationState).active === 'true'
    && JSON.parse(rotationState).selected !== beforeRotation
    && JSON.parse(rotationState).selected === JSON.parse(rotationState).loaded, `${beforeRotation} → ${rotationState || 'missing'}`);
  await evaluate("document.querySelector('.music-rotation-button')?.click(); 'stop-rotation'");
  check('时代轮换可停止', await evaluate("document.querySelector('.music-rotation-button')?.getAttribute('aria-pressed') === 'false'"));
  await evaluate("document.querySelector('.music-play-toggle')?.click(); 'pause'");
  await sleep(300);
  await shot('ts-drawer-tracks');

  console.log('\n页面异常:', pageErrors.length ? pageErrors.join('\n') : '无');
  console.log('控制台错误:', consoleLogs.filter((l) => l.startsWith('error')).join('\n') || '无');

  await evaluate("document.querySelector('.music-close-button').click(); 'closed'");
  await sleep(900);

  if (!NO_WEBGL) {
    console.log('\n=== 6. 3D 主视觉在页面里的分量 ===');
    for (const p of [0.08, 0.35, 0.6, 0.85]) {
      await evaluate(`(() => {
        const el = document.getElementById('journey');
        const top = el.getBoundingClientRect().top + window.scrollY;
        const span = el.offsetHeight - window.innerHeight;
        window.scrollTo({ top: top + span * ${p}, behavior: 'instant' });
        return 'ok';
      })()`);
      await sleep(2200);
      console.log(`进度 ${(p * 100).toFixed(0)}%  scrollY=${await evaluate('Math.round(window.scrollY)')}`);
      await shot('ts-cylinder-' + Math.round(p * 100));
    }
  }

  await evaluate("window.scrollTo({ top: 0 }); 'top'");
  await sleep(1500);
  await shot('ts-hero');

  ws.close();
  child.kill();
  if (failedChecks.length || pageErrors.length || consoleLogs.some((line) => line.startsWith('error'))) {
    process.exitCode = 1;
    console.error('验证失败:', [...failedChecks, ...pageErrors]);
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
