import { stdin } from 'node:process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { select, checkbox, input } from '@inquirer/prompts';
import { createMusicR2Store } from './music-r2-store.ts';
import { uploadMusic, discoverUploadCandidates, type UploadCandidate, type UploadConflict, type UploadReport } from './music-upload-core.ts';
import type { PublishedAlbum } from './music-remote-catalog.ts';

function printReport(report: UploadReport, phase: 'preflight' | 'plan'): void {
  if (phase === 'preflight') {
    console.log('\n[music:upload] 检查报告');
    if (report.targetAlbum) console.log(`目标专辑：${report.targetAlbum.name}（${report.targetAlbum.id}）；追加本次歌曲。`);
    for (const issue of report.issues) console.log(`${issue.level === 'error' ? '❌' : '⚠️'} ${issue.album}：${issue.message}`);
    if (!report.issues.length) console.log('没有发现格式或资源问题。');
    for (const album of report.newAlbums) console.log(`➕ 新专辑：${album}`);
    for (const track of report.newTracks) console.log(`➕ 新歌曲：${track}`);
    for (const track of report.duplicates) console.log(`⏭️ 内容相同，跳过：${track}`);
    for (const track of report.changed) console.log(`⚠️ 同 ID 音频内容不同：${track.album} / ${track.track}`);
    return;
  }
  for (const track of report.replacements) console.log(`🔄 已选择替换：${track}`);
  for (const track of report.changed) {
    if (!report.replacements.includes(`${track.album} / ${track.track}`)) console.log(`⏭️ 跳过变化歌曲：${track.track}；原文件留在 incoming/。`);
  }
  console.log(`本次已选择 ${report.selectedSources?.length ?? report.newAlbums.length + report.newTracks.length} 项，共 ${report.selectedTrackCount ?? 0} 首歌曲。`);
  console.log(`待上传资源 ${report.mediaUploads.length} 个；catalog ${report.catalogChanged ? '将更新' : '无需更新'}。`);
  console.log('成功处理后归档至：');
  for (const location of report.archivePaths ?? []) console.log(`  ${location}`);
  if (!report.archivePaths?.length) console.log('  本次没有需要归档的内容；跳过的歌曲留在 incoming/。');
  if (report.dryRun) console.log('预览模式：不会上传、发布 catalog 或移动本地文件。');
}

async function chooseAlbum(albums: PublishedAlbum[]): Promise<string | null> {
  if (!stdin.isTTY) throw new Error('请选择目标专辑：在交互式终端运行，或使用 --album <云端专辑ID>；非交互式预览请同时加 --dry-run。');
  return select<string | null>({ message: '这些歌曲要追加到哪张云端专辑？', pageSize: 14,
    choices: [...albums.map((album) => ({ name: `${album.name.en} / ${album.name.zh}（${album.id}，${album.tracks.length} 首）`, value: album.id })),
      { name: '取消', value: null }] });
}

async function askReplacement(conflict: UploadConflict): Promise<'replace' | 'skip'> {
  if (!stdin.isTTY) throw new Error(`同 ID 歌曲内容变化：${conflict.album} / ${conflict.track}。请在交互式终端选择替换或跳过。`);
  return select({ message: `同 ID 歌曲「${conflict.album} / ${conflict.track}」内容变化，如何处理？`, default: 'skip',
    choices: [{ name: '跳过，保留本地文件', value: 'skip' as const }, { name: '替换云端歌曲', value: 'replace' as const }] });
}

async function confirm(): Promise<boolean> {
  if (!stdin.isTTY) throw new Error('请在交互式终端确认上传；也可以先运行 pnpm music:upload --dry-run 预览。');
  return (await input({ message: '确认上传、发布 catalog，并归档成功处理的内容？输入 yes 继续，其他输入取消：' })).trim().toLowerCase() === 'yes';
}

