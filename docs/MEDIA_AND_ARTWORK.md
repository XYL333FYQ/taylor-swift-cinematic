# 图片与展示资源

不同图片承担不同工作。扫描器不会把网站主题图当作专辑封面；R2 同步器也会把专辑图片放进 albums/<album-id>/，而网站主题文件从 public/theme/ 随 Pages 一起构建。

## 资源对应表

| 类别 | 放置路径 / 命名 | 当前使用位置 | 缺失时的真实行为 | 替换后的发布流程 |
| --- | --- | --- | --- | --- |
| 专辑封面 album cover | audio/<album>/artwork/cover.webp | PlayerStage 的封面与黑胶标签、EraCarousel、播放器收起后的 Dock 封面 | 回退到扫描器发现的专辑图片；若没有专辑图片，使用首个匹配到的曲目图片，最后使用主题 Finale 图 | 运行 music:sync；无需重新部署 Pages |
| 专辑展示图 album presentation | 推荐 audio/<album>/artwork/presentation.webp；也支持同目录下唯一的 presentation.jpg、.jpeg、.png、.avif | OGL 3D Cylinder、Eras Corridor、EraIndex | 优先使用 presentation.webp；没有它时只接受唯一的 presentation.* 候选。候选不唯一则警告并使用 cover；如果 cover 也缺失，则沿用 cover 的发现与回退结果 | 运行 music:sync；无需重新部署 Pages |
| 单曲图片 track artwork | 与音频同目录、相同文件名不同扩展名，或 album.json tracks 项里指定路径 | 当前 Catalog/同步器会保留并上传 track.artwork；现有播放器组件没有逐曲渲染它的独立 UI。若缺少专辑图片，首个唯一匹配的曲目图可作为专辑封面回退 | 不显示专门的曲目图片；如专辑封面也没有，则它可能成为上述封面回退 | 运行 music:sync；无需重新部署 Pages |
| 网站主题图片 | public/theme/taylor/hero.webp、portal.webp、spotlight.webp、finale.webp | HeroIntro、CylinderPortal、SpotlightEra、FinaleOutro；finale.webp 也用于 Cylinder 的静态回退 | 代码引用的文件缺失时，相关章节会显示空白或圆柱转静态回退；页面不会从专辑图片自动替代这些固定主题图 | 更新主题文件后重新构建并部署 Pages |

上述路径大小写敏感性在 Windows 上不明显，但 R2 对象路径区分字节与 URL；请沿用小写的 artwork、cover.webp 和 presentation.webp。封面与展示图分开存放，可避免更换播放器封面时影响圆柱展示。

## 封面发现优先级

扫描器最终按以下顺序确定封面：

1. 专辑内精确路径 artwork/cover.webp 优先。
2. album.json 的 artwork 相对路径覆盖。
3. 根目录或 artwork/ 下名称为 cover、front、folder、album 的图片按此顺序选择。
4. 如果相应根目录只发现一张图片，则采用该图片。
5. 如果还没有专辑图片，采用第一个成功唯一匹配的曲目图片。
6. 最后回退到 public/theme/taylor/finale.webp。

如果专辑中同时有 cover 与 presentation，播放器使用 cover；展示区域使用 presentation。扫描器优先采用精确的 artwork/presentation.webp；否则仅在 artwork/ 下存在唯一同名 presentation 图片时采用它。多个非 WebP 候选同时存在时不会猜测，而是警告并回退到 cover。

album.json 的 artwork 是图片相对路径字符串，不是对象。为多个含义明确的图使用固定 artwork/cover.webp 和 artwork/presentation.webp 通常最容易维护。

## 曲目图片与自动匹配

扫描器识别 JPG、JPEG、PNG、WebP 和 AVIF。曲目歌词与图片按三轮匹配：同目录同名、专辑内规范化同名、元数据曲名。音轨号和碟号必须兼容，且胜出匹配必须唯一；有多个候选时会警告并跳过。

因此 Disc 1/01-Blue-Window.flac 可与同目录 Disc 1/01-Blue-Window.webp 对应。图片放在 Artwork/ 之类的其他子目录时，更推荐在 album.json tracks 中显式写 audio 与 artwork 路径。不要把 artwork/cover.webp 或 artwork/presentation.webp 当作单曲图片。

## 网站主题图片是独立设计资源

Hero、Portal、Spotlight 和 Finale 的图片属于整站的固定章节资产。替换专辑封面或展示图不会改变这些章节；替换主题图则要修改 public/theme/taylor/ 对应文件并重新部署 Pages。不要因为文件主体相似就删除或改用专辑图片。

当前主题路径需要单独完成再分发权利核查。项目仓库没有因为保存来源链接就自动取得艺人照片或专辑图片的授权；见 [版权和贡献规则](../CONTRIBUTING.md)。

## 尺寸与性能建议

- cover 在播放器中的封面区域按正方形显示，建议使用接近 1:1 构图的压缩图。
- presentation 会被浏览器裁成 1:1 的贴图切片并烘焙到圆柱纹理；主体尽量居中，重要细节不要贴边。
- 当前 Cylinder 每张展示图按最多约 1024 × 1024 的切片绘制；在移动端多张图片会共享受设备纹理上限约束的总纹理宽度。大图仍会增加下载、解码和构建前后缓存压力。
- 约 1024 像素见方通常足够作封面/展示图起点。优先压缩 WebP；照片也可用优化后的 JPEG 或 AVIF。先在页面中检查裁切和清晰度，再增加像素尺寸。
- 网站主题图在 Pages 构建时一起复制；缩小主题图可减少首屏下载。对音频与 R2 图片的替换不需要运行网站构建。
