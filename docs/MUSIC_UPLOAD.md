# 日常专辑上传助手

`music:upload` 适合本地只保存待上传专辑的工作方式。R2 当前 `catalog.json` 是已有音乐的依据；本地 `incoming/` 只提供本次新资产。工具不会自动删除云端媒体，也不会因本地缺少旧专辑而删除 Catalog 记录。

若本地 `audio/` 保存完整曲库，并希望同步新增、修改、删除，请使用 [`music:sync`](MUSIC_SYNC.md)。两个命令共用扫描规则和 R2 目标锁，但用途不同。

## 准备文件

~~~text
incoming/
  专辑A/
    album.json
    artwork/
      cover.jpg
      presentation.jpg  （可选）
    歌曲文件夹1/
      01 song.flac
      01 song.lrc     （可选）
      01 song.jpg     （可选）
~~~

`album.json` 沿用项目现有格式，参见 [字段说明](ALBUM_METADATA.md)。上传助手要求明确填写稳定的 `id`、可显示的 `name`、有效 `releaseDate` 或 `year`、`color`，并找到专辑封面及至少一首可读取音频。这些信息直接影响网页标题、排序、主题与播放。`artist`、`genre`、`description`、`tagline`、`quote`、`colorAccent` 及独立展示图是推荐项；歌词与单曲图片缺失只产生 warning。已填写的字段如果类型不符合现有格式，属于 error。

## 命令

先依照 [R2 配置](CLOUDFLARE_R2.md)在本机 `.env.local` 填写现有的 `R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`；可选 `R2_ENDPOINT`。无需新增环境变量。写入密钥不要放到 Pages 的 `VITE_` 变量中。

~~~sh
pnpm music:upload --dry-run
pnpm music:upload
pnpm music:check
~~~

Windows PowerShell 可使用 `pnpm.cmd`。`music:check` 只扫描本地 `incoming/` 并输出 error、warning 和可以上传的专辑，不需要 R2 凭证。预览模式会读取 R2 Catalog、检查资源与重复歌曲，列出计划，但不会上传、发布或移动文件。正式运行先显示 error/warning 报告，遇到同 ID 但音频内容不同的歌曲会要求逐首选择 `replace` 或 `skip`，默认跳过；最后输入 `yes` 才开始写入。

## 合并和恢复

- 新专辑：添加到云端 Catalog；先上传并验证音频、歌词和图片，最后发布 Catalog。
- 首次使用：若 R2 尚无 `catalog.json`，上传助手会从本次新专辑创建 `{ "albums": [...] }`，不要求预先运行完整同步。
- 已有专辑的新歌曲：只追加歌曲；云端已有专辑名称、颜色、图片、旧曲目等保持原样。
- 同 ID 同内容：跳过，不重复写入。
- 同 ID 不同内容：必须在交互式终端选择替换；跳过时不改动云端。选择替换后保留旧歌曲的其他元数据，只有新提供的可选资源才会更新。
- 上传失败：Catalog 不发布，`incoming/` 保留；修复后重新运行，已在 R2 且内容相同的资源会跳过。若 Catalog 并发变化，条件写入会拒绝旧版本，请重新预览并运行。
- 发布成功：核对 R2 Catalog 后，把 `incoming/Album/` 原样移到忽略 Git 的 `uploaded/Album/`，内部文件与层级保持不变。若 `uploaded/Album/` 已存在，上传前会报 error，避免覆盖旧归档；若移动阶段失败，云端可能已发布，请先查看报告和 R2，再重试。

`music:upload` 不更新 `music:sync` 的本地同步状态。之后若要切回完整同步，请先确保 `audio/` 真正包含完整云端曲库，并留意同步器的删除预览与 `--force` 安全提示。

日常云端优先使用时，`audio/` 可以保持为空。上传并核对云端 Catalog 和媒体后，`uploaded/Album/` 是可自行清理的本地副本；删除后请记住 R2 将是这份音乐的唯一副本，按需要另做备份。仓库中的 `.gitkeep` 只保留空目录结构，音乐文件仍被 Git 忽略。
