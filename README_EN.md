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

## From clone to playing your own tracks

1. Put audio you are allowed to use under audio/<album-folder>/. You may add album.json, cover art, a presentation image, and .lrc files.
2. Run pnpm dev. The development server scans local albums and serves audio with Range support; the page updates as the catalog changes.
3. To publish to your own site, follow the [R2 setup guide](docs/CLOUDFLARE_R2.md), create a bucket and public domain, and keep write credentials in a local .env.local file only.
4. Configure the public production VITE_CATALOG_URL, then run pnpm music:sync. The sync tool incrementally uploads and verifies media before publishing the catalog. Deletion is constrained by safety rules and interactive confirmation.
5. Website code and public/theme/ changes require a Pages build. Updating only album media in R2 normally requires sync but no site redeployment.

See [Add an album](docs/ADD_ALBUMS.md), [R2 setup](docs/CLOUDFLARE_R2.md), and [Music sync](docs/MUSIC_SYNC.md) for the full workflow.

## Documentation

- [Project architecture](docs/PROJECT_ARCHITECTURE.md)
- [Add albums](docs/ADD_ALBUMS.md)
- [album.json fields](docs/ALBUM_METADATA.md)
- [Covers, presentation art, and theme images](docs/MEDIA_AND_ARTWORK.md)
- [Audio and lyrics](docs/LYRICS_AND_AUDIO.md)
- [Cloudflare R2 setup](docs/CLOUDFLARE_R2.md)
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
