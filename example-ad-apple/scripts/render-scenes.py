"""Warm Fourier's scene cache in separate processes, then restore the complete entrypoint.
This uses the same SDK, Scene graph, renderer, and cache as the full project.
"""
from pathlib import Path
import subprocess,json,re,time,signal,os,sys
root=Path(__file__).resolve().parent.parent
workspace=root.parent
entry=root/'main.tsx'
original=entry.read_bytes()
shots=re.findall(r"id:\s*'([^']+)',\s*seconds:\s*(\d+)",(root/'shots.ts').read_text())
if len(sys.argv)>1:shots=[s for s in shots if any(s[0].startswith(a) for a in sys.argv[1:])]
written=None;proc=None

def stop(signum,frame):raise KeyboardInterrupt()
signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
try:
 for name,seconds in shots:
  scene_dir=('templates/ending/scenes/' if int(name[:2])>=18 else 'scenes/')+name
  content=f'''import {{ Canvas,defineProject,Project,Scene,Timeline }} from '@fourier-video/sdk/project';
export default defineProject(<Project id="mac-mini-m6-film" version="1.0" audioSampleRate={{48000}}><Canvas width={{1920}} height={{1080}} fps={{60}} background="#f5f5f7" colorSpace="sRGB"/><Timeline><Scene id="shot-{name}" at="0f" src="{scene_dir}" audio={{false}}/></Timeline></Project>);
'''.encode()
  if entry.read_bytes()!=(written if written is not None else original):raise RuntimeError('Entrypoint changed externally; stopping without overwriting it')
  entry.write_bytes(content);written=content
  passed=False
  for attempt in range(1,3):
   log=root/f'review/render-v4-{name}-{attempt}.jsonl';err=root/f'review/render-v4-{name}-{attempt}.stderr.log'
   print(json.dumps({'scene':name,'state':'rendering','attempt':attempt}),flush=True)
   with log.open('w') as stdout,err.open('w') as stderr:
    proc=subprocess.Popen(['bun','fourier-render-engine/src/cli.ts','--ai','render','ad-apple/main.tsx','--output',f'ad-apple/review/rendered-{name}.mp4','--overwrite','--crf','17','--preset','medium','--dom-pages','1','--frame-concurrency','1'],cwd=workspace,stdout=stdout,stderr=stderr,start_new_session=True)
    started=time.monotonic();result=None
    while proc.poll() is None:
     events=[]
     for line in log.read_text().splitlines():
      try:events.append(json.loads(line))
      except ValueError:pass
     terminal=[e for e in events if e.get('type') in ['error','result']]
     if terminal:
      result=terminal[-1]
      # Some renderer failures leave open handles; do not retain failed Bun processes.
      if result.get('type')=='error':
       os.killpg(proc.pid,signal.SIGTERM)
       try:proc.wait(timeout=8)
       except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
       break
     if time.monotonic()-started>420:
      os.killpg(proc.pid,signal.SIGTERM)
      try:proc.wait(timeout=8)
      except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
      break
     time.sleep(1)
    status=proc.wait();proc=None
   events=[]
   for line in log.read_text().splitlines():
    try:events.append(json.loads(line))
    except ValueError:pass
   errors=[e for e in events if e.get('type')=='error']
   if status==0 and not errors:
    passed=True;print(json.dumps({'scene':name,'state':'complete','seconds':round(time.monotonic()-started,1)}),flush=True);break
   print(json.dumps({'scene':name,'state':'retry' if attempt<2 else 'failed','exit':status,'error':errors[-1] if errors else None}),flush=True)
  if not passed:raise RuntimeError(f'Scene {name} failed after two isolated attempts')
finally:
 if proc is not None and proc.poll() is None:
  os.killpg(proc.pid,signal.SIGTERM)
  try:proc.wait(timeout=8)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
 if written is not None and entry.read_bytes()==written:entry.write_bytes(original)
 elif written is not None:print('Entrypoint changed externally; original not restored over the new edit',flush=True)
