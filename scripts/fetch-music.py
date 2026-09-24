#!/usr/bin/env python3
"""为 12 个时代抓取专辑对应的官方试听音频。

数据源：Apple iTunes Search / Lookup 公开接口（免费、公开）。
音频源：接口返回的官方 previewUrl（Apple 官方 CDN 直链，每首约 30 秒）。
处理：下载后统一转码为 64kbps 单声道 AAC，控制仓库体积。

用法：
    python scripts/fetch-music.py            # 抓取缺失的部分（可断点续跑）
    python scripts/fetch-music.py --force    # 全部重新抓取
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
AUDIO_ROOT = ROOT / "public" / "audio"
CATALOG = AUDIO_ROOT / "preview-catalog.json"
MANIFEST = AUDIO_ROOT / "sources.json"
ERAS_TS = ROOT / "src" / "data" / "eras.ts"

LOOKUP_API = "https://itunes.apple.com/lookup"
UA = "Mozilla/5.0 (compatible; taylor-swift-cinematic asset fetcher)"

# era id -> (iTunes collectionId, 说明用专辑名)
# 已重录的专辑优先使用 Taylor's Version（她本人持有的版本）。
ERA_ALBUMS: list[tuple[str, int]] = [
    ("debut", 1440913923),        # Taylor Swift (Bonus Track Version), 2006
    ("fearless", 1552791073),     # Fearless (Taylor's Version), 2021
    ("speak-now", 1690839749),    # Speak Now (Taylor's Version), 2023
    ("red", 1590368275),          # Red (Taylor's Version), 2021
    ("1989", 1708308989),         # 1989 (Taylor's Version), 2023
    ("reputation", 1440933849),   # reputation, 2017
    ("lover", 1468058165),        # Lover, 2019
    ("folklore", 1528111535),     # folklore (deluxe version), 2020
    ("evermore", 1547316125),     # evermore (deluxe version), 2020
    ("midnights", 1650859878),    # Midnights (3am Edition), 2022
    ("ttpd", 1742073690),         # THE TORTURED POETS DEPARTMENT: THE ANTHOLOGY, 2024
    ("showgirl", 1842897453),     # The Life of a Showgirl, 2025
]

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def era_album_names() -> dict[str, str]:
    """读取 src/data/eras.ts 里每个时代的专辑英文名。"""
    source = ERAS_TS.read_text(encoding="utf-8")
    names: dict[str, str] = {}
    pattern = re.compile(r'"id":\s*"([^"]+)"([\s\S]{0,900}?)"name":\s*\{\s*"en":\s*"([^"]+)"')
    for match in pattern.finditer(source):
        names[match.group(1)] = match.group(3)
    return names


def era_folder(era_id: str) -> str:
    """时代 id -> public/audio 下的目录名。

    目录用官方专辑名而不是内部代号，方便一眼认出哪张是哪张。
    规则必须与 vite.config.ts 的 audioLibraryPlugin 保持一致。
    """
    album = era_album_names().get(era_id, era_id)
    slug = re.sub(r"[^a-z0-9]+", "-", album.normalize("NFKD").lower()).strip("-")
    return slug or era_id


def era_track_limits() -> dict[str, int]:
    """读取 src/data/eras.ts 中每个时代声明的曲目数，作为抓取上限。

    这样页面卡片上写多少首，实际就有多少首可播，不会出现"卡片 13 首、
    实际 26 首"的错位。取的是标准版专辑的前 N 首，顺序与官方一致。
    """
    source = ERAS_TS.read_text(encoding="utf-8")
    limits: dict[str, int] = {}
    current: str | None = None
    for match in re.finditer(r'"id":\s*"([^"]+)"|"tracks":\s*(\d+)', source):
        if match.group(1):
            current = match.group(1)
        elif current is not None:
            limits[current] = int(match.group(2))
            current = None
    return limits


def http_json(url: str, retries: int = 4) -> dict:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"请求失败: {url} ({last_error})")


def http_bytes(url: str, retries: int = 4) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.read()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"下载失败: {url} ({last_error})")


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.replace("’", "'").replace("“", '"').replace("”", '"')
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "track"


def transcode(src: bytes, dest: Path) -> None:
    """下载内容转码为 64kbps 单声道 AAC。中间文件放在系统临时目录，避免污染仓库。"""
    tmp_dir = Path(tempfile.mkdtemp(prefix="ts-music-"))
    tmp_in = tmp_dir / "in.m4a"
    tmp_out = tmp_dir / "out.m4a"
    tmp_in.write_bytes(src)
    try:
        subprocess.run(
            [
                FFMPEG, "-y", "-loglevel", "error",
                "-i", str(tmp_in),
                "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "64k",
                "-movflags", "+faststart",
                str(tmp_out),
            ],
            check=True,
        )
        shutil.copyfile(tmp_out, dest)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def fetch_album(era_id: str, collection_id: int, force: bool, limit: int) -> tuple[list[dict], str, str]:
    query = urllib.parse.urlencode(
        {"id": collection_id, "entity": "song", "limit": 300, "country": "US"}
    )
    payload = http_json(f"{LOOKUP_API}?{query}")
    results = payload.get("results", [])

    album_meta = next((r for r in results if r.get("wrapperType") == "collection"), None)
    songs = [
        r
        for r in results
        if r.get("wrapperType") == "track" and r.get("previewUrl")
    ]
    songs.sort(key=lambda r: (r.get("discNumber") or 1, r.get("trackNumber") or 0))

    # 严格对齐 eras.ts 声明的曲目数：取官方顺序的前 limit 首（即标准版曲目）
    available = len(songs)
    songs = songs[:limit]

    album_name = (album_meta or {}).get("collectionName", era_id)
    album_url = (album_meta or {}).get("collectionViewUrl", "")
    print(f"\n[{era_id}] {album_name} — 可试听 {available} 首，按 eras.ts 取前 {len(songs)} 首")

    out_dir = AUDIO_ROOT / era_folder(era_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 清掉超出上限的历史文件（例如之前按扩展版抓的）
    for stale in out_dir.glob("*.m4a"):
        match = re.match(r"^(\d+)-", stale.name)
        if match and int(match.group(1)) > limit:
            stale.unlink()

    tracks: list[dict] = []
    for index, song in enumerate(songs, start=1):
        title = (song.get("trackName") or f"Track {index}").strip()
        slug = slugify(title)
        filename = f"{index:02d}-{slug}.m4a"
        dest = out_dir / filename
        rel_path = f"audio/{era_folder(era_id)}/{filename}"

        if dest.exists() and not force:
            status = "cached"
        else:
            try:
                transcode(http_bytes(song["previewUrl"]), dest)
                status = f"{dest.stat().st_size // 1024}KB"
            except Exception as exc:  # noqa: BLE001
                print(f"    !! 跳过 {title}: {exc}")
                continue
            time.sleep(0.15)

        tracks.append(
            {
                "id": f"{era_id}-{index:02d}-{slug}",
                "title": title,
                "file": rel_path,
                "previewUrl": song["previewUrl"],
                "trackViewUrl": song.get("trackViewUrl", ""),
                "durationMs": song.get("trackTimeMillis"),
            }
        )
        print(f"    {index:02d}. {title} [{status}]")

    return tracks, album_name, album_url


def write_catalog(catalog: dict[str, list[dict]], albums: dict[str, dict]) -> None:
    """输出试听片段元数据。曲目清单由 vite.config.ts 的 audioLibraryPlugin 消费。"""
    payload = {
        era: {
            "album": albums.get(era, {}).get("album", era),
            "collectionId": albums.get(era, {}).get("collectionId"),
            "appleMusicUrl": albums.get(era, {}).get("appleMusicUrl", ""),
            "tracks": [{"title": t["title"], "file": t["file"]} for t in tracks],
        }
        for era, tracks in catalog.items()
    }
    CATALOG.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="忽略已有文件，全部重新抓取")
    args = parser.parse_args()

    catalog: dict[str, list[dict]] = {}
    manifest: dict[str, dict] = {}
    limits = era_track_limits()

    for era_id, collection_id in ERA_ALBUMS:
        limit = limits.get(era_id)
        if not limit:
            print(f"[{era_id}] eras.ts 中未找到曲目数声明，跳过", file=sys.stderr)
            catalog[era_id] = []
            continue
        try:
            tracks, album_name, album_url = fetch_album(era_id, collection_id, args.force, limit)
        except Exception as exc:  # noqa: BLE001
            print(f"[{era_id}] 抓取失败：{exc}", file=sys.stderr)
            catalog[era_id] = []
            continue

        catalog[era_id] = tracks
        manifest[era_id] = {
            "album": album_name,
            "collectionId": collection_id,
            "appleMusicUrl": album_url,
            "trackCount": len(tracks),
            "eraDeclaredTracks": limit,
            "license": "Preview clips served by Apple's public iTunes API. Full recordings (P) Taylor Swift / respective rights holders.",
        }

    write_catalog(catalog, manifest)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(v) for v in catalog.values())
    size = sum(f.stat().st_size for f in AUDIO_ROOT.rglob("*.m4a"))
    print(f"\n完成：{total} 首试听片段，合计 {size / 1024 / 1024:.1f} MB")
    print(f"清单：{MANIFEST.relative_to(ROOT)}")
    print("\n曲目清单由 vite.config.ts 的 audioLibraryPlugin 自动生成，")
    print("下次 `pnpm dev` 或 `pnpm build` 时会自动刷新。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
