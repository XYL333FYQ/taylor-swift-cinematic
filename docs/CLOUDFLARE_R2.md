# 从零配置 Cloudflare R2

R2 在本项目中保存专辑媒体和 catalog.json。浏览器通过公开读取的自定义域名取资源；只有本地 music:sync 等脚本需要写入凭证。

## 1. 创建 Bucket

1. 登录 Cloudflare Dashboard，打开 Storage & databases → R2。
2. 添加 R2 subscription（如账户尚未启用），再创建一个专用 Bucket。
3. 网站媒体按常规频繁读取场景选择 Standard。Infrequent Access 会产生读取恢复费用和最短存储时长，不适合作为常访问曲库的默认选择。
4. 记录 Bucket 名称，填入 R2_BUCKET_NAME。

R2 价格和免费额度会变动；请查看 [Cloudflare R2 最新定价](https://developers.cloudflare.com/r2/pricing/)，不要根据旧教程固定预算。

## 2. 连接公开读取域名

Bucket 默认私有。生产网站通过 R2 自定义域名访问公开对象：

1. 在该 Bucket 的 Settings → Public access / Custom Domains 中连接你控制的域名。
2. 域名所在 Cloudflare Zone 必须满足当前 R2 自定义域名要求；等连接状态变为 Active。
3. 公开 URL 的根目录通常不提供对象列表，但可以按已知 object key 访问单个对象。
4. r2.dev 是开发用公共 URL，生产应优先使用自定义域名。

本项目当前公开媒体域名为 https://music.eren.cc.cd，运行时 Catalog 地址为 https://music.eren.cc.cd/catalog.json。其他部署应替换为自己的域名和 Catalog。

## 3. 配置 CORS

R2 图片被 Cylinder 以 crossOrigin=anonymous 加载后绘制进 WebGL Canvas。普通 img 标签显示成功并不能证明该图可以安全读入 Canvas；R2 必须返回与网站 Origin 匹配的 CORS 响应。

在 Bucket Settings 的 CORS Policy 中配置下方示例，并把网站 Origin 换成自己的协议与主机，不要带路径或结尾斜杠：

~~~json
[
  {
    "AllowedOrigins": ["https://site.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
~~~

若 Cloudflare Pages Preview 域名也要读同一 Bucket，需要把每个实际 Origin 明确加入 AllowedOrigins。GET/HEAD 供 Catalog、图片和媒体读取；Range 用于媒体分段读取；ExposeHeaders 允许客户端检查范围与长度信息。

## 4. 创建最小权限 S3 凭证

R2 S3 API 凭证不同于普通 Cloudflare API Bearer Token：

1. 打开 R2 → Overview → Manage API Tokens。
2. 创建单独的 R2 Account API token 或适用的 User token。
3. 授予指定 Bucket 的 Object Read & Write 权限，不要选整个 Cloudflare 账户管理权限。
4. 将创建时展示的 S3 Access Key ID、Secret Access Key 保存到密码管理器。Secret 通常只展示一次。
5. Token Value/Bearer Token 用于 Cloudflare REST API；本项目的 AWS SDK S3Client 需要 Access Key ID 和 Secret Access Key 两项。

本同步器需要读取对象头、写入对象并按严格规则删除旧的受管对象，所以凭证至少要覆盖该 Bucket 的对象读写操作。不要把任何写入凭证放到网站代码、Pages 前端环境变量或 GitHub。

## 5. Endpoint 与本地环境变量

从 Cloudflare R2 的 API Token 页面或 R2 Overview 获取 S3 Endpoint，标准形式是：

~~~text
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
~~~

不要在 Endpoint 后附加 Bucket 名称或路径；Bucket 单独由 R2_BUCKET_NAME 传入 SDK。R2_ENDPOINT 仅用于覆盖标准 Endpoint，例如特定 jurisdiction endpoint。

~~~dotenv
R2_ACCOUNT_ID=
R2_ENDPOINT=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
VITE_CATALOG_URL=https://media.example.com/catalog.json
~~~

从仓库根目录把 .env.example 复制为 .env.local 并填入本机值。Windows PowerShell：

~~~powershell
Copy-Item .env.example .env.local
~~~

macOS / Linux：

~~~sh
cp .env.example .env.local
~~~

仓库的 .gitignore 排除 .env.local。提交前仍要检查暂存列表，忽略规则不能保护已经跟踪的文件。

变量说明：

| 名称 | 用途 |
| --- | --- |
| R2_ACCOUNT_ID | 拼接默认 S3 Endpoint 的 Cloudflare Account ID；只有显式提供 R2_ENDPOINT 时才可省略 |
| R2_ENDPOINT | 可选的 S3 API Endpoint，只有协议与主机，不含 Bucket 路径 |
| R2_BUCKET_NAME | 目标 Bucket，单独作为 S3 Bucket 参数传递 |
| R2_ACCESS_KEY_ID | R2 S3 Access Key ID |
| R2_SECRET_ACCESS_KEY | 对应的 R2 S3 Secret Access Key |
| VITE_CATALOG_URL | Pages 生产构建时嵌入浏览器的公开 Catalog URL；它不是 Secret |

VITE_CATALOG_URL 以 VITE_ 开头，会成为前端可见配置，只能放公开 URL。R2 写入凭证只能留在同步器运行机器的 .env.local。

## 6. 首次同步与增量验证

确认本地 audio/ 已放入合法且完整的媒体之后，首次执行：

~~~powershell
pnpm.cmd music:sync
~~~

第一次会创建当前 Catalog 所需的媒体对象；之后同步器用本地 SHA-256 状态检查内容变化，相同内容跳过。每次有媒体上传后会执行 HeadObject 并核对 ContentLength。全部媒体校验成功后才发布 catalog.json。脚本会输出上传、未变化、目录警告与清理状态。

本发布任务不会自动替开发者运行真实 R2 同步。教程使用者首次同步前要检查 audio/、Bucket、凭证和可能的清理计划；不要把本机的 .music-cache/sync-state.json 放进仓库。

## 7. 验证 Catalog、CORS 与 Range

先用浏览器打开公开 Catalog 和一个已知媒体对象，确认返回 HTTP 200、JSON 可解析、每个媒体 key 在 Bucket 中存在。

在 PowerShell 中检查音频对象的跨域 Range 响应：

~~~powershell
curl.exe -i -H "Origin: https://site.example.com" -H "Range: bytes=0-1023" "https://media.example.com/albums/example/tracks/example.mp3"
~~~

有效范围请求应返回 HTTP 206 Partial Content 和 Content-Range: bytes 0-1023/<total-size>。若文件非常小，调整结尾字节使范围不超出总长度。HTTP 200 通常说明请求头没有到达源站或服务端未处理范围；HTTP 403/404 则分别检查权限和 key。

用带 Origin 的请求检查 Access-Control-Allow-Origin。命令行没有 Origin 时 R2 不会返回跨域响应头。WebGL 报 SecurityError 时要在 DevTools 检查资源响应头，不要只看普通页面图片是否显示。

## 8. 缓存建议

同步器给媒体设置一年 immutable 缓存，并在 Catalog URL 中加入内容摘要查询参数；Catalog 使用短缓存并要求重新验证。自定义域名上的 Cache Rule 应保留 query string 参与 cache key，避免同一路径换图后继续返回旧版本。若曾用不含 CORS 的配置缓存对象，需清理相应 Cloudflare 缓存再验证。

## 参考资料

- [R2 S3 API 与凭证](https://developers.cloudflare.com/r2/get-started/s3/)
- [R2 API Token 认证](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 公共 Bucket 与自定义域名](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [R2 CORS 配置](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 存储类别](https://developers.cloudflare.com/r2/buckets/storage-classes/)
- [R2 最新定价](https://developers.cloudflare.com/r2/pricing/)
