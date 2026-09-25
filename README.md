# Taylor Swift Cinematic

[English](README_EN.md) | 中文

一个以专辑时代为线索的沉浸式 3D 音乐档案馆。项目把音乐资料整理成可浏览的视觉旅程：访问者可以沿时代长廊探索专辑，在动态 3D 圆柱中切换时代，再通过黑胶风格播放器聆听曲目并查看同步歌词。

> 非官方粉丝项目，不隶属于 Taylor Swift 或其代表，也未获得其认可。

> **在线演示：** [meimei.eren.cc.cd](https://meimei.eren.cc.cd) · **公开媒体与 Catalog：** [music.eren.cc.cd](https://music.eren.cc.cd)
>
> 演示站使用的媒体、照片和站点标识权利与本项目代码分开。请阅读[第三方素材清单](docs/THIRD_PARTY_ASSETS.md)；当前仍有素材没有再分发许可证明。

## 项目特点

- **3D 时代圆柱：** 以 OGL / WebGL 展示 Catalog 中的专辑展示图，可随专辑数量动态生成。
- **时代时间长廊与 EraIndex：** 按 Catalog 展示专辑、年份、文案和曲目索引。
- **动态专辑导航：** 新增专辑后由扫描器和 Catalog 自动发现，不必逐个修改 React 展示组件。
- **黑胶唱片播放器：** 播放曲目、切换专辑和曲目、显示播放进度与专辑封面。
- **同步歌词：** 支持外部 LRC 和可读取的同步内嵌歌词，可随播放进度高亮和跳转。
- **中英文界面与响应式布局：** 页面文案支持中英文，布局适配桌面和窄屏设备。
- **分离的媒体发布：** Cloudflare Pages 发布网站；Cloudflare R2 保存音频、歌词、专辑图片和 Catalog。媒体更新通常不需要重建网站。

这与普通播放列表的差别在于：专辑是可探索的空间和叙事入口，播放器则与这份动态档案共享曲目数据。

## 预览

在线演示：[https://meimei.eren.cc.cd](https://meimei.eren.cc.cd)

<!-- 截图待补：仅添加已获再分发许可、且不包含未授权音乐/歌词/艺人照片的截图。 -->

## 技术架构

| 层 | 技术 | 职责 |
| --- | --- | --- |
| 界面 | React、TypeScript、Tailwind CSS | 页面、播放器和双语交互 |
| 动画 | GSAP | 页面过渡与滚动驱动动画 |
| 图形 | OGL、WebGL | 时代圆柱及图片纹理 |
| 构建 | Vite、@vitejs/plugin-react-swc | 开发服务器与静态构建 |
| 媒体扫描 | Node.js、music-metadata | 扫描本地音频、标签、歌词和图片 |
| 媒体存储 | Cloudflare Pages + Cloudflare R2 | Pages 托管网站，R2 公开读取媒体与 Catalog |

Pages + R2 将网站代码发布和大型媒体文件发布分开：Git 仓库与 Pages 构建不需要包含整套音乐；更新音频或专辑图片时，由同步器增量更新 R2 和 Catalog。动态 Catalog 是组件共享的数据入口，因此添加专辑通常不需要编辑每个 React 组件。

~~~text
audio/ → 扫描器 → Catalog / 增量同步 → R2 公共域名
                                      ↓
Pages 网站 ← CatalogProvider ← Catalog
             ├─ 3D 圆柱 / 时代长廊 / EraIndex
             └─ 播放器 / 同步歌词
~~~

## 快速开始

先从 [Node.js 官网](https://nodejs.org/)安装 Node.js **22.12.0 或更高版本**。建议使用仍在维护的 Node.js LTS；项目在 Node 24.18.0 与 pnpm 11.24.0 上验证，Cloudflare Pages 当前文档所列默认 Node/pnpm 也高于本项目下限。构建镜像会更新，部署前请查看 [Pages Build Image 文档](https://developers.cloudflare.com/pages/configuration/build-image/)。

安装 Node.js 后启用 pnpm。若环境没有 pnpm，可以通过 npm 安装：

~~~powershell
npm.cmd install --global pnpm
~~~

Windows PowerShell：

~~~powershell
git clone https://github.com/XYL333FYQ/taylor-swift-cinematic.git
Set-Location taylor-swift-cinematic
pnpm.cmd install
pnpm.cmd dev
~~~

macOS / Linux：

~~~sh
git clone https://github.com/XYL333FYQ/taylor-swift-cinematic.git
cd taylor-swift-cinematic
pnpm install
pnpm dev
~~~

打开 Vite 在终端打印的本地地址，通常是 http://localhost:5173。克隆仓库不会下载或包含项目演示曲库；没有 audio/ 媒体时，开发服务器仍可启动，并显示中英文空曲库提示。要试听自己的合法媒体，继续阅读[添加专辑](docs/ADD_ALBUMS.md)。

## 从克隆到播放自己的曲目

1. 在 audio/<专辑目录>/ 放入自己有权使用的音频，可选添加 album.json、封面、展示图和 .lrc。
2. 运行 pnpm dev。开发服务器会扫描本地专辑并提供音频 Range 请求；页面数据会随扫描更新。
3. 若要发布到自己的网站，按 [R2 配置教程](docs/CLOUDFLARE_R2.md)建立 Bucket 和公开域名，将写入凭证只保存在本机 .env.local。
4. 配置生产环境公开的 VITE_CATALOG_URL，再运行 pnpm music:sync。同步器先增量上传并验证媒体，最后发布 Catalog；任何删除都受安全门槛和交互确认约束。
5. 网站代码或 public/theme/ 变更需要 Pages 构建；仅更新 R2 专辑媒体通常只需同步，不需要重新部署网站。

完整步骤见[添加专辑](docs/ADD_ALBUMS.md)、[R2 配置](docs/CLOUDFLARE_R2.md)和[同步器说明](docs/MUSIC_SYNC.md)。

## 文档

- [项目架构](docs/PROJECT_ARCHITECTURE.md)
- [添加专辑](docs/ADD_ALBUMS.md)
- [album.json 字段](docs/ALBUM_METADATA.md)
- [封面、展示图与主题图片](docs/MEDIA_AND_ARTWORK.md)
- [音频与歌词](docs/LYRICS_AND_AUDIO.md)
- [Cloudflare R2 配置](docs/CLOUDFLARE_R2.md)
- [增量同步、监听与清理](docs/MUSIC_SYNC.md)
- [Cloudflare Pages 部署](docs/DEPLOYMENT.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [第三方素材与权利清单](docs/THIRD_PARTY_ASSETS.md)
- [贡献指南](CONTRIBUTING.md)

## 版权与使用限制

代码、音频、歌词、专辑封面和艺人照片分别受各自权利约束。代码仓库的可见性不会赋予使用或再分发第三方音乐和图片的权利；项目使用者需自行确保媒体拥有适用的许可。公开媒体域名也不代表相关素材可被重新分发。

当前仓库没有 LICENSE 文件，因此代码尚未通过许可证授予他人复制、修改或再分发的权限。请在权利人作出选择后添加许可证；本项目不擅自替作者选择软件许可证。现有主题图片和站点图标的来源及未确认的再分发状态列于[第三方素材清单](docs/THIRD_PARTY_ASSETS.md)。

## 贡献

欢迎提交缺陷报告、文档改进和可复现的代码变更。请先阅读[贡献指南](CONTRIBUTING.md)，不要提交个人音乐、歌词、凭证、同步缓存或未经确认可公开再分发的素材。
