# 添加专辑和歌曲

本目录中的个人音频、歌词和封面只保留在本机，不纳入公开 Git 仓库。克隆仓库后曲库默认为空；请自行加入有权使用和发布的素材，再运行 `pnpm dev` 或 `pnpm build` 生成曲目清单。部署公开站点前，也要确认静态托管产物 `dist/audio/` 中每个素材的发布权利。

只记住一条：**在专辑目录中放入音频，就会生成曲目。** 歌词、图片、`album.json` 和完整 metadata 都是可选项。音频可以放在专辑目录下任意深度。

```text
public/audio/
└── My Album/
    └── song.flac
```

扫描器把 `public/audio/` 下的第一层普通目录识别为专辑；`full/`、`generated/` 和 `cache/` 是系统保留目录。新增、删除或重命名专辑目录不需要修改 TypeScript。

## 目录示例

平铺、歌曲子目录和任意深度都可以：

```text
My Album/
├── 01-song.m4a
├── 01-song.lrc
└── cover.jpg

Another Album/
└── song/
    ├── song.flac
    ├── song.lrc
    └── song.jpg

Deep Album/
├── A/B/C/random.flac
├── X/Y/willow.lrc
└── Images/willow.jpg
```

也可以把不同资源分开放，或按碟片整理：

```text
Separated Album/
├── Music/song.flac
├── Lyrics/song.lrc
└── Artwork/song.webp

Double Album/
├── Disc 1/01/first.flac
└── Disc 2/01/second.flac
```

扫描器支持 `.mp3`、`.m4a`、`.aac`、`.ogg`、`.opus`、`.wav` 和 `.flac`。识别文件格式只代表它会进入曲库；具体浏览器能否播放，仍取决于浏览器对音频编码的支持。本项目不会自动转码。

## 歌词和图片

- 目前自动识别 `.lrc`。歌词文件可以在专辑的任意子目录；生成结果只记录 URL，选中歌曲时才加载并缓存歌词。
- 若音频 metadata 含同步歌词且没有匹配到 `.lrc`，播放器也会使用它。
- 图片支持 `.jpg`、`.jpeg`、`.png`、`.webp` 和 `.avif`。
- 相同目录和相同文件名是最明确的关联方式。跨目录时会尝试唯一的文件名或音频 metadata 标题匹配；仅凭曲目号不会关联资源。
- 无法唯一判断时会保留歌曲、跳过可选资源并输出 warning，不会猜一个可能错误的关联。
- 专辑封面优先使用 `album.json` 指定图片，其次使用专辑根目录的 `cover.*`、`front.*`、`folder.*`、`album.*` 或唯一图片；没有时使用匹配到的曲目图片或站点现有 fallback。

## 可选专辑信息与精确映射

通常不需要 `album.json`。想覆盖自动识别结果时，可以把它放在专辑根目录。路径相对于专辑目录；音频路径必须指向该专辑里已发现的音频文件。

```json
{
  "id": "my-album",
  "name": { "en": "My Album", "zh": "我的专辑" },
  "year": 2026,
  "artist": "Artist Name",
  "genre": { "en": "Pop", "zh": "流行" },
  "artwork": "Artwork/cover.webp",
  "description": { "en": "A short note", "zh": "一段介绍" },
  "subtitle": { "en": "A new chapter", "zh": "新的篇章" },
  "tracks": [
    {
      "audio": "Music/random-name.flac",
      "title": "willow",
      "artist": "Taylor Swift",
      "lyrics": "Lyrics/willow.lrc",
      "artwork": "Images/willow.jpg",
      "discNumber": 1,
      "trackNumber": 3
    }
  ]
}
```

`tracks` 只需列出想明确覆盖的曲目。未列出的音频仍会自动发现。稳定专辑 ID 优先使用 `album.json` 的 `id`；未提供时会沿用旧试听目录 ID（如适用），再使用音频 metadata 专辑名或目录名生成。后两种方式在元数据或目录名变化时可能改变 ID。曲目 ID 根据稳定标题和碟片/曲目号生成；只有同名曲目仍冲突时才用专辑内相对路径消歧。

现有精修时代在页面上保留 `src/data/eras.ts` 的名称、年份、流派和视觉文案；扫描到的专辑封面只用于音乐播放器。新发现的专辑直接使用扫描结果和 `album.json` 覆盖值。

构建时，`music-metadata` 会在 Node 环境读取标题、艺人、专辑、曲目号、碟片号、年份和流派。标签不可读时会告警并退回文件名。内嵌图片不会写入生成的 TypeScript；图片应作为普通文件放入专辑目录。

## 自动生成与更新

`pnpm dev` 会在启动时扫描，并监听专辑及任意深度子目录内的音频、LRC、图片和 `album.json` 增删改；`pnpm build` 会重新扫描。扫描结果写入：

- `src/data/music.generated.ts`
- `public/audio/TRACKLIST.md`

这两个文件由工具维护，不要手动编辑。浏览器只读取生成后的 catalog，不会在运行时遍历服务器目录。部署后新增资源需要重新构建和发布。

## Preview 与 Full

`preview-catalog.json` 描述下载到本地的试听条目。它的 `file` 是本地路径，不是远程播放地址；只有文件实际存在时，试听曲目才会进入 catalog。同专辑中的完整音频仅在标题唯一一致时替换对应试听条目，曲目号相同不足以替换。

旧式完整音频目录仍可用：

```text
public/audio/full/<专辑目录名>/...
```

`full/` 下的文件会递归纳入对应专辑；即使没有同名的顶层专辑目录，`full/<专辑目录名>/` 中的音频也会被发现。`full/` 自身不会被识别成专辑。完整音频请使用自己有权保存和发布的文件。
