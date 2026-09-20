"""Download the exact public asset URLs found in Apple's Mac mini page source."""
from pathlib import Path
import re,subprocess,json,hashlib,concurrent.futures
root=Path(__file__).resolve().parent.parent
ledger=root/'assets/official/sources.json'
if ledger.exists():
 saved=json.loads(ledger.read_text())
 urls=[r['url'].removeprefix('https://www.apple.com') for r in saved['assets'] if r['url'].endswith(('.jpg','.png'))]
else:
 html=subprocess.run(['curl','-sS','-L','--fail','--max-time','40','https://www.apple.com/mac-mini/'],check=True,capture_output=True,text=True).stdout
 urls=sorted(set(re.findall(r'/v/mac-mini/[^\s"<>]*_large_2x\.(?:jpg|png)',html)))
 wanted=['performance_productivity_','performance_creativity_','performance_stem_','performance_gaming_','performance_coding_', 'performance_screen_', 'performance_hw_display', 'mac_iphone_mirroring__','mac_iphone_airdrop__','ai_agentic__','ai_tools__','performance_thermal__','design_pf__','design_pb__','ports_startframe__','welcome_hero__','performance_chip_mx__','macos__']
 urls=[u for u in urls if any(w in u for w in wanted)]
folder=root/'assets/official';folder.mkdir(parents=True,exist_ok=True)
def fetch(path):
 url='https://www.apple.com'+path; file=folder/path.split('/')[-1]
 if not file.exists():
  subprocess.run(['curl','-sS','-L','--fail','--retry','2','--max-time','50',url,'-o',str(file)],check=True)
 b=file.read_bytes()
 return {'file':str(file.relative_to(root)),'url':url,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
 results=list(executor.map(fetch,urls))
model=folder/'mac-mini-silver.usdz'
if not model.exists():
 subprocess.run(['curl','-sS','-L','--fail','--max-time','60','https://www.apple.com/105/media/us/mac-mini/2026/2140fd43-1461-420d-942c-6f254535a9a4/ar/mac-mini-silver.usdz','-o',str(model)],check=True)
results.append({'file':str(model.relative_to(root)),'url':'https://www.apple.com/105/media/us/mac-mini/2026/2140fd43-1461-420d-942c-6f254535a9a4/ar/mac-mini-silver.usdz','bytes':model.stat().st_size,'sha256':hashlib.sha256(model.read_bytes()).hexdigest()})
(folder/'sources.json').write_text(json.dumps({'page':'https://www.apple.com/mac-mini/','checked':'2026-09-04','assets':results},indent=2))
for r in results:print(r['file'],r['bytes'])
