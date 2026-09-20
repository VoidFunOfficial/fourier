"""Deterministic, scene-relative foley editing and 48 kHz stereo SFX mastering.

No music, musical grid, pad, or BGM source. Pen timing is shared with SVG strokes.
Run this before the Fourier render; the resulting WAV is a normal SDK Audio node.
"""
from pathlib import Path
import hashlib, json, re, subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT=Path(__file__).resolve().parent.parent
SR=48000
RNG=np.random.default_rng(6042998)
SOURCES=ROOT/'assets/audio/sources'
FILENAMES={'pen':'mixkit-2998-pen-marker-line.wav','whoosh':'woosh.mp3',
 'shua':'shua_sfx.mp3','wind':'wind_sfx.mp3','click':'click_sfx.mp3',
 'snap':'snap_finger.mp3','latch':'kacha.mp3'}
CROPS={'pen':(.015,.275),'whoosh':(.10,.30),'shua':(.11,.85),'wind':(.08,.93),
 'click':(.035,.19),'snap':(.195,.28),'latch':(.22,.49)}

def band(x,lo,hi):
 return signal.sosfilt(signal.butter(2,[lo,hi],btype='bandpass',fs=SR,output='sos'),x)

def fade(x,attack=.003,release=.012):
 x=x.copy();a=min(len(x)//2,int(attack*SR));b=min(len(x)//2,int(release*SR))
 if a:x[:a]*=np.sin(np.linspace(0,np.pi/2,a))**2
 if b:x[-b:]*=np.cos(np.linspace(0,np.pi/2,b))**2
 return x

def unit(x):
 return x/max(float(np.abs(x).max()),1e-9)

samples={};source_records=[]
for name,filename in FILENAMES.items():
 path=SOURCES/filename
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar',str(SR),'-ac','1','-f','f32le','-'])
 x=np.frombuffer(raw,np.float32).astype(float);a,b=CROPS[name];x=x[int(a*SR):int(b*SR)]
 x=band(x,600 if name=='pen' else 90,6600 if name=='pen' else 10000)
 samples[name]=unit(fade(x))
 source_records.append({'id':name,'file':str(path.relative_to(ROOT)),
  'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceCropSeconds':[a,b],
  'origin':'https://mixkit.co/free-sound-effects/office/' if name=='pen' else f'../fourier-ad/sfx/{filename}',
  'license':'Mixkit Sound Effects Free License' if name=='pen' else 'User-authorized existing project asset'})

def sound(name,duration,rate):
 n=round(duration*SR);t=np.arange(n)/SR
 if name in samples:
  base=samples[name]
  if name=='pen':
   # Vary the interior texture of each contact, without carrying paper noise over lifts.
   start=int(RNG.integers(0,max(1,len(base)//4)))
   base=base[start:]
  x=np.interp(np.linspace(0,len(base)-1,n),np.arange(len(base)),base)
  if rate!=1:
   # Small pitch variation, with zero-filled ends and a fresh release envelope.
   x=np.interp(np.arange(n)*rate,np.arange(n),x,right=0)
  return fade(unit(x),.002 if name in ['click','snap','latch'] else .005,.018)
 if name=='air':
  noise=band(RNG.normal(size=n),280,6100)
  return unit(noise*np.sin(np.linspace(0,np.pi,n))**1.7)*.78
 if name=='thump':
  # A short mechanical body resonance, never a sustained musical tone.
  phase=2*np.pi*(43*t+72*.032*(1-np.exp(-t/.032)))
  x=np.sin(phase)*np.exp(-t/.062)+band(RNG.normal(size=n),160,1700)*np.exp(-t/.018)*.22
  return unit(fade(x,.001,.04))
 if name=='tick':
  x=band(RNG.normal(size=n),900,7000)*np.exp(-t/.008)
  x+=.12*np.sin(2*np.pi*2100*rate*t)*np.exp(-t/.006)
  return unit(fade(x,.0008,.008))
 raise ValueError(name)

shots=re.findall(r"id:\s*'([^']+)',\s*seconds:\s*(\d+)",(ROOT/'shots.ts').read_text())
starts={};cursor=0
for name,seconds in shots:starts[name]=cursor;cursor+=int(seconds)
assert cursor==75
mix=np.zeros((cursor*SR,2),float);ledger=[]

def place(scene,cue):
 at=starts[scene]+cue['at'];duration=cue['duration'];x=sound(cue['sound'],duration,cue.get('rate',1))
 pan=cue.get('pan',0);pan=pan if isinstance(pan,list) else [pan,pan]
 p=np.linspace(pan[0],pan[1],len(x));angle=(p+1)*np.pi/4
 stereo=np.stack([x*np.cos(angle),x*np.sin(angle)],axis=1)*cue['level']
 begin=round(at*SR);end=begin+len(x)
 assert 0<=begin<end<=len(mix),(scene,cue)
 mix[begin:end]+=stereo
 ledger.append({'scene':scene,**cue,'globalStart':at,'globalEnd':at+duration,'startSample':begin,'endSample':end})

cues=json.loads((ROOT/'sound/scene-cues.json').read_text())
for scene,items in cues.items():
 for cue in items:place(scene,cue)
lettering=json.loads((ROOT/'assets/handwriting/all-in-strokes.json').read_text())
for s in lettering['strokes']:
 x=float(re.search(r'M\s+([\d.]+)',s['d']).group(1))
 place('19-all-in',{'at':s['startFrame']/60,'sound':'pen',
  'duration':(s['endFrame']-s['startFrame'])/60,'level':.09 if 'dot' in s['id'] else .155,
  'pan':(x-960)/1600,'stroke':s['id']})

# Transparent peak normalization leaves all motion-level relationships intact.
peak_before=float(abs(mix).max());gain=10**(-3.5/20)/peak_before;mix*=gain
pcm=np.round(np.clip(mix,-1,1)*32767).astype(np.int16)
out=ROOT/'assets/audio/sfx-master.wav';wavfile.write(out,SR,pcm)
ledger.sort(key=lambda c:c['globalStart'])
result={'sampleRate':SR,'channels':2,'seconds':cursor,'samples':len(mix),
 'bgm':False,'cueCount':len(ledger),'handwritingStrokes':len(lettering['strokes']),
 'peakDbFS':20*np.log10(abs(mix).max()),'normalizationGainDb':20*np.log10(gain),
 'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'sources':source_records,'cues':ledger}
(ROOT/'review/sfx-master.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['sources','cues']},indent=2))
