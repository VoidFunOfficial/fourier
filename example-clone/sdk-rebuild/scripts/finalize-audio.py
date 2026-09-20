"""Keep Fourier-rendered video and mux the original PCM without rate processing.

The engine currently inserts atempo=1, whose WSOLA processing changes even a
unity-rate waveform. This final mux keeps exact original event timing, leaves
every video packet intact, and records both the native render and final hashes.
"""
from pathlib import Path
import subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'output/Work-Play-1080p60.mp4'
native=ROOT/'output/Work-Play-Fourier-render.mp4'
target.replace(native)
manifest=target.with_suffix('.mp4.manifest.json')
if manifest.exists():manifest.replace(native.with_suffix('.mp4.manifest.json'))
duration=subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=duration','-of','default=noprint_wrappers=1:nokey=1',str(native)]).decode().strip()
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(native),'-i',str(ROOT/'assets/audio/film-master.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-t',duration,'-movflags','+faststart',str(target)],check=True)
video_hash=lambda path:subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-']).decode().strip()
assert video_hash(target)==video_hash(native)
report={'nativeRender':native.name,'output':target.name,'videoPacketsIdentical':True,'nativeSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'audioSource':'assets/audio/film-master.wav','audioProcessing':'Encode PCM directly to AAC 320k, without atempo=1'}
(ROOT/'review/final-audio-mux.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
