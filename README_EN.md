# Taylor Swift Cinematic

English | [中文](README.md)

An immersive 3D music archive organized around album eras. Visitors can explore a time corridor, move through a dynamic 3D cylinder, and listen with a vinyl-inspired player and synchronized lyrics.

> This is an unofficial fan project. It is not affiliated with or endorsed by Taylor Swift or her representatives.

> **Live demo:** [meimei.eren.cc.cd](https://meimei.eren.cc.cd) · **Public media and catalog:** [music.eren.cc.cd](https://music.eren.cc.cd)
>
> Rights in the demo's media, photographs, and site icons are separate from the rights in this code. See the [third-party asset inventory](docs/THIRD_PARTY_ASSETS.md); redistribution permission has not been established for some current assets.

## Features

- **3D era cylinder:** OGL / WebGL presents album presentation images and builds its album list from the catalog.
- **Eras Corridor and EraIndex:** Browse albums, years, copy, and track indexes from the same catalog.
- **Dynamic album navigation:** The scanner and catalog discover new albums without registering each one in React display components.
- **Vinyl-inspired player:** Play tracks, move between albums and tracks, follow playback progress, and see album cover art.
- **Synchronized lyrics:** External LRC files and readable synchronized embedded lyrics can highlight and seek with playback.
- **Chinese and English UI with responsive layouts:** Interface copy supports both languages and adapts to desktop and narrow screens.
- **Separate media publishing:** Cloudflare Pages serves the website; Cloudflare R2 stores audio, lyrics, album images, and the catalog. Media updates normally do not require rebuilding the site.
- **Two music workflows:** `music:sync` mirrors a complete local library; `music:upload` adds new albums or tracks from `incoming/` while preserving the cloud catalog.

Unlike a conventional playlist, albums are both visual spaces and narrative entry points. The player and the archive share the same dynamic track data.

## Preview

Live demo: [https://meimei.eren.cc.cd](https://meimei.eren.cc.cd)

<!-- Screenshot to be added only after redistribution rights are confirmed and no unlicensed music, lyrics, or artist photographs are included. -->

## Architecture and technology

| Layer | Technology | Responsibility |
| --- | --- | --- |
| UI | React, TypeScript, Tailwind CSS | Pages, player, and bilingual interactions |
| Animation | GSAP | Page transitions and scroll-driven animation |
| Graphics | OGL, WebGL | Era cylinder and image textures |
| Build | Vite, @vitejs/plugin-react-swc | Development server and static build |
| Media scanning | Node.js, music-metadata | Scan local audio, tags, lyrics, and images |
| Media hosting | Cloudflare Pages + Cloudflare R2 | Pages hosts the site; R2 publicly serves media and catalog |

Pages and R2 keep website releases separate from large media files. The Git repository and Pages build do not need a full music library. The sync tool incrementally updates R2 and the catalog when audio or album artwork changes. Components share a dynamic catalog, so adding an album normally does not require editing each React component.

For day-to-day additions with no complete local library, use `incoming/` and `pnpm music:upload`. It reads the current R2 `catalog.json`, appends only new assets, and never deletes cloud media because it is absent locally. Keep `audio/` and `pnpm music:sync` for full-library migration, backup, or rebuilds.

The repository now keeps only empty `audio/`, `incoming/`, and `uploaded/` directory placeholders. Demo music remains in R2 and is not distributed through Git. Local `pnpm dev` scans only `audio/`, so an empty local library shows the empty-library message while the production site continues to read the R2 catalog.

~~~text
audio/ → scanner → catalog / incremental sync → public R2 domain
                                           ↓
Pages site ← CatalogProvider ← catalog
              ├─ 3D cylinder / eras corridor / EraIndex
              └─ player / synchronized lyrics
~~~

## Quick start

Install Node.js **22.12.0 or later** from the [official Node.js website](https://nodejs.org/). Use a maintained Node.js LTS release. The project has been verified with Node 24.18.0 and pnpm 11.24.0; the current Cloudflare Pages documented defaults also meet the project's minimum. Build images change, so check the current [Pages Build Image documentation](https://developers.cloudflare.com/pages/configuration/build-image/) before deployment.

After installing Node.js, enable pnpm. If pnpm is not available, install it with npm:

~~~sh
npm install --global pnpm
~~~

In Windows PowerShell, use npm.cmd install --global pnpm.

Windows PowerShell:

~~~powershell
git clone https://github.com/XYL333FYQ/taylor-swift-cinematic.git
Set-Location taylor-swift-cinematic
pnpm.cmd install
pnpm.cmd dev
~~~

macOS / Linux:

~~~sh
git clone https://github.com/XYL333FYQ/taylor-swift-cinematic.git
cd taylor-swift-cinematic
pnpm install
pnpm dev
~~~

Open the local URL printed by Vite, usually http://localhost:5173. Cloning the repository does not download or include the demo music library. Without media in audio/, the development server still starts and shows a bilingual empty-library message. Continue with [Add an album](docs/ADD_ALBUMS.md) to preview audio you are allowed to use.

## Add your own music

1. Follow the [R2 setup guide](docs/CLOUDFLARE_R2.md) to create your own bucket and public domain. Keep write credentials in local `.env.local` and set the public production `VITE_CATALOG_URL`.
2. For daily additions, put an album in `incoming/` using the existing album format. Run `pnpm music:check`, `pnpm music:upload --dry-run`, then `pnpm music:upload`. The original folder moves to `uploaded/`; after verifying the cloud media, you may remove that local copy.
3. For local playback in `pnpm dev`, or for a complete local library used for migration, backup, or rebuilds, put the full albums in `audio/`. Run `pnpm music:sync` only when `audio/` truly contains the intended **complete library**.
4. Website code and `public/theme/` changes require a Pages build. Updating only album media in R2 does not require a site redeployment.

See [Add an album](docs/ADD_ALBUMS.md), [Music upload](docs/MUSIC_UPLOAD.md), [R2 setup](docs/CLOUDFLARE_R2.md), and [Music sync](docs/MUSIC_SYNC.md) for the full workflow.

## Documentation

- [Project architecture](docs/PROJECT_ARCHITECTURE.md)
- [Add albums](docs/ADD_ALBUMS.md)
- [album.json fields](docs/ALBUM_METADATA.md)
- [Covers, presentation art, and theme images](docs/MEDIA_AND_ARTWORK.md)
- [Audio and lyrics](docs/LYRICS_AND_AUDIO.md)
- [Cloudflare R2 setup](docs/CLOUDFLARE_R2.md)
- [Daily album upload](docs/MUSIC_UPLOAD.md)
- [Change log](CHANGELOG.md)
- [Incremental sync, watch, and cleanup](docs/MUSIC_SYNC.md)
- [Cloudflare Pages deployment](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Third-party asset and rights inventory](docs/THIRD_PARTY_ASSETS.md)
- [Contributing](CONTRIBUTING.md)

## Copyright and use

Code, audio, lyrics, album covers, and artist photographs have separate rights. Making this repository visible does not grant permission to use or redistribute third-party music or images. Users must make sure they have the necessary rights for their media. A public media domain does not mean its contents may be redistributed elsewhere.

There is currently no LICENSE file in this repository, so no license grants others permission to copy, modify, or redistribute the code. A license should be added only after the rights holder makes that choice; this project does not select one on the author's behalf. The source and unconfirmed redistribution status of the current theme images and site icons are listed in the [third-party asset inventory](docs/THIRD_PARTY_ASSETS.md).

## Contributing

Bug reports, documentation improvements, and reproducible code changes are welcome. Read the [contribution guide](CONTRIBUTING.md) first. Do not submit personal music, lyrics, credentials, sync caches, or assets whose public redistribution rights have not been confirmed.
