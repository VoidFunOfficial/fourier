"""Inspect encoded media and make side-by-side reference comparisons."""
from pathlib import Path
from fractions import Fraction
import json, subprocess, hashlib
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
VIDEO=ROOT/'output/Work-Play-1080p60.mp4'
REVIEW=ROOT/'review'

def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))

metadata=probe(VIDEO)
video=next(s for s in metadata['streams'] if s['codec_type']=='video')
audio=next(s for s in metadata['streams'] if s['codec_type']=='audio')
assert (video['width'],video['height'])==(1920,1080)
assert Fraction(video['avg_frame_rate'])==60
assert int(video['nb_frames'])==1383
assert abs(float(video['duration'])-23.05)<.001
assert audio['sample_rate']=='48000' and audio['channels']==2
assert abs(float(audio['duration'])-float(video['duration']))<.04

validation=json.loads((REVIEW/'project-validation.json').read_text())
assert validation['valid'] and len(validation['ir']['scenes'])==9
assert validation['ir']['totalFrames']==1383
end=0
for scene in validation['ir']['scenes']:
    assert scene['startFrame']==end
    end=scene['endFrame']
    assert scene['project']['nodes'][0]['kind']=='react'
assert end==1383
assert validation['ir']['scenes'][-1]['startFrame']==1143
assert validation['ir']['scenes'][-1]['durationFrames']==240
nodes=validation['ir']['nodes']
assert len(nodes)==1 and nodes[0]['kind']=='audio'
assert nodes[0]['src']=='assets/audio/film-master.wav'
assert not any('<video' in p.read_text() for p in (ROOT/'scenes').rglob('*.tsx'))

moments=[.75,1,1.5,2.5,3.5,4.5,5.5,7.5,8.5,9.75,11.75,13.4166667,14.25,15,16.5,18.5]
encoded=REVIEW/'encoded';encoded.mkdir(exist_ok=True)
selected='+'.join(f'eq(n,{round(t*60)})' for t in moments)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf',f"select='{selected}',scale=640:360",'-fps_mode','vfr',str(encoded/'%02d.png')],check=True)

for sheet in range(4):
    canvas=Image.new('RGB',(1280,4*394),(244,244,245));draw=ImageDraw.Draw(canvas)
    for row,t in enumerate(moments[sheet*4:sheet*4+4]):
        i=sheet*4+row
        source=ROOT.parent/'reference/frames'/f'{round(t*24)+1:04d}.png'
        original=Image.open(source).convert('RGB').resize((640,360),Image.Resampling.LANCZOS)
        actual=Image.open(encoded/f'{i+1:02d}.png').convert('RGB')
        y=row*394
        draw.text((12,y+9),f'{t:.3f}s  |  REFERENCE',fill=(30,30,35))
        draw.text((652,y+9),'FOURIER SDK REBUILD',fill=(30,30,35))
        canvas.paste(original,(0,y+30));canvas.paste(actual,(640,y+30))
    canvas.save(REVIEW/f'comparison-{sheet+1}.jpg',quality=93)

# Compare the decoded output audio with the exact PCM used by the SDK Audio node.
def pcm(path):
    raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-map','0:a:0','-f','f32le','-ac','2','-ar','48000','-'])
    return np.frombuffer(raw,dtype='<f4').reshape(-1,2)
actual=pcm(VIDEO);source=pcm(ROOT/'assets/audio/film-master.wav')
n=min(len(source),len(actual));a=actual[:n];b=source[:n]
correlation=float(np.corrcoef(a.ravel(),b.ravel())[0,1])
assert correlation>.97,correlation
credits=pcm(ROOT/'assets/audio/credits-sfx.wav')
credits_actual=actual[914400:914400+len(credits)]
credits_correlation=float(np.corrcoef(credits_actual.ravel(),credits.ravel())[0,1])
assert credits_correlation>.97,credits_correlation
subprocess.run(['ffmpeg','-v','error','-y','-i',str(VIDEO),'-vf',"select='eq(n,1143)+eq(n,1173)+eq(n,1233)+eq(n,1382)'",'-fps_mode','vfr',str(encoded/'credits-%02d.png')],check=True)
report={'passed':True,'width':1920,'height':1080,'fps':60,'frames':1383,'durationSeconds':23.05,'independentScenes':9,'referencePictureDurationSeconds':457/24,'appendedCredits':{'source':'ad-apple/templates/ending/scenes/20-credits','startSeconds':19.05,'durationSeconds':4,'audioCorrelation':credits_correlation},'audioSampleRate':48000,'channels':2,'audioCorrelation':correlation,'outputPeak':float(abs(a).max()),'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),'comparisonSheets':[f'comparison-{i+1}.jpg' for i in range(4)],'pixelIdenticalClaim':False}
(REVIEW/'media-verification.json').write_text(json.dumps(report,indent=2))
(REVIEW/'ffprobe.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps(report,indent=2))
