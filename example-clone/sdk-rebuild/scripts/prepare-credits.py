"""Reuse ad-apple credits fonts and its exact four-second sound segment."""
from pathlib import Path
import hashlib, json, shutil, subprocess

ROOT=Path(__file__).resolve().parents[1]
APPLE=ROOT.parent.parent/'ad-apple'
ledger=[]
for source,destination in [('SF-Pro-subset.woff','Apple-Credits-SF-Pro.woff'),('Heiti-subset.woff','Apple-Credits-Heiti.woff')]:
    target=ROOT/'assets/fonts'/destination
    shutil.copyfile(APPLE/'assets/fonts'/source,target)
    ledger.append({'asset':str(target.relative_to(ROOT)),'source':f'ad-apple/assets/fonts/{source}','sha256':hashlib.sha256(target.read_bytes()).hexdigest()})

credits=ROOT/'assets/audio/credits-sfx.wav'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(APPLE/'assets/audio/sfx-master.wav'),'-af','atrim=start=71:end=75,asetpts=PTS-STARTPTS,apad,atrim=duration=4','-ar','48000','-ac','2','-c:a','pcm_s24le',str(credits)],check=True)
master=ROOT/'assets/audio/film-master.wav'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(ROOT/'assets/audio/reference-master.wav'),'-i',str(credits),'-filter_complex','[0:a]atrim=duration=19.05,asetpts=PTS-STARTPTS[a];[a][1:a]concat=n=2:v=0:a=1[out]','-map','[out]','-ar','48000','-ac','2','-c:a','pcm_s24le',str(master)],check=True)
ledger.extend([
    {'asset':'assets/audio/credits-sfx.wav','source':'ad-apple/assets/audio/sfx-master.wav','sourceRangeSeconds':[71,75],'sha256':hashlib.sha256(credits.read_bytes()).hexdigest()},
    {'asset':'assets/audio/film-master.wav','composition':'reference-master.wav 0–19.05s + credits-sfx.wav 0–4s','sha256':hashlib.sha256(master.read_bytes()).hexdigest()},
    {'asset':'scenes/09-this-video/Visual.tsx','source':'ad-apple/templates/ending/scenes/20-credits/Visual.tsx','method':'Local source snapshot; only dependency paths changed. Original typography and motion retained.'},
])
(ROOT/'review/credits-sources.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2))
print('Prepared original credits fonts, 4-second SFX, and 23.05-second film master.')
