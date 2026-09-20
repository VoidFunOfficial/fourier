"""Probe and decode the delivered file, then generate review sheets from encoded pixels."""
from pathlib import Path
import subprocess,json,hashlib,re
from PIL import Image,ImageDraw
import numpy as np

root=Path(__file__).resolve().parent.parent
video=root/'output/Mac-mini-M6-1080p60.mp4'
review=root/'review'
def run(args):
 return subprocess.run(args,check=True,capture_output=True,text=True)
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]).stdout)
v=next(s for s in probe['streams'] if s['codec_type']=='video')
assert (v['width'],v['height'],v['r_frame_rate'],v['codec_name'],v['pix_fmt'])==(1920,1080,'60/1','h264','yuv420p')
assert int(v['nb_frames'])==4500
assert abs(float(v['duration'])-75)<.001
decode=run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'])
assert not decode.stderr.strip(),decode.stderr
pixels=subprocess.run(['ffmpeg','-v','error','-i',str(video),'-an','-vf','crop=1920:960:0:0,scale=64:36,fps=15,format=gray','-f','rawvideo','-'],check=True,capture_output=True).stdout
gray=np.frombuffer(pixels,dtype=np.uint8).reshape(-1,64*36)
flat=gray.std(axis=1)<1.3
runs=[];run_start=None
for i,is_flat in enumerate(list(flat)+[False]):
 if is_flat and run_start is None:run_start=i
 if not is_flat and run_start is not None:
  runs.append({'start':round(run_start/15,3),'duration':round((i-run_start)/15,3)})
  run_start=None
(review/'flat-frame-analysis.json').write_text(json.dumps({'samplingFps':15,'definition':'Top 960px grayscale standard deviation below 1.3','runs':runs},indent=2))
audio=[s for s in probe['streams'] if s['codec_type']=='audio']
assert len(audio)==1 and audio[0]['codec_name']=='aac'
assert audio[0]['sample_rate']=='48000' and audio[0]['channels']==2
log=run(['ffmpeg','-hide_banner','-i',str(video),'-vn','-af','loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json','-f','null','-']).stderr
(review/'audio-verification.log').write_text(log)
loudness=json.loads(re.search(r'\{\s*"input_i".*?\}',log,re.S).group(0))
assert -25<float(loudness['input_i'])<-16
assert float(loudness['input_tp'])<-1, 'Encoded audio must retain true-peak headroom'
def pcm(path):
 raw=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-vn','-ar','48000','-ac','2','-f','f32le','-'],check=True,capture_output=True).stdout
 return np.frombuffer(raw,np.float32).reshape(-1,2)
master=pcm(root/'assets/audio/sfx-master.wav');encoded=pcm(video)[:len(master)]
assert encoded.shape==master.shape==(3600000,2)
correlation=float(np.corrcoef(master.ravel(),encoded.ravel())[0,1])
assert correlation>.94, f'SDK mux must preserve the authored SFX timing: {correlation}'
sound=json.loads((review/'sfx-master.json').read_text())
assert sound['bgm'] is False and all('bgm' not in s['file'].lower() for s in sound['sources'])
lettering=json.loads((root/'assets/handwriting/all-in-strokes.json').read_text())
pen=[c for c in sound['cues'] if 'stroke' in c]
assert len(pen)==len(lettering['strokes'])==29
pen_checks=[]
for cue,stroke in zip(pen,lettering['strokes']):
 assert cue['stroke']==stroke['id']
 assert cue['startSample']==(66*60+stroke['startFrame'])*800
 assert cue['endSample']==(66*60+stroke['endFrame'])*800
 segment=encoded[cue['startSample']:cue['endSample']]
 level=float(20*np.log10(np.sqrt(np.mean(segment**2))+1e-12))
 assert level>-52, f"Missing encoded pen contact: {stroke['id']}"
 pen_checks.append({'stroke':stroke['id'],'frame':stroke['startFrame'],'encodedRmsDb':level})
hold_rms=float(20*np.log10(np.sqrt(np.mean(encoded[round(70.15*48000):round(70.90*48000)]**2))+1e-12))
assert hold_rms<-65, 'The pen must lift into silence after the final dot'
audio_result=f"Stereo SFX only: {loudness['input_i']} LUFS, {loudness['input_tp']} dBTP; {len(pen)} synchronized pen strokes; no BGM"
(review/'sfx-encoded.json').write_text(json.dumps({'loudness':loudness,'masterCorrelation':correlation,'penChecks':pen_checks,'finalWritingHoldRmsDb':hold_rms,'bgm':False},indent=2))

shots=re.findall(r"id:\s*'([^']+)',\s*seconds:\s*(\d+)",(root/'shots.ts').read_text())
def frame(t,path):
 run(['ffmpeg','-v','error','-ss',str(t),'-i',str(video),'-frames:v','1','-update','1','-y',str(path)])
