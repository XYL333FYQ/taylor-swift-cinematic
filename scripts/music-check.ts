import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { inspectIncoming } from './music-upload-core.ts';

export async function runMusicCheck(root = process.cwd()): Promise<boolean> {
  const { albums, issues } = await inspectIncoming(root);
  console.log('[music:check] incoming/ 检查报告');
  for (const issue of issues) console.log(`${issue.level === 'error' ? '❌ error' : '⚠️ warning'} ${issue.album}：${issue.message}`);
  const errors = issues.filter((issue) => issue.level === 'error');
  const globalError = errors.some((issue) => issue.album === 'incoming/' || issue.album === '扫描器');
  const ready = globalError ? [] : albums.filter((album) => !errors.some((issue) => issue.album === album.folder));
  console.log(`[music:check] 可以上传的专辑（${ready.length}）：`);
  for (const album of ready) console.log(`  ${album.name.en}（${album.folder}/，${album.tracks.length} 首）`);
  if (errors.length) {
    console.log(`[music:check] 本批次共有 ${errors.length} 个 error；请全部修复后再上传。`);
    return false;
  }
  if (!issues.length) console.log('[music:check] 没有缺失内容或警告。');
  return true;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== '--')) throw new Error('用法：pnpm music:check');
    if (!(await runMusicCheck())) process.exitCode = 1;
  } catch (error) {
    console.error(`[music:check] ❌ error：${error instanceof Error ? error.message : '检查失败。'}`);
    process.exitCode = 1;
  }
}
