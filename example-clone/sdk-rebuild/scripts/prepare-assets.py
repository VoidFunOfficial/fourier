"""Rebuild local fonts and vector silhouettes from the supplied reference.

Only two still silhouettes are traced. Reference footage is never a visual layer.
"""
from pathlib import Path
import json, hashlib, subprocess, shutil
import numpy as np
from PIL import Image
from scipy import ndimage
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent.parent
REFERENCE = ROOT.parent / "reference"

def simplify(points, epsilon=0.65):
    if len(points) <= 3:
        return points
    p = np.asarray(points, dtype=float)
    a, b = p[0], p[-1]
    if np.linalg.norm(b-a) == 0:
        distance = np.linalg.norm(p-a, axis=1)
    else:
        distance = np.abs(np.cross(b-a, p-a)) / np.linalg.norm(b-a)
    i = int(distance.argmax())
    if distance[i] <= epsilon:
        return [points[0], points[-1]]
    return simplify(points[:i+1], epsilon)[:-1] + simplify(points[i:], epsilon)

def trace(mask, smooth=True):
    edges = {}
    h, w = mask.shape
    for y, x in zip(*np.where(mask)):
        if y == 0 or not mask[y-1, x]: edges[(x,y)] = (x+1,y)
        if x == w-1 or not mask[y,x+1]: edges[(x+1,y)] = (x+1,y+1)
        if y == h-1 or not mask[y+1,x]: edges[(x+1,y+1)] = (x,y+1)
        if x == 0 or not mask[y,x-1]: edges[(x,y+1)] = (x,y)
    paths = []
    while edges:
        start = next(iter(edges)); point = start; loop = [point]
        while point in edges:
            point = edges.pop(point); loop.append(point)
            if point == start: break
        if len(loop) < 8: continue
        pts = simplify(loop, 1.0)[:-1]
        if len(pts)<3: continue
        midpoint = lambda a,b: ((a[0]+b[0])/2, (a[1]+b[1])/2)
        start = midpoint(pts[-1],pts[0])
        d = f'M{start[0]:.1f} {start[1]:.1f}'
        for i, point in enumerate(pts):
            end=midpoint(point,pts[(i+1)%len(pts)])
            before=np.array(point)-np.array(pts[i-1])
            after=np.array(pts[(i+1)%len(pts)])-np.array(point)
            cosine=float(np.dot(before,after))/(np.linalg.norm(before)*np.linalg.norm(after)+1e-8)
            if not smooth or cosine<.55:
                d+=f' L{point[0]} {point[1]} L{end[0]:.1f} {end[1]:.1f}'
            else:
                d+=f' Q{point[0]} {point[1]} {end[0]:.1f} {end[1]:.1f}'
        paths.append(d+' Z')
    return ' '.join(paths)

def write_vector(name, source, region, light=False):
    rgb = np.asarray(Image.open(REFERENCE/'frames'/source).convert('RGB'))
    x,y,w,h = region
    crop = rgb[y:y+h,x:x+w]
    mask = crop.min(2)>150 if light else crop.max(2)<100
    labels, _ = ndimage.label(mask)
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    # The character is one connected silhouette; the PS glyph has three pieces.
    mask = np.isin(labels, np.where(sizes>15)[0]) if light else labels==sizes.argmax()
    d = trace(mask, smooth=True)
    paths = f'<path d="{d}" fill="{ "#dfdde0" if light else "#29292a"}" fill-rule="evenodd"/>'
    if not light:
        red = (crop[:,:,0].astype(int) > crop[:,:,1].astype(int)*1.35) & (crop[:,:,0]>130)
        red[90:] = False
        paths += f'<path d="{trace(red)}" fill="#fb747a"/>'
    text = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">{paths}</svg>'
    (ROOT/'assets/vector'/name).write_text(text)
    return {'asset': name, 'sourceFrame': source, 'sourceRegion': region, 'method': 'Connected contour tracing, simplified to SVG paths; no reference video layer'}

ledger = [
    write_vector('warrior.svg','0321.png',(330,132,410,472)),
    write_vector('playstation.svg','0358.png',(550,287,182,143),True),
]

for source, destination in [
    (Path('/System/Library/Fonts/SFNS.ttf'),'SF-Pro.woff'),
    (WORKSPACE/'fourier-ad/fonts/Montserrat-Medium.ttf','Montserrat-Medium.woff'),
]:
    font = TTFont(source)
    for table in ['fvar','gvar','avar','HVAR','MVAR','VVAR','STAT']:
        if table in font: del font[table]
    options = subset.Options(); options.flavor = 'woff'
    sub = subset.Subsetter(options=options)
    sub.populate(text=''.join(chr(c) for c in range(32,127)))
    sub.subset(font); font.flavor='woff'
    font.save(ROOT/'assets/fonts'/destination)
    ledger.append({'asset': destination, 'source': str(source), 'method': 'ASCII font subset'})

shutil.copyfile(WORKSPACE/'fourier-ad/pic/svg/default.svg', ROOT/'assets/vector/cursor.svg')
ledger.append({'asset':'cursor.svg','source':'fourier-ad/pic/svg/default.svg','method':'Unmodified reuse'})
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(ROOT.parent/'clone.mp4'),'-vn','-ar','48000','-ac','2','-af','apad,atrim=duration=19.05',str(ROOT/'assets/audio/reference-master.wav')],check=True)
ledger.append({'asset':'reference-master.wav','source':'clone.mp4, supplied by user','method':'Decoded original audio; padded/trimmed to 19.05 seconds'})

# A stable, low-amplitude monochrome dither avoids gradient banding.
rng = np.random.default_rng(7741)
noise = np.clip(rng.normal(128,23,(192,192)),0,255).astype('uint8')
Image.fromarray(noise).save(ROOT/'assets/texture/grain.png')
for entry in ledger:
    matches = list((ROOT/'assets').rglob(entry['asset']))
    entry['sha256'] = hashlib.sha256(matches[0].read_bytes()).hexdigest()
(ROOT/'review/asset-sources.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2))
print('Prepared fonts, original audio, cursor, grain and two traced SVG silhouettes.')
