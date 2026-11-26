"""Measure each reference part independently of the handwritten game score."""
from collections import Counter
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
reference = runpy.run_path(str(ROOT / 'scripts/import-master-music.py'))
tracks = reference['read_midi'](ROOT / 'references/master-mod/Wii_Tanks_Master_OST.mid')
sections = reference['score_sections']()
report = {'ppq':480, 'bpm':120, 'beat_seconds':.5, 'parts':{}}
for voice, track in zip(reference['VOICES'], tracks):
    section = next(s for s in sections if any(s['tick'] <= n[0] < s['tick']+15360 for n in track))
    notes = [n for n in track if section['tick'] <= n[0] < section['tick']+15360]
    offsets = Counter(n[0] % 480 for n in notes)
    lengths = Counter(n[2] for n in notes)
    report['parts'][voice] = {
        'reference_variant':section['label'], 'note_count':len(notes),
        'attack_offset_ticks':dict(sorted(offsets.items())),
        'gate_ticks':dict(lengths.most_common()),
        'pitch_counts':dict(Counter(n[1] for n in notes).most_common()),
        'velocity_range':[min(n[3] for n in notes),max(n[3] for n in notes)],
        'notes':[[n[0]-section['tick'],*n[1:]] for n in notes],
    }
path = ROOT / 'references/master-mod/rhythm-analysis.json'
path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Analyzed {len(report["parts"])} parts: {path}')