export async function chooseUploadItems(candidates: UploadCandidate[], mode: 'albums' | 'tracks'): Promise<string[]> {
  for (const candidate of candidates) {
    for (const issue of candidate.issues.filter((item) => item.level === 'error')) console.log(`❌ ${candidate.path}：${issue.message}`);
  }
  if (!candidates.some((candidate) => !candidate.issues.some((issue) => issue.level === 'error')))
    throw new Error(`没有符合规范的${mode === 'albums' ? '专辑' : '歌曲'}；请修复上方问题。ZIP 需要先解压。`);
  return checkbox({ message: `勾选本次要上传的${mode === 'albums' ? '专辑' : '歌曲'}（上下键移动，空格勾选，a 全选，回车继续）`,
    validate: (choices) => choices.length > 0 || '请用空格至少勾选一项，或按 Ctrl+C 退出。', pageSize: 12,
    theme: { style: { keysHelpTip: () => '↑↓ 移动 · 空格勾选 · a 全选/取消全选 · 回车继续 · Ctrl+C 退出' } },
    choices: candidates.map((candidate) => {
      const errors = candidate.issues.filter((issue) => issue.level === 'error');
      const warnings = candidate.issues.length - errors.length;
      return { name: `${candidate.title}（${candidate.path}，${candidate.trackCount} 首${errors.length ? `，${errors.length} 个错误` : ''}${warnings ? `，${warnings} 个提醒` : ''}）`,
        value: candidate.path, checked: false, disabled: errors[0]?.message,
        description: candidate.issues.map((issue) => issue.message).join('\n') };
    }) });
}

export async function runMusicUpload(dryRun = false, albumId?: string): Promise<UploadReport | undefined> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`[music:upload] 扫描目录：${resolve(root, 'incoming')}`);
  if (!stdin.isTTY && !(dryRun && albumId)) throw new Error('请在交互式终端运行上传向导；非交互式预览请使用 --dry-run --album <云端专辑ID>。');
  const mode = albumId ? 'tracks' : await select({ message: '请选择上传方式：', choices: [
    { name: '上传新专辑', value: 'albums' as const }, { name: '给已有专辑追加歌曲', value: 'tracks' as const }, { name: '退出', value: 'exit' as const },
  ] });
  if (mode === 'exit') { console.log('[music:upload] 已退出。'); return; }
  const candidates = await discoverUploadCandidates(root, mode);
  if (!candidates.length) throw new Error('没有找到待上传内容。请放入专辑文件夹或解压后的歌曲；ZIP 不会自动解压。');
  const selectedPaths = stdin.isTTY ? await chooseUploadItems(candidates, mode) : candidates.map((candidate) => candidate.path);
  const { target, store } = createMusicR2Store();
  try {
    const report = await uploadMusic(root, target, store, {
      mode,
      selectedPaths,
      dryRun,
      albumId,
      chooseAlbum,
      onReport: printReport,
      chooseReplacement: stdin.isTTY ? askReplacement : undefined,
      confirm,
      onLockWait: () => console.log('[music:upload] 同一 R2 目标正在同步；等待锁释放。'),
      onUpload: (key) => console.log(`[music:upload] 已上传 ${key}`),
    });
    if (!dryRun) console.log(`[music:upload] 完成；成功处理的内容已按原相对路径归档，共涉及 ${report.archived.length} 个顶层文件或目录。`);
    return report;
  } finally { store.close(); }
}

export function parseUploadArgs(args: string[]): { dryRun: boolean; albumId?: string } {
  let dryRun = false;
  let albumId: string | undefined;
  const usage = '用法：pnpm music:upload [--dry-run] [--album <云端专辑ID>]';
  const values = args.filter((arg) => arg !== '--');
  for (let index = 0; index < values.length; index++) {
    const arg = values[index];
    if (arg === '--dry-run' && !dryRun) dryRun = true;
    else if (arg === '--album' && !albumId) {
      albumId = values[++index];
      if (!albumId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(albumId)) throw new Error(usage);
    } else throw new Error(usage);
  }
  return { dryRun, albumId };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    const options = parseUploadArgs(process.argv.slice(2));
    await runMusicUpload(options.dryRun, options.albumId);
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') { console.log('[music:upload] 用户退出；尚未开始上传。'); process.exitCode = 0; }
    else {
      console.error(`[music:upload] ${error instanceof Error ? error.message : '上传失败。'}`);
      process.exitCode = 1;
    }
  }
}
