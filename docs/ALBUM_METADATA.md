# 专辑配置 album.json

扫描器读取 audio/<专辑目录>/album.json。源码中的 AlbumManifest 是当前实际支持字段的依据；未知字段不会自动显示，也不会进入 Catalog。

## 字段表

“必填”均指 album.json 本身。当前所有专辑字段都是可选的；只有 tracks 数组里的每条覆盖项必须提供 audio 路径。

| 字段 | 类型 | 必填 | 默认值或推导方式 | 修改后的效果 |
| --- | --- | --- | --- | --- |
| id | string | 否 | 先沿用可识别的旧预览 Catalog ID，否则由音频专辑标签或文件夹名生成 | 稳定专辑身份，也是 R2 albums/<id>/ 的路径前缀；建议首次配置后不再改 |
| name | string 或 { en?, zh? } | 否 | 音频专辑标签，其次为文件夹名 | 时代标题、播放器及索引显示名称；只写一种语言时另一种回退到英文或同一字符串 |
| releaseDate | string | 否 | year 或多数曲目年份标签，否则空字符串 | 页面显示年份，并参与按年份排序；可写年份或完整日期 |
| year | string 或 number | 否 | 多数曲目的年份标签 | 仅在 releaseDate 未提供时作为发行年份 |
| artist | string | 否 | 多数 albumArtist 标签，其次曲目 artist 标签 | 专辑艺人字段和 EraIndex 图片说明 |
| genre | string 或 { en?, zh? } | 否 | 多数曲目的 genre 标签，否则空 | 专辑流派文案 |
| description | string 或 { en?, zh? } | 否 | 空字符串 | EraIndex 的专辑介绍 |
| tagline | string 或 { en?, zh? } | 否 | subtitle 或空字符串 | Corridor 等区域的短文案 |
| subtitle | string 或 { en?, zh? } | 否 | 仅当 tagline 未提供时作为兼容别名 | 与 tagline 相同 |
| quote | string 或 { en?, zh? } | 否 | 空字符串 | Corridor 卡片引用文案 |
| color | string | 否 | #d1ba95 | 专辑主题色 |
| colorAccent | string | 否 | color 或 #d1ba95 | 选中状态和强调色 |
| artwork | string | 否 | 自动封面发现；最终主题图片回退 | 指向专辑目录内的图片相对路径，例如 Artwork/cover.png |
| watermark | string | 否 | 浏览器端根据名称与年份生成 | Corridor 背景水印 |
| archiveNote | string | 否 | 不显示 | EraIndex 曲目数量旁的补充说明 |
| sortOrder | number | 否 | 同年专辑中按自然文件夹名排序 | 同年排序覆盖；使用大于零的数字 |
| tracks | TrackOverride[] | 否 | 自动发现的全部曲目 | 仅覆盖写出的曲目，不是曲目白名单；其他音频仍会被扫描 |

Localized 字段可以是普通字符串，表示中英文共用，也可以是对象。对象缺少 zh 时 zh 回退为 en；缺少 en 时使用相应的扫描默认值。

### tracks 覆盖项

| 字段 | 类型 | 必填 | 作用 |
| --- | --- | --- | --- |
| audio | string | 是 | 专辑目录内的音频相对路径，用于精确选中一首曲目 |
| title | string | 否 | 覆盖曲目显示标题 |
| artist | string | 否 | 覆盖曲目艺人 |
| lyrics | string | 否 | 指向专辑目录内的 .lrc 相对路径 |
| artwork | string | 否 | 指向专辑目录内的曲目图片相对路径 |
| trackNumber | number | 否 | 覆盖音轨号 |
| discNumber | number | 否 | 覆盖碟号 |

所有 manifest 媒体路径都必须是专辑目录内的相对路径。绝对路径、盘符和 .. 路径会被拒绝或忽略。若路径大小写不同，只有唯一匹配时才会采用。

## 最简示例

~~~json
{
  "id": "paper-moons",
  "name": {
    "en": "Paper Moons",
    "zh": "纸月亮"
  },
  "releaseDate": "2024-03-08"
}
~~~

## 完整示例

以下内容均为虚构：

~~~json
{
  "id": "paper-moons",
  "name": {
    "en": "Paper Moons",
    "zh": "纸月亮"
  },
  "releaseDate": "2024-03-08",
  "artist": "Mira Vale",
  "genre": {
    "en": "Dream Pop",
    "zh": "梦幻流行"
  },
  "description": {
    "en": "An imaginary collection about quiet harbor towns.",
    "zh": "一张关于安静海港小镇的虚构专辑。"
  },
  "tagline": {
    "en": "Letters left beneath the tide.",
    "zh": "留在潮汐之下的信。"
  },
  "quote": {
    "en": "The moon keeps what the morning forgets.",
    "zh": "月亮替清晨记住遗忘的事。"
  },
  "color": "#4c617c",
  "colorAccent": "#c9a8dd",
  "artwork": "Artwork/cover.png",
  "watermark": "PAPER MOONS · 2024",
  "archiveNote": "A fictional two-disc release",
  "sortOrder": 2,
  "tracks": [
    {
      "audio": "Disc 1/01-Quiet-Harbor.flac",
      "title": "安静的港口",
      "artist": "Mira Vale",
      "lyrics": "Lyrics/quiet-harbor.lrc",
      "artwork": "Artwork/quiet-harbor.webp",
      "discNumber": 1,
      "trackNumber": 1
    }
  ]
}
~~~

## 自动生成与手动配置的边界

不写覆盖项时，扫描器会发现音频、读取标签、推导标题、碟号和曲目号、匹配 LRC 与图片、建立曲目 ID。名称、日期、流派也可从元数据推导。

适合放在 manifest 的信息包括稳定 ID、准确发行日期、双语名称、简介、短文案、颜色、封面路径、排序和少数人工修正。写入 tracks 只会覆盖该条目的匹配结果；它不会阻止同专辑内其他音频出现。

## ID 与排序规则

若没有 id，扫描器会尝试沿用旧兼容 Catalog 的 ID，再使用多数 album 标签或文件夹名生成 slug。R2 同步器要求 ID 仅含小写英文字母、数字和连字符；新专辑建议始终明确写 ASCII ID。

不要随意修改已有 id。R2 对象路径以 album ID 开头，改 ID 会产生一组新路径，旧路径则变成待清理对象。

排序先比较 releaseDate 前四位年份；同年再比较 sortOrder，最后比较自然排序的文件夹名。浏览器端显示编号由排序后的 Catalog 顺序生成，不需要手动指定第几张专辑。

## 修改后会更新的区域

重新扫描并发布 Catalog 后，名称、日期、颜色、介绍、封面和曲目数据会更新到 Cylinder、Eras Corridor、EraIndex、播放器专辑轮播和播放列表。网站独立主题章节不由 album.json 控制。
