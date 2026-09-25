# 常见故障排查

先区分是浏览器取 Catalog、媒体对象、R2 CORS 还是 Pages 构建问题。记录完整 URL、HTTP 状态、响应头和终端警告，再按下表处理。

## 本地开发与扫描

### 开发服务器无法启动

- **现象：** pnpm dev 退出或 Vite 无法绑定端口。
- **常见原因：** Node 低于项目要求、依赖未安装、5173 端口被占用或本机安全软件拦截。
- **验证方法：** 查看 node --version、pnpm --version、终端第一条错误以及 5173 端口占用情况。
- **解决步骤：** 使用满足 package.json engines 的 Node；运行 pnpm install；关闭占用端口的旧开发服务器后再启动。

### 缺少环境变量

- **现象：** music:sync 报 Missing R2_*；生产页面显示 Album catalog unavailable。
- **常见原因：** 未复制 .env.example 到 .env.local、变量名拼写错误或 Pages Production 没设 VITE_CATALOG_URL。
- **验证方法：** 只检查变量是否存在，不要在日志或截图中打印 Secret；查看 Pages 当前 Production 环境变量名称。
- **解决步骤：** 本地填写 .env.local；Pages 只配置公开 VITE_CATALOG_URL。不要把写入凭证改成 VITE_ 变量。

### 专辑未自动发现

- **现象：** 目录里的专辑没有出现在本地 Catalog。
- **常见原因：** 专辑不是 audio/ 的直接子目录、文件扩展名不支持、专辑内没有音频且 album.json 为空，或文件复制尚未完成。
- **验证方法：** 看 Vite 终端的扫描专辑/曲目数量和 [audio-library] 警告；检查根目录是否生成了 catalog.json。
- **解决步骤：** 把每张专辑放入 audio/<专辑名>/；检查实际扩展名；等待文件写入结束或用 music:watch 的稳定监听。

### 图片匹配错误

- **现象：** 曲目关联了错误的歌词/图片，或扫描器跳过图片。
- **常见原因：** 同名资源在多个目录出现，多个曲目匹配一个资源，或缺少碟号/音轨号导致候选不唯一。
- **验证方法：** 查看包含 ambiguous、matches multiple tracks、no unique match 的扫描警告。
- **解决步骤：** 文件名包含一致的音轨编号；将媒体放在与音频相同的子目录；必要时用 album.json tracks 显式绑定路径。

### 新专辑没有出现在页面

- **现象：** 本地或线上页面没有新专辑。
- **常见原因：** 本地扫描未生成 Catalog，R2 同步没发布 Catalog，浏览器请求了另一个 Catalog URL，或数据仍在缓存窗口内。
- **验证方法：** 本地查看 catalog.json；线上 Network 面板检查 VITE_CATALOG_URL 返回的 JSON 是否包含新 album id。
- **解决步骤：** 本地等待 Vite 重扫；线上检查 music:sync 完成日志和 Pages Production 变量；确认正确域名后刷新。

### 开发环境不含音乐

- **现象：** 页面显示空曲库提示。
- **常见原因：** 仓库不分发个人音频，或 audio/ 目录尚未添加媒体。
- **验证方法：** 确认页面提示而非 Catalog 请求失败；查看 audio/ 目录中是否有专辑子目录。
- **解决步骤：** 按 [添加专辑](ADD_ALBUMS.md) 放入合法媒体。空曲库提示是正常状态，不会自动下载项目作者的音乐。

## R2 与媒体读取

### 无法连接 R2

- **现象：** S3 请求超时、签名失败或 DNS 错误。
- **常见原因：** Account ID、Endpoint、区域或网络代理错误。
- **验证方法：** 对照 R2 API Token 页面显示的 S3 Endpoint；确认 Endpoint 不含 Bucket 路径。
- **解决步骤：** 修正 R2_ENDPOINT 或 R2_ACCOUNT_ID 后重试；不要更改远端内容来测试连通性。

### Access Denied（403）

- **现象：** HeadObject、PutObject 或公开媒体请求返回 403。
- **常见原因：** Token 未限定到目标 Bucket、权限不足、公开域名未启用或 Origin 不匹配。
- **验证方法：** 根据出错 URL 判断是 S3 写入凭证还是公开 GET；核对 Bucket 与 Token 的授权范围。
- **解决步骤：** 重新创建仅作用于目标 Bucket 的 Object Read & Write S3 Token；公开读取则检查 Bucket Custom Domain 与 CORS。不要把 S3 Secret 贴入 Issue。

### 404

