"""Verify the individually rendered source scenes before final assembly."""
from pathlib import Path
import re, json, subprocess, hashlib

root = Path(__file__).resolve().parent.parent
shots = re.findall(r"id:\s*'([^']+)',\s*seconds:\s*(\d+)", (root/'shots.ts').read_text())
results = []
for name, duration in shots:
    file = root/f'review/rendered-{name}.mp4'
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(file)], text=True))
    video = next(stream for stream in probe['streams'] if stream['codec_type'] == 'video')
    assert (video['width'], video['height'], video['r_frame_rate']) == (1920, 1080, '60/1')
    assert int(video['nb_frames']) == int(duration)*60
    assert abs(float(video['duration'])-int(duration)) < .001
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    manifest = json.loads(Path(str(file)+'.manifest.json').read_text())
    assert manifest['output']['sha256'] == digest
    results.append({'scene': name, 'seconds': int(duration), 'frames': int(video['nb_frames']), 'sha256': digest, 'manifestMatches': True})
assert len(results) == 20
assert sum(scene['frames'] for scene in results) == 4500
(root/'review/revision-scene-render-check.json').write_text(json.dumps({'allPassed': True, 'scenes': results}, indent=2))
print('PASS: 20 independent scene files, 4500 frames, durations, dimensions and manifest hashes.')