def sheet(items,out,cols=3,w=640,h=360):
 canvas=Image.new('RGB',(cols*w,((len(items)+cols-1)//cols)*(h+36)),'#e5e5e7');draw=ImageDraw.Draw(canvas)
 for i,(path,label) in enumerate(items):
  x=i%cols*w;y=i//cols*(h+36)
  im=Image.open(path).convert('RGB');im.thumbnail((w,h));canvas.paste(im,(x,y));draw.text((x+14,y+h+11),label,fill='#222222')
 canvas.save(out,quality=94)
items=[];start=0;cuts=[]
for name,seconds in shots:
 seconds=int(seconds);t=start+seconds*.56
 path=review/f'encoded-{name}.jpg';frame(t,path);items.append((path,f'{name}  |  {t:.2f}s'))
 if start:cuts.append(start)
 start+=seconds
sheet(items,review/'storyboard-final.jpg')
joins=[]
for cut in cuts:
 for delta in [-.15,.15]:
  path=review/f'cut-{cut}-{delta}.jpg';frame(cut+delta,path);joins.append((path,f'{cut+delta:.2f}s'))
sheet(joins,review/'transitions-final.jpg',cols=4,w=480,h=270)
hold=[]
scene_starts={}; cursor=0
for name,seconds in shots:
 scene_starts[name]=cursor; cursor+=int(seconds)
assert cursor==75
for t in [scene_starts['09-bandwidth']+local for local in [2.35,2.65,3.0]]:
 path=review/f'metric-{t}.jpg';frame(t,path);hold.append((path,f'{t:.2f}s'))
sheet(hold,review/'metric-hold-final.jpg',cols=3)
# Inspect each official workflow in the final encoded ending, not just one poster.
ending=[];ending_frames=[]
for i,t in enumerate([scene_starts['18-signature']+local for local in [.35,1.05,1.75,2.45,3.15,3.85]]):
 path=review/f'encoded-ending-{i}.png';frame(t,path);ending.append((path,f'{t:.2f}s'))
 ending_frames.append(np.array(Image.open(path).convert('RGB')))
sheet(ending,review/'ending-final.jpg',cols=3)
# Compression changes can alter pixels; test that the best matching position remains fixed.
reference=ending_frames[0][365:565,381:581].astype(float)
checks=[]
for i,pixels in enumerate(ending_frames):
 matches=[]
 for dy in range(-3,4):
  for dx in range(-3,4):
   patch=pixels[365+dy:565+dy,381+dx:581+dx].astype(float)
   matches.append((float(np.abs(patch-reference).mean()),dx,dy))
 error,dx,dy=min(matches)
 assert dx==0 and dy==0, f'Ending product shifted in phase {i}: {(dx,dy)}'
 assert error<2, f'Ending product appearance drifted in phase {i}: {error}'
 checks.append({'phase':i,'bestPixelOffset':[dx,dy],'meanPixelError':error})
(review/'ending-encoded-lock.json').write_text(json.dumps({'fixed':True,'samples':checks},indent=2))
handwriting=[];ink_counts=[]
for local in [.1,.8,1.6,2.5,3.3,4.1,4.9]:
 t=scene_starts['19-all-in']+local
 path=review/f'encoded-handwriting-{local}.png';frame(t,path);handwriting.append((path,f'{t:.2f}s'))
 pixels=np.array(Image.open(path).convert('RGB'))
 ink_counts.append({'localSeconds':local,'darkPixels':int((pixels.mean(axis=2)<100).sum())})
assert ink_counts[0]['darkPixels']<100
assert ink_counts[1]['darkPixels']>1000
assert all(b['darkPixels']>=a['darkPixels']*.99 for a,b in zip(ink_counts[1:5],ink_counts[2:6]))
assert abs(ink_counts[-1]['darkPixels']-ink_counts[-2]['darkPixels'])/ink_counts[-1]['darkPixels']<.02
sheet(handwriting,review/'handwriting-final.jpg',cols=3)
# Verify pen lifts at interior positions: the A bar and i dot cannot be a horizontal wipe.
stroke_checks=[]
for label,before,after,box in [('A crossbar',26,33,(695,444,720,461)),('first i dot',209,213,(1173,612,1197,640)),('last i dot',236,240,(1337,610,1364,640))]:
 counts=[]
 for phase,f in [('before',before),('after',after)]:
  path=review/f'encoded-stroke-{label.replace(" ","-")}-{phase}.png';frame(66+f/60,path)
  patch=np.array(Image.open(path).convert('RGB').crop(box))
  counts.append(int((patch.mean(axis=2)<100).sum()))
 assert counts[0]<5 and counts[1]>100,(label,counts)
 stroke_checks.append({'stroke':label,'beforeDarkPixels':counts[0],'afterDarkPixels':counts[1]})
(review/'handwriting-encoded.json').write_text(json.dumps({'strokeByStroke':True,'strokeCount':29,'samples':ink_counts,'interiorStrokeChecks':stroke_checks},indent=2))
frame(74.5,review/'credits-final.png')
frame(70.7,root/'output/Mac-mini-M6-poster.jpg')
digest=hashlib.sha256(video.read_bytes()).hexdigest()
manifest=json.loads(Path(str(video)+'.manifest.json').read_text())
assert manifest['output']['sha256']==digest, 'Manifest hash must match delivered video'
result={'file':str(video),'bytes':video.stat().st_size,'sha256':digest,'width':1920,'height':1080,'fps':60,'duration':75,'frames':4500,'codec':'H.264','pixelFormat':'yuv420p','audio':audio_result,'fullDecode':'PASS','probe':probe}
(review/'media-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='probe'},ensure_ascii=False,indent=2))
