# Cloudflare Pages 部署

本项目是 Vite 静态站点。代码发布到 Pages，专辑媒体和 Catalog 发布到 R2。已有 Cloudflare Pages 项目名为 meimei，关联本 GitHub 仓库；不要为了同一网站再创建 Pages 项目。

## 构建要求

| 项目 | 设置 |
| --- | --- |
| 仓库根目录 | 仓库根目录，Root directory 留空或填 / |
| 安装 | Pages 依据仓库 pnpm-lock.yaml 安装依赖 |
| 构建命令 | pnpm build |
| 输出目录 | dist |
| Node.js 最低版本 | 22.12.0；package.json engines 记录项目最低兼容要求 |

Node 下限来自 Vite 7 与 Node CLI 同步脚本使用的功能。当前 Cloudflare Pages v3 Build Image 文档显示默认 Node.js 22.16.0、pnpm 10.11.1，二者均满足本项目当前要求和 lockfile 格式；构建镜像会滚动更新，部署前可查看 [Cloudflare Pages Build Image](https://developers.cloudflare.com/pages/configuration/build-image/) 的实时版本。若需要覆盖默认值，可在 Pages 设置 NODE_VERSION、PNPM_VERSION；也可按 Cloudflare 文档在仓库根目录使用 .nvmrc 或 .node-version。项目不锁定 pnpm patch 版本。

本地当前验证环境版本会记录在本次发布测试结果中。新克隆开发者建议使用仍在维护的 Node.js LTS；通过 npm 安装当前 pnpm 时，先满足 pnpm 官方安装页面的 Node 要求。可用 npm install --global pnpm 安装，也可按 [pnpm 官方安装说明](https://pnpm.io/installation/)选择适合系统的方式。

## 首次连接 GitHub

若为其他开发者配置自己的站点：

1. Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git。
2. 授权 GitHub 并选中 taylor-swift-cinematic 仓库。
3. 指定 Production branch 为 main。
4. 配置上表中的根目录、构建命令和输出目录。
5. 在 Production 环境设置 VITE_CATALOG_URL，再保存并部署。

Cloudflare Pages 官方 [Git integration 指南](https://developers.cloudflare.com/pages/get-started/git-integration/)说明，连接后向生产分支推送会触发 Git 构建和部署。

## 生产环境变量

在 Pages 项目的 Settings → Environment variables → Production 中设置：

~~~text
VITE_CATALOG_URL=https://music.eren.cc.cd/catalog.json
~~~

这是公开读取的 URL，不是密钥。其他部署应换成自己的 Catalog 地址。Preview 可以指向测试 Catalog；不要把真实商业曲库或 R2 写入权限暴露给不可信预览版本。

不要配置 R2_ACCOUNT_ID、R2_ACCESS_KEY_ID 或 R2_SECRET_ACCESS_KEY 到 Pages。浏览器只需要公开读对象；S3 写入凭证只用于本地 .env.local 和同步脚本。缺少 VITE_CATALOG_URL 时，静态文件仍可能成功构建，但浏览器运行时无法加载 Catalog。

## Git 自动部署

main 推送后，进入 meimei → Deployments，确认最新 Production 任务：

1. 来源是连接的 GitHub 仓库与 main。
2. Commit SHA 与准备发布到 main 的最新提交完全一致。
3. Build log 显示安装依赖、pnpm build 成功，构建产物目录为 dist。
4. 环境变量使用正确的 Production VITE_CATALOG_URL。
5. Production Deployment 页面显示的关联 commit 与 main SHA 一致。

不要用旧 Wrangler 产物的成功记录代替此次 Git 自动构建结果。

## 本地构建与 Wrangler 手动部署

手动构建：

~~~powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
~~~

输出位于 dist/。若需手动发布到已存在的 Pages 项目，可使用 Wrangler：

~~~powershell
npx.cmd wrangler login
npx.cmd wrangler pages deploy ./dist --project-name meimei --branch main
~~~

不要运行 wrangler pages project create；项目已存在。Wrangler 发布的是本地 dist 快照，不会把工作区源码或新提交同步到 GitHub。Cloudflare Git integration 与 Wrangler 部署可以并存，但后续 main Git 构建可能把 Production 更新为 Git 中的版本。

正式工作流建议让 Git main 成为代码事实来源。若临时使用 Wrangler，先确认 dist 来源的 commit 已经推送且与 main 内容一致；记录该 commit 和部署 URL。随后等待同一版本的 Git 自动构建完成，并以其为正式 Production 验收版本。不要为了掩盖失败的 Git build 再部署旧 dist。

## 回滚

Cloudflare Pages 的成功 Production 构建可作为回滚目标。在项目 Deployments 列表找到已验证的旧 Production 版本，打开操作菜单并选择 Rollback to this deployment。回滚能恢复当时部署的站点文件，但不会回退 R2 对象或 Catalog；两者仍需按音乐同步器流程管理。代码修复后再推送新 main 提交。

参考：[Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)、[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[部署回滚](https://developers.cloudflare.com/pages/configuration/rollbacks/)。
