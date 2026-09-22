from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
font_path='C:/Windows/Fonts/georgiab.ttf'
f=TTFont(font_path); glyphs=f.getGlyphSet(); cmap=f.getBestCmap(); units=f['head'].unitsPerEm
size=34; scale=size/units
advance=sum(f['hmtx'][cmap[ord(c)]][0] for c in 'TS')*scale
x=(64-advance)/2
parts=[]; cursor=x
for c in 'TS':
 name=cmap[ord(c)]; pen=SVGPathPen(glyphs); glyphs[name].draw(pen)
 parts.append(f'<path transform="translate({cursor} 47) scale({scale} {-scale})" d="{pen.getCommands()}"/>')
 cursor+=f['hmtx'][name][0]*scale
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="1" y="1" width="62" height="62" rx="14" fill="#0b0b0b" stroke="#76634b" stroke-width="2"/><g fill="#e5cc9f">'+''.join(parts)+'<path d="M47 7L49 12L54 14L49 16L47 21L45 16L40 14L45 12Z"/></g></svg>'
Path('public/taylor-monogram.svg').write_text(svg,encoding='utf8')
k=8; im=Image.new('RGBA',(64*k,64*k)); d=ImageDraw.Draw(im)
d.rounded_rectangle((k,k,63*k,63*k),radius=14*k,fill='#0b0b0b',outline='#76634b',width=2*k)
d.text((x*k,47*k),'TS',font=ImageFont.truetype(font_path,size*k),anchor='ls',fill='#e5cc9f')
d.polygon([(a*k,b*k) for a,b in [(47,7),(49,12),(54,14),(49,16),(47,21),(45,16),(40,14),(45,12)]],fill='#e5cc9f')
im.save('public/taylor-icon-512.png')
im.resize((180,180),Image.Resampling.LANCZOS).save('public/taylor-apple-touch.png')
im.save('public/taylor-favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
p=Path('index.html');s=p.read_text(encoding='utf8');s=s.replace('    <meta name="theme-color"', '''    <link rel="icon" href="./taylor-favicon.ico?v=1" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="./taylor-monogram.svg?v=1" />
    <link rel="apple-touch-icon" href="./taylor-apple-touch.png?v=1" />
    <meta name="theme-color"''');p.write_text(s,encoding='utf8')
