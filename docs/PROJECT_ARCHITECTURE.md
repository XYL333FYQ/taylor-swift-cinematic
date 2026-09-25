# 项目架构

本项目把网站程序和曲库媒体分开发布。网站由 Cloudflare Pages 构建；音频、歌词、专辑图片和运行时 Catalog 由 Cloudflare R2 提供。开发服务器会在本地扫描 audio/，正式网站不会把这个本地目录打进 dist。

## 数据流

~~~mermaid
flowchart LR
  A["audio/ 本地专辑目录"] --> B["专辑扫描器<br/>plugins/audio-library.ts"]
  B --> C["本地 catalog.json"]
  A --> D["统一同步器<br/>pnpm music:sync"]
  D --> E["R2 albums/<album-id>/ 媒体对象"]
  D --> F["最后发布 catalog.json"]
  E --> G["R2 自定义公开域名"]
  F --> G
  G --> H["CatalogProvider / useCatalog()"]
  H --> I["3D Cylinder、Eras Corridor、EraIndex"]
  H --> J["MusicPlayer、专辑轮播、歌词面板"]
  K["public/theme/ 网站主题图片"] --> L["Pages 构建输出 dist/"]
~~~

## 开发环境与生产环境

### 开发环境

- Vite 插件在启动时扫描 audio/，递归发现支持的音频、LRC 和图片。
- 扫描结果写到仓库根目录的 catalog.json；这是被 Git 忽略的生成文件。
- Vite 通过本地中间件提供 /audio/... 媒体，并支持 Range 请求。文件变化后重新扫描并向 React 发送 catalog-updated 事件。
- 没有本地专辑时，CatalogProvider 显示空曲库说明。克隆仓库不需要先下载音乐才可以启动开发服务器。

### 生产环境

- Pages 只构建网站代码和 public/ 下允许发布的站点资源，不扫描 audio/。
- 浏览器启动后从 VITE_CATALOG_URL 获取 R2 上的 catalog.json。
- 专辑曲目、封面、展示图和歌词以 albums/<album-id>/... 相对对象键写在 Catalog 中；图片与音频通过同一个 URL 解析函数转换为公开域名上的地址。
- 若生产 Catalog 为空，页面显示空曲库说明；若请求失败或环境变量缺失，页面显示 Catalog 不可用状态。

## 单一的专辑与曲目运行时模型

plugins/audio-library.ts 输出扫描后的专辑和曲目数据。src/data/catalog.ts 定义浏览器唯一使用的 Album、Track 和 Catalog 类型；src/data/CatalogProvider.tsx 读取并规范化 Catalog，src/data/catalog.ts 的 useCatalog() 为页面组件提供数据。

CatalogProvider 从专辑日期生成显示年份和顺序编号，并计算年份范围与轮换播放列表。Navigation、CylinderExperience、ErasCorridor、EraIndex、EraCarousel、MusicPlayer 和播放器控制器都消费同一个 Catalog，不再依赖手动维护的 ERA 或曲目静态清单。

Cylinder、Corridor、Index 和播放器的专辑列表随 Catalog 更新。SpotlightEra 当前是固定策划章节，文案放在双语文案模块中；添加专辑不会自动改写该章节。

## 媒体 URL 解析

src/data/media.ts 是统一 URL 边界：

- http、https、blob 和 data URL 直接保留。
- theme/ 开头的 key 解析到 Pages 部署内的 public/theme/ 图片。
- 开发环境的 audio/... key 使用 Vite 本地服务。
- 生产环境的专辑媒体 key 相对于 VITE_CATALOG_URL 解析到 R2 公开域名。

这让专辑媒体替换与网站主题图片替换走不同发布路径。更换封面、展示图、曲目图或歌词后运行 music:sync；更换 Hero、Portal、Spotlight 或 Finale 的站点主题文件后，需要重新构建并部署网站。

## Catalog 与 R2 同步

同步器从扫描结果生成公开 Catalog 和所需媒体对象。曲目内嵌的同步歌词会在发布时转成单独的 LRC 对象，不把整份歌词正文写进 catalog.json。媒体使用内容摘要生成修订查询参数；R2 媒体上传并通过 HeadObject 检查后，才发布 Catalog。远端清理由同一状态文件和严格管理的 albums/ 键空间限制。具体门槛见 [音乐同步器](MUSIC_SYNC.md)。

## 两类发布互不依赖

代码或 public/theme/ 文件变化需要 Pages 重新构建；仅更改 audio/ 下的专辑资源时，运行 music:sync 更新 R2 即可，网站代码不需要重新构建。Pages 环境只需要公开的 VITE_CATALOG_URL，不需要 R2 写入凭证；写入凭证只供本地同步命令使用。