- **现象：** catalog.json 或媒体对象返回 404。
- **常见原因：** Catalog URL 错误、未完成首次同步、对象键与稳定 ID 不一致或大小写/扩展名不同。
- **验证方法：** 在 Catalog 中复制对象 key，拼接公开域名后逐个请求。
- **解决步骤：** 检查 .env.local 目标 Bucket 与 Pages URL；有受管状态时安全运行 music:sync 补齐。不要从 Catalog 中猜测并手动删除对象。

### CORS 错误

- **现象：** 浏览器控制台报告 blocked by CORS policy。
- **常见原因：** AllowedOrigins 没有精确包含网站 Origin、R2 对象被旧 Cache Rule 缓存，或自定义域名的 CORS 未配置。
- **验证方法：** 使用带 Origin 请求头的 curl.exe 检查 Access-Control-Allow-Origin，并分别检查 Catalog、图片和媒体。
- **解决步骤：** 在 R2 CORS 中设置确切 scheme://host、GET/HEAD、Range 和需要暴露的响应头；修改后清理旧缓存再测。

### 浏览器显示图片，但 WebGL 不显示

- **现象：** DOM 中的图片可见，Cylinder 的纹理失败。
- **常见原因：** 图片请求没有允许跨源 Canvas 使用的 CORS 响应；也可能是 WebGL/纹理尺寸或图像解码失败。
- **验证方法：** 检查 Cylinder 图片请求的响应头与控制台；图片在普通 img 中显示本身不足以证明 Canvas 可读。
- **解决步骤：** 先修正 R2 CORS，再单独验证图片尺寸与 WebGL 上限。不要仅凭现象直接修改圆柱几何。

### 音频加载失败

- **现象：** 曲目列表出现但播放报错或一直等待。
- **常见原因：** track.file 的对象不存在、R2 域名不可达、文件格式或 Content-Type 错误。
- **验证方法：** 检查 Catalog 的 file URL 和 Network 响应状态；确认对应 object key 存在。
- **解决步骤：** 在本地确认音频可解码；重新运行音乐同步前先核对 Bucket、状态文件和变更计划。

### 音频 Range 请求失败

- **现象：** 音频可以打开却无法拖动，或播放器提示媒体错误。
- **常见原因：** CDN/源站不支持 Range、代理去掉 Range 请求头，或响应返回完整 200 而非 206。
- **验证方法：** 对公开音频执行 Range: bytes=0-1023 请求，检查 HTTP 206、Accept-Ranges 与 Content-Range。
- **解决步骤：** 保留 Range 头并确保公开源支持部分响应；按 [R2 配置](CLOUDFLARE_R2.md) 检查 CORS 和域名配置。

### 歌词不同步

- **现象：** 歌词提前、滞后、整首不高亮或未出现。
- **常见原因：** LRC 时间戳错误、时间偏移、文件匹配歧义或当前曲目没有歌词 URL。
- **验证方法：** 看 Catalog 的 lyricsUrl 和 Network 请求；本地检查 .lrc 编码、时间戳及扫描警告。
- **解决步骤：** 使用 [LYRICS_AND_AUDIO.md](LYRICS_AND_AUDIO.md) 示例格式；通过 [offset:+/-毫秒数] 微调；为重复曲目用 manifest 显式绑定。

### Catalog 已更新但浏览器仍是旧数据

- **现象：** R2 Catalog 文件内容已变化，页面仍显示旧名称、曲目或图片。
- **常见原因：** Pages 指向另一个 VITE_CATALOG_URL、旧响应在 CDN/浏览器缓存、同步 Catalog 上传失败或生产页面尚未刷新。
- **验证方法：** Network 面板查看实际请求 URL、状态、响应 JSON、Age/Cache 状态和时间。
- **解决步骤：** 先确认目标地址与 music:sync 完成日志；清理旧 Catalog 缓存后重载。CatalogProvider 使用 no-store 读取，但 CDN 配置仍应保持 Catalog 短缓存。

### 替换后仍显示旧图片

- **现象：** 图片文件已替换，线上仍显示旧图。
- **常见原因：** Catalog 的版本查询参数没更新、Cache Rule 忽略 query string，或改的是不被对应组件使用的资源类型。
- **验证方法：** 比较 Catalog 中媒体 URL 的 ?v= 修订值，并检查 Cloudflare cache key 设置。
- **解决步骤：** 确认源文件内容变化并运行 music:sync；让 query string 参与缓存 key。网站主题图片则需重新构建部署。

### 同步器每次都重复上传

