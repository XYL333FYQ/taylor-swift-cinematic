"""Regenerate the site's Taylor Swift monogram icons from a system bold serif font.

Requires Pillow and fontTools. Set TAYLOR_ICON_FONT to choose a specific font file.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MARK = "#e5cc9f"
BACKGROUND = "#0b0b0b"
STROKE = "#76634b"
ICON_LINKS = (
    '    <link rel="icon" href="./taylor-favicon.ico?v=1" sizes="any" />\n'
    '    <link rel="icon" type="image/svg+xml" href="./taylor-monogram.svg?v=1" />\n'
    '    <link rel="apple-touch-icon" href="./taylor-apple-touch.png?v=1" />\n'
)


def find_font() -> Path:
    configured = os.environ.get("TAYLOR_ICON_FONT")
    if configured:
        candidate = Path(configured).expanduser()
        if candidate.is_file():
            return candidate
        raise FileNotFoundError(f"TAYLOR_ICON_FONT does not point to a font file: {candidate}")

    candidates: list[Path] = []
    windows_root = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
    if windows_root:
        candidates.append(Path(windows_root) / "Fonts" / "georgiab.ttf")
    candidates.extend([
        Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf"),
        Path.home() / "Library/Fonts/Georgia Bold.ttf",
        Path("/Library/Fonts/Georgia Bold.ttf"),
    ])
    for candidate in candidates:
        if candidate.is_file():
            return candidate

    fc_match = shutil.which("fc-match")
    if fc_match:
        result = subprocess.run(
            [fc_match, "Georgia:style=Bold", "-f", "%{file}"],
            check=False,
            capture_output=True,
            text=True,
        )
        candidate = Path(result.stdout.strip())
        if result.returncode == 0 and candidate.is_file():
            return candidate
    raise FileNotFoundError("Could not find a bold serif font. Set TAYLOR_ICON_FONT to a .ttf or .otf file.")


def build_svg(font_path: Path) -> tuple[str, float, float]:
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    units = font["head"].unitsPerEm
    scale = 34 / units
    advance = sum(font["hmtx"][cmap[ord(char)]][0] for char in "TS") * scale
    cursor = (64 - advance) / 2
    start_x = cursor
    paths: list[str] = []
    for char in "TS":
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        paths.append(f'<path transform="translate({cursor} 47) scale({scale} {-scale})" d="{pen.getCommands()}"/>')
        cursor += font["hmtx"][name][0] * scale
    star = '<path d="M47 7L49 12L54 14L49 16L47 21L45 16L40 14L45 12Z"/>'
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect x="1" y="1" width="62" height="62" rx="14" '
        f'fill="{BACKGROUND}" stroke="{STROKE}" stroke-width="2"/>'
        f'<g fill="{MARK}">{"".join(paths)}{star}</g></svg>'
    )
    return svg, start_x, scale


def write_icon_links() -> None:
    index_file = ROOT / "index.html"
    with index_file.open("r", encoding="utf-8", newline="") as handle:
        source = handle.read()
    eol = "\r\n" if "\r\n" in source else "\n"
    source = re.sub(
        r'^\s*<link rel="(?:icon|apple-touch-icon)"[^>]*href="\./taylor-(?:favicon\.ico|monogram\.svg|apple-touch\.png)\?v=1"[^>]*/>\s*\n?',
        "",
        source,
        flags=re.MULTILINE,
    )
    anchor = re.search(r'^\s*<meta name="theme-color"', source, flags=re.MULTILINE)
    if not anchor:
        raise ValueError('index.html is missing its <meta name="theme-color"> anchor.')
    source = source[:anchor.start()] + ICON_LINKS.replace("\n", eol) + source[anchor.start():]
    with index_file.open("w", encoding="utf-8", newline="") as handle:
        handle.write(source)


def main() -> None:
    font_path = find_font()
    svg, text_x, _scale = build_svg(font_path)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "taylor-monogram.svg").write_text(svg, encoding="utf-8")

    scale = 8
    size = 64 * scale
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (scale, scale, 63 * scale, 63 * scale),
        radius=14 * scale,
        fill=BACKGROUND,
        outline=STROKE,
        width=2 * scale,
    )
    draw.text(
        (text_x * scale, 47 * scale),
        "TS",
        font=ImageFont.truetype(str(font_path), size * 34 // 64),
        anchor="ls",
        fill=MARK,
    )
    star_points = [(x * scale, y * scale) for x, y in [(47, 7), (49, 12), (54, 14), (49, 16), (47, 21), (45, 16), (40, 14), (45, 12)]]
    draw.polygon(star_points, fill=MARK)

    image.save(PUBLIC / "taylor-icon-512.png")
    image.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "taylor-apple-touch.png")
    image.save(PUBLIC / "taylor-favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    write_icon_links()
    print(f"Icons regenerated with {font_path.name}.")


if __name__ == "__main__":
    main()
