# 本地音乐文件

把你拥有使用权的 MP3 放在这个目录下，推荐按专辑时代分文件夹：

```text
public/audio/
├── debut/
│   └── tim-mcgraw.mp3
├── fearless/
│   └── love-story.mp3
└── ...
```

放入文件后，在 `src/data/music.ts` 的 `TRACKS_BY_ALBUM` 中登记歌曲：

```ts
debut: [
  {
    id: 'debut-tim-mcgraw',
    title: 'Tim McGraw',
    file: 'audio/debut/tim-mcgraw.mp3',
  },
],
```

播放器使用这个目录中的本地文件，不会自动抓取或下载第三方音乐。
