# 音频与歌词

播放器从 Catalog 获取曲目列表、音频地址和可选歌词资源。audio/ 中的本地曲目只供开发扫描与 R2 同步；代码仓库不应包含没有公开授权的音频或歌词。

## 导入音频

将有权使用的音频文件放在 audio/<专辑目录>/ 下任意深度。支持 MP3、M4A、AAC、OGG、Opus、WAV 和 FLAC。每张专辑至少需要一份音频才能播放；只有图片或歌词时可以扫描成空专辑，但没有曲目的专辑不能播放。

开发服务器通过本地中间件提供 HTTP Range。生产播放器请求 Catalog 中对应的 R2 媒体 URL，并依赖服务端正确响应分段读取。

## 标题与标签

扫描器使用 music-metadata 读取 title、artist、albumArtist、album、year/date、genre、track、disc，以及解析器能读取的同步内嵌歌词。图片封面标签不会被当成 album artwork 自动导出。

优先使用一致的标签。title 缺失时，标题从文件名生成并移除开头音轨编号。album.json tracks 可按相对路径覆盖 title、artist、discNumber、trackNumber、歌词和曲目图片路径。

重复标题如果没有音轨号或碟号，自动匹配可能有歧义。建议用 Disc 1/01-... 这样的目录和文件名前缀。音频标签也要提供清楚的 track/disc 编号。

## 外部 LRC 文件

LRC 文件扩展名必须是 .lrc。默认按照音频同目录、同文件名查找；也会在专辑内尝试同名和标签标题匹配。文件路径与碟号/曲目号需唯一。

~~~text
[ti:Quiet Harbor]
[ar:Mira Vale]
[offset:0]
[00:00.00]The lamps wake along the water.
[00:03.40]A paper moon crosses the bay.
[00:03.40]纸月亮越过海湾。
[00:06.80]The morning keeps the tide.
~~~

歌词与翻译可以在同一时间戳各写一行；解析器会把相同时间点的第二行作为翻译。时间戳支持 [mm:ss]、[mm:ss.xx]，小数部分可有 1 到 3 位；[offset:+/-毫秒数] 可以整体微调偏移。上面的歌词均为虚构。

也支持显式绑定：

~~~json
{
  "tracks": [
    {
      "audio": "Disc 1/01-Quiet-Harbor.flac",
      "lyrics": "Lyrics/quiet-harbor.lrc"
    }
  ]
}
~~~

## 内嵌歌词

元数据解析器会把可读取的同步歌词转换成 LRC 行。如果找不到唯一外部 LRC，曲目可以暂时使用内嵌歌词；R2 同步器发布时把歌词正文写成 albums/<album-id>/lyrics/<track-id>.lrc，而不是放入 catalog.json。外部 LRC 匹配成功时优先作为 lyricsUrl。

无有效时间戳的普通文本仍可显示为静态歌词，但不能按播放时间高亮或点击定位。播放器右侧 LyricsPanel 支持同步歌词、时间点跳转和同一时间戳的一行翻译。

## 单曲图片

可把与曲目同名的 JPG、JPEG、PNG、WebP 或 AVIF 放在音频同目录，也可用 album.json tracks 显式指定。当前 Catalog 和同步器保存该图片，但现有播放器组件没有按曲目切换图片的单独展示界面。专辑没有其他封面时，扫描器可能用首个唯一匹配的单曲图作为专辑封面回退。

## 曲目身份与重复曲目

track ID 按 album ID、曲目身份标题、碟号和曲目号生成；同一基准 ID 冲突时再使用来源相对路径片段。路径和标签能否稳定决定 ID，影响 R2 对象路径。不要只为视觉排序随意修改标签或专辑 ID。

R2 同步器目前要求生成 ID 符合小写 ASCII 字母、数字和连字符。对于中文标题，建议让元数据标题或文件名使用稳定的罗马化名称用于身份，再通过 tracks[].title 覆盖显示文本；否则同步器会拒绝不符合安全路径规则的 ID。

## 无法播放或歌词不匹配时

1. 开发时打开生成的 catalog.json，确认 track.file 指向的路径存在且扩展名受支持。
2. 检查开发服务器请求是否返回 200；向音频 URL 发 Range 请求时应返回 206 和 Content-Range。
3. 查看终端的 audio-library 扫描警告；匹配歧义会明确显示被跳过的资源。
4. 确认歌词文件是 UTF-8 文本、扩展名为 .lrc，文件名或 album.json 路径与曲目唯一对应。
5. 检查 LRC 时间戳是否采用方括号与分钟:秒格式；静态文本没有时间戳就不会同步跳转。
6. 生产环境检查 Catalog 和媒体对象是否成功发布、CORS Origin 是否正确、R2 对象是否支持 Range。
