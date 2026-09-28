import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createMusicR2Store } from './music-r2-store.ts';
import { uploadMusic, type UploadConflict, type UploadReport } from './music-upload-core.ts';

function printReport(report: UploadReport, phase: 'preflight' | 'plan'): void {
  if (phase === 'preflight') {
    console.log('\n[music:upload] 检查报告');
    for (const issue of report.issues) console.log(`${issue.level === 'error' ? '❌' : '⚠️'} ${issue.album}：${issue.message}`);
    if (!report.issues.length) console.log('没有发现格式或资源问题。');
    for (const album of report.newAlbums) console.log(`➕ 新专辑：${album}`);
    for (const track of report.newTracks) console.log(`➕ 新歌曲：${track}`);
    for (const track of report.duplicates) console.log(`⏭️ 内容相同，跳过：${track}`);
    for (const track of report.changed) console.log(`⚠️ 同 ID 音频内容不同：${track.album} / ${track.track}`);
    return;
  }
  for (const track of report.replacements) console.log(`🔄 已选择替换：${track}`);
  console.log(`待上传资源 ${report.mediaUploads.length} 个；catalog ${report.catalogChanged ? '将更新' : '无需更新'}。`);
  if (report.dryRun) console.log('预览模式：不会上传、发布 catalog 或移动本地文件。');
}

async function askReplacement(conflict: UploadConflict): Promise<'replace' | 'skip'> {
  if (!stdin.isTTY) throw new Error(`同 ID 歌曲内容变化：${conflict.album} / ${conflict.track}。请在交互式终端选择替换或跳过。`);
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`同 ID 歌曲「${conflict.album} / ${conflict.track}」内容变化。输入 replace 替换，或 skip 跳过（默认）：`);
    return answer.trim().toLowerCase() === 'replace' ? 'replace' : 'skip';
  } finally { prompt.close(); }
}

async function confirm(): Promise<boolean> {
  if (!stdin.isTTY) throw new Error('请在交互式终端确认上传；也可以先运行 pnpm music:upload --dry-run 预览。');
  const prompt = createInterface({ input: stdin, output: stdout });
  try { return (await prompt.question('确认上传、发布 catalog，并将处理过的专辑移至 uploaded/？输入 yes 继续：')).trim().toLowerCase() === 'yes'; }
  finally { prompt.close(); }
}

export async function runMusicUpload(dryRun = false): Promise<UploadReport> {
  const { target, store } = createMusicR2Store();
  try {
    const report = await uploadMusic(process.cwd(), target, store, {
      dryRun,
      onReport: printReport,
      chooseReplacement: askReplacement,
      confirm,
      onLockWait: () => console.log('[music:upload] 同一 R2 目标正在同步；等待锁释放。'),
      onUpload: (key) => console.log(`[music:upload] 已上传 ${key}`),
    });
    if (!dryRun) console.log(`[music:upload] 完成；${report.archived.length} 个本地专辑已移至 uploaded/。`);
    return report;
  } finally { store.close(); }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    if (args.some((arg) => arg !== '--dry-run') || args.length > 1) throw new Error('用法：pnpm music:upload [--dry-run]');
    await runMusicUpload(args.includes('--dry-run'));
  } catch (error) {
    console.error(`[music:upload] ${error instanceof Error ? error.message : '上传失败。'}`);
    process.exitCode = 1;
  }
}
