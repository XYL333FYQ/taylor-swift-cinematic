# 第三方素材与权利清单

此清单记录当前站点主题图的来源线索和发布状态。来源链接仅用于追溯，不等于取得许可。除非权利人确认公开再分发权限，否则这些图不能被视为已获授权的开源素材。

## 主题图片

| 当前文件 | 旧目录中的对应文件 | 来源记录 | 当前权利状态 |
| --- | --- | --- | --- |
| public/theme/taylor/hero.webp | public/img/taylor/era-06.webp | [Taylor Swift 官方站 Reputation mobile image](https://www.taylorswift.com/wp-content/uploads/sites/2529/2025/07/image-Reputation-mobile.png) | 未找到再分发授权；待权利人确认 |
| public/theme/taylor/portal.webp | public/img/taylor/era-06.webp | [Taylor Swift 官方站 Reputation mobile image](https://www.taylorswift.com/wp-content/uploads/sites/2529/2025/07/image-Reputation-mobile.png) | 未找到再分发授权；待权利人确认 |
| public/theme/taylor/spotlight.webp | public/img/taylor/era-12.webp | [Taylor Swift 官方站 The Life of a Showgirl mobile image](https://www.taylorswift.com/wp-content/uploads/sites/2529/2024/12/img-tloas-mobile.jpg) | 未找到再分发授权；待权利人确认 |
| public/theme/taylor/finale.webp | public/img/taylor/stage.webp | [Taylor Swift 官方站 Eras image](https://www.taylorswift.com/wp-content/uploads/sites/2529/2025/07/img-Eras.png) | 未找到再分发授权；待权利人确认 |

这些映射由当前资源与仓库旧来源清单的文件内容对应关系核实。引用官方站点或保留来源 URL 都不说明图片已获得公开代码仓库再分发许可。

## 站点图标

| 当前文件 | 当前用途 | 来源记录 | 当前权利状态 |
| --- | --- | --- | --- |
| public/taylor-favicon.ico | index.html 中引用的浏览器图标 | 仓库内没有来源或授权记录 | 图案为 TS 字母与星形；创作者和再分发权利待确认 |
| public/taylor-monogram.svg | index.html 中引用的 SVG 浏览器图标 | 仓库内没有来源或授权记录 | 图案为 TS 字母与星形；创作者和再分发权利待确认 |
| public/taylor-apple-touch.png | index.html 中引用的 Apple touch icon | 仓库内没有来源或授权记录 | 图案为 TS 字母与星形；创作者和再分发权利待确认 |
| public/taylor-icon-512.png | 当前源代码未找到引用，仍会被 public 目录复制到 dist | 仓库内没有来源或授权记录 | 图案为 TS 字母与星形；创作者和再分发权利待确认 |

以上清单只描述可见图案，不认定它们是 Taylor Swift 的官方商标或标识。发布前应确认图稿来源、字体/字形许可和公开再分发权利；未引用的 512 像素图标也会随当前 public 目录进入构建输出。

## 发布前检查

1. 由素材权利人确认公开仓库和网站再分发权限，或提供具有相同版式用途且许可清楚的替代图片。
2. 检查新增截图、封面、歌词、音频、字体和图标，并分别记录其来源和许可。
3. 检查 Git staged 文件列表和准备推送的提交内容；确认无个人媒体、秘密、同步缓存和构建产物。
4. 软件 LICENSE 需由权利人另行选择。没有许可证时，不应宣称代码已按某个开源许可证发布。

主题图片用于 Hero、Portal、Spotlight 和 Finale 等固定章节；专辑封面和展示图来自用户自己的专辑目录。这些资源不可相互替代，也不共享自动授权。README、页面图标、截图与主题照片都应分别确认权利。
