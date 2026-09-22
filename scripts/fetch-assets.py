import re, urllib.request, io, json
from pathlib import Path
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
base='https://www.taylorswift.com/wp-content/uploads/sites/2529/'
files=['2024/12/debut-album-mobile.jpg','2024/12/img-fearless-mobile-compressed.jpg','2025/07/img-Speak-Now-TV-mobile.png','2025/07/imgage-Red-mobile.png','2025/07/image-1989-mobile.png','2025/07/image-Reputation-mobile.png','2025/07/img-Lover-mobile.png','2025/07/img-Folklore-mobile.png','2025/07/img-Evermore-mobile.png','2025/07/img-Midnights-mobile.png','2025/07/img-TTPD-mobile.png','2024/12/img-tloas-mobile.jpg','2025/07/img-Eras.png']
output=Path('public/img/taylor'); output.mkdir(exist_ok=True)
def get(pair):
 i,path=pair
 url=base+path
 data=urllib.request.urlopen(url,timeout=40).read()
 img=Image.open(io.BytesIO(data)).convert('RGB'); img.thumbnail((1600,1600))
 name=f'era-{i+1:02}.webp' if i<12 else ['stage.webp','hero.webp'][i-12]
 img.save(output/name,'WEBP',quality=88)
 print(name,img.size,flush=True)
 return {'file':name,'source':url}
with ThreadPoolExecutor(max_workers=5) as pool: result=list(pool.map(get,enumerate(files)))
(output/'sources.json').write_text(json.dumps(result,indent=2),encoding='utf8')