- **现象：** 日志持续显示大量新增或修改对象。
- **常见原因：** .music-cache/sync-state.json 不存在、状态指向另一个 Endpoint/Bucket、音频被批量重写，或本地写入工具反复更改时间/内容。
- **验证方法：** 核对状态文件目标字段和上传对象数量；不要输出或提交 .env.local。
- **解决步骤：** 从备份恢复正确状态；若状态丢失，按 MUSIC_SYNC.md 先评估重新上传成本，不要立即对大型 Bucket 运行同步。

### 本地同步状态损坏

- **现象：** 同步器报告 invalid state、target mismatch 或 managed object history 错误。
- **常见原因：** 状态文件 JSON 截断、不同 Bucket 共用一份状态或被手工改写。
- **验证方法：** 检查错误指向的状态文件路径和目标名称，不打印秘密。
- **解决步骤：** 停止写入操作并从与目标 Bucket 匹配的备份恢复；不要删掉状态来让同步“继续”。

### 扫描警告或目录异常

- **现象：** 某些歌词/图片被跳过，或清理要求人工确认。
- **常见原因：** 不可读目录、空文件、非唯一资源匹配或冲突元数据。
- **验证方法：** 检查 [audio-library] 警告；无警告与只有可选资源跳过要区分。
- **解决步骤：** 先修正曲库结构。警告会阻止自动删除；需要继续清理时必须审阅当轮对象并输入准确确认码。扫描失败、audio/ 丢失或扫描为空会中止同步。

## Pages 与浏览器

### Cloudflare Pages 构建失败

- **现象：** GitHub 推送触发 Pages，但 Build failed。
- **常见原因：** 根目录、安装命令、构建输出目录、Node/pnpm 版本或依赖锁文件不匹配。
- **验证方法：** 打开该 Deployment 的完整 Build log，确认失败发生在 install、typecheck 还是 vite build。
- **解决步骤：** 根目录设为仓库根，Build command 为 pnpm build，Output directory 为 dist；使用支持 lockfile 的 pnpm。

### Node/pnpm 版本不兼容

- **现象：** Vite 提示 Node 版本不满足、Node 命令参数未知，或 pnpm 拒绝 lockfile。
- **常见原因：** Node 低于 package.json engines、使用了过旧的 Cloudflare build image，或更换了不兼容 pnpm。
- **验证方法：** 对照本地 node --version、pnpm --version 与 Cloudflare Build log；查看当前 Pages Build Image 文档。
- **解决步骤：** 安装满足 Node 下限的维护中 LTS；Cloudflare 侧通过 NODE_VERSION / PNPM_VERSION 或版本文件显式设置；之后用 frozen-lockfile 安装确认。

### Git 自动部署覆盖 Wrangler 直接部署

- **现象：** 手动 Wrangler 发布的 Production 随后变成旧页面。
- **常见原因：** main 的 Git build 在 Wrangler 发布后完成，按 Git commit 重新构建并更新 Production。
- **验证方法：** 在 Pages Deployments 对比部署来源、SHA 和完成时间；Wrangler 发布不会更新 GitHub commit。
- **解决步骤：** 先将目标代码提交并推送到 main，再等待对应 Git Production build。避免在 Git 源仍为旧代码时以 Wrangler 作为长期来源。

### 线上与本地界面不同

- **现象：** 本地页面有专辑，线上空白、缺图或展示不同。
- **常见原因：** 本地 Catalog 来自 audio/，线上 Catalog 来自 VITE_CATALOG_URL；主题图片随 Pages，专辑图来自 R2。
- **验证方法：** 比对两个环境加载的 Catalog URL、album id 和图片地址。
- **解决步骤：** 线上确认变量、R2 Catalog 与 Pages commit；不要期望本地 audio/ 自动上传或自动成为线上曲库。

### WebGL 圆柱出现裁切异常

- **现象：** 圆柱图像超出画布、边缘被裁，或不同视口表现不一。
- **常见原因：** 仅凭现象无法确定。可能需要调查视口/缩放、设备纹理能力、CSS 包围盒、图片加载以及 GSAP ScrollTrigger 刷新时序。
- **验证方法：** 固定浏览器缩放和窗口尺寸，记录桌面/移动视口、canvas 与容器尺寸、WebGL 错误、图片请求、页面滚动进度和截图；对比同一提交。
- **解决步骤：** 先在最新源码上复现并隔离 CSS、图像与动画时序；一次只验证一个假设。没有证据前不要随机改 Cylinder 的半径、尺寸或动画。
