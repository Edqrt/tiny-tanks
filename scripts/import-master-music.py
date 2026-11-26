"""Rebuild browser music data from the locally downloaded reference archive."""
import base64
import collections
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / 'references/master-mod'
VOICES = ['piccolo', 'chimes', 'timpani', 'snare', 'bassDrum', 'cymbal', 'triangle', 'sawtooth', 'tuba']
PROGRAMS = [0, 6, 2, 1, 2, 2, 3, 5, 4]
ROLES = {
    'piccolo': {'name':'Piccolo', 'role':'全編成で共通の主旋律', 'notes_per_loop':138},
    'snare': {'name':'Snare Drum', 'role':'行進曲の刻みとロール。弱打・強打のサンプルを切り替える'},
    'timpani': {'name':'Timpani', 'role':'音程のある低音とロール。台数別に疎密のパターンを切り替える'},
    'bassDrum': {'name':'Bass Drum', 'role':'一定音高の低域アクセント', 'notes_per_loop':20},
    'cymbal': {'name':'Cymbal', 'role':'長い余韻で拍を強調するアクセント'},
    'triangle': {'name':'Triangle', 'role':'短い音と長い音を交互に使う裏拍の刻み', 'notes_per_loop':32},
    'tuba': {'name':'Tuba', 'role':'短い低音による和声とリズムの伴奏', 'notes_per_loop':46},
    'chimes': {'name':'Chimes', 'role':'長い音を重ねる和声的なパート', 'notes_per_loop':24},
    'sawtooth': {'name':'Sawtooth', 'role':'ピッコロの主旋律を3オクターブ下で補強', 'notes_per_loop':114},
}
# Color correspondences; priority is separately controlled by the game.
TYPES = {'Bronze':'brown', 'Silver':'grey', 'Sapphire':'teal', 'Ruby':'red',
         'Citrine':'yellow', 'Amethyst':'purple', 'Emerald':'green', 'Gold':'white', 'Obsidian':'black'}


def read_midi(path):
    data = path.read_bytes()
    _, tracks, ppq = struct.unpack_from('>HHH', data, 8)
    assert ppq == 480
    pos = 8 + struct.unpack_from('>I', data, 4)[0]
    result = []
    for track in range(tracks):
        assert data[pos:pos+4] == b'MTrk'
        size = struct.unpack_from('>I', data, pos+4)[0]
        buf = data[pos+8:pos+8+size]
        pos += size + 8
        offset = tick = 0
        running = None
        held = collections.defaultdict(collections.deque)
        notes = []
        volumes = collections.defaultdict(lambda: 100)
        expressions = collections.defaultdict(lambda: 127)
        pans = collections.defaultdict(lambda: 64)

        def vlq():
            nonlocal offset
            value = 0
            while True:
                byte = buf[offset]
                offset += 1
                value = (value << 7) | (byte & 127)
                if byte < 128:
                    return value

        while offset < len(buf):
            tick += vlq()
            status = buf[offset]
            if status >= 128:
                offset += 1
            else:
                assert running is not None
                status = running
            if status == 255:
                offset += 1  # meta type
                size = vlq()
                offset += size
                continue
            if status in (240, 247):
                size = vlq()
                offset += size
                continue
            running = status
            kind, channel = status & 240, status & 15
            size = 1 if kind in (192, 208) else 2
            args = buf[offset:offset+size]
            offset += size
            if kind == 176:
                if args[0] == 7:
                    volumes[channel] = args[1]
                elif args[0] == 11:
                    expressions[channel] = args[1]
                elif args[0] == 10:
                    pans[channel] = args[1]
            elif kind == 144 and args[1]:
                held[channel, args[0]].append((tick, args[1], volumes[channel], expressions[channel], pans[channel]))
            elif kind == 128 or (kind == 144 and not args[1]):
                if held[channel, args[0]]:
                    start, velocity, volume, expression, pan = held[channel, args[0]].popleft()
                    notes.append([start, args[0], tick-start, velocity, volume, expression, pan])
        assert not any(held.values()), f'Unterminated MIDI notes in track {track}'
        result.append(sorted(notes))
    return result


def score_sections():
    with zipfile.ZipFile(REFERENCE / 'Wii_Tanks_Master_OST.mscz') as archive:
        tree = ET.fromstring(archive.read('Wii_Tanks_Master_OST.mscx'))
    tick = 0
    signature = Fraction(4, 4)
    sections = []
    for index, measure in enumerate(tree.findall('./Score/Staff')[0].findall('Measure')):
        time_sig = measure.find('.//TimeSig')
        if time_sig is not None:
            signature = Fraction(int(time_sig.findtext('sigN')), int(time_sig.findtext('sigD')))
        for text in measure.findall('.//StaffText/text'):
            if text.text and ' Tank' in text.text:
                label = text.text
                gem = label.split()[0]
                count = int(label.rsplit('x', 1)[1]) if ' x' in label else 1
                sections.append({'label':label, 'type':TYPES[gem], 'count':count,
                                 'measure':index+1, 'tick':int(tick)})
        tick += Fraction(measure.attrib.get('len', str(signature))) * 4 * 480
    return sections


def read_soundfont():
    data = (REFERENCE / 'Wii_Play_Tanks_Soundfont.sf2').read_bytes()

    def chunks(start, end):
        while start+8 <= end:
            tag = data[start:start+4].decode()
            size = struct.unpack_from('<I', data, start+4)[0]
            yield tag, start+8, size
            start += size+8+(size % 2)

    tables = {}
    pcm = None
    for tag, pos, size in chunks(12, len(data)):
        if tag == 'LIST' and data[pos:pos+4] == b'pdta':
            tables = {name:data[p:p+s] for name, p, s in chunks(pos+4, pos+size)}
        if tag == 'LIST' and data[pos:pos+4] == b'sdta':
            pcm = next(data[p:p+s] for name, p, s in chunks(pos+4, pos+size) if name == 'smpl')
    samples = list(struct.iter_unpack('<20sIIIIIBbHH', tables['shdr']))[:-1]
    instruments = list(struct.iter_unpack('<20sH', tables['inst']))
    bags = list(struct.iter_unpack('<HH', tables['ibag']))
    generators = list(struct.iter_unpack('<HH', tables['igen']))
    patches = []
    signed = lambda value: value if value < 32768 else value-65536
    time_seconds = lambda value: 0 if signed(value) == -32768 else 2 ** (signed(value)/1200)
    for index in range(7):  # The fanfare is a separate one-shot, not a battle part.
        regions = []
        for bag in range(instruments[index][1], instruments[index+1][1]):
            gen = dict(generators[bags[bag][0]:bags[bag+1][0]])
            if 53 not in gen:
                continue
            sample = samples[gen[53]]
            regions.append({
                'sample':gen[53], 'keys':[gen[43] & 255, gen[43] >> 8],
                'velocities':[gen[44] & 255, gen[44] >> 8],
                'root':gen.get(58, sample[6]), 'tune':signed(gen.get(52, 0))+sample[7],
                'mode':gen.get(54, 0), 'attack':time_seconds(gen.get(34, 53536)),
                'decay':time_seconds(gen.get(36, 53536)), 'sustain':10 ** (-gen.get(37, 0)/200),
                'release':time_seconds(gen.get(38, 53536)),
                'gain':10 ** (-gen.get(48, 0)/200),
            })
        patches.append(regions)
    used = sorted({r['sample'] for patch in patches for r in patch})
    headers = []
    packed = bytearray()
    for index in used:
        name, start, end, loop_start, loop_end, rate, *_ = samples[index]
        headers.append({'offset':len(packed)//2, 'length':end-start, 'rate':rate,
                        'loopStart':(loop_start-start)/rate, 'loopEnd':(loop_end-start)/rate})
        packed.extend(pcm[start*2:end*2])
    assert used == list(range(len(used)))
    return patches, headers, base64.b64encode(packed).decode()


def main():
    midi = read_midi(REFERENCE / 'Wii_Tanks_Master_OST.mid')
    sections = score_sections()
    patterns, pattern_lookup, arrangements = [], {}, {}
    for section in sections:
        parts, summary = {}, {}
        start, end = section['tick'], section['tick']+15360
        for voice, track in zip(VOICES, midi):
            notes = [[n[0]-start, *n[1:]] for n in track if start <= n[0] < end]
            if not notes:
                continue
            key = json.dumps(notes, separators=(',', ':'))
            if key not in pattern_lookup:
                pattern_lookup[key] = len(patterns)
                patterns.append(notes)
            parts[voice] = pattern_lookup[key]
            summary[voice] = {'notes':len(notes), 'pitch_range':[min(n[1] for n in notes), max(n[1] for n in notes)]}
        name = f"{section['type']}:{section['count']}"
        arrangements[name] = {'parts':parts, 'label':section['label']}
        section['parts'] = summary
    patches, samples, pcm = read_soundfont()
    compact = lambda obj: json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    (REFERENCE / 'reference-score.js').write_text(
        '// Generated by scripts/import-master-music.py from the reference MIDI.\n'
        'export const MUSIC_PPQ = 480;\nexport const MUSIC_LOOP_TICKS = 15360;\n'
        f'export const MUSIC_PATTERNS = {compact(patterns)};\n'
        f'export const MUSIC_ARRANGEMENTS = {compact(arrangements)};\n'
        f'export const MUSIC_PROGRAMS = {compact(dict(zip(VOICES, PROGRAMS)))};\n', encoding='utf-8')
    (ROOT / 'src/music-bank.js').write_text(
        '// Generated from Wii_Play_Tanks_Soundfont.sf2; PCM16 little-endian.\n'
        f'export const MUSIC_PATCHES = {compact(patches)};\n'
        f'export const MUSIC_SAMPLES = {compact(samples)};\n'
        f'export const MUSIC_PCM = "{pcm}";\n', encoding='utf-8')
    report = {'source_video':'https://www.youtube.com/watch?v=MV3aX8Cwb40',
              'source_archive':'https://drive.google.com/file/d/1LdQGziSkAWxaUlLYZMipMggMGLsRL1Dz/view',
              'source_midi_sha256':hashlib.sha256((REFERENCE / 'Wii_Tanks_Master_OST.mid').read_bytes()).hexdigest(),
              'bpm':120, 'loop_beats':32, 'sections':sections,
              'color_mapping':TYPES, 'instrument_roles':ROLES,
              'runtime_rules':{'priority':['brown','grey','teal','yellow','red','purple','green','white','black'],
                               'variant_count':'total surviving enemy tanks, capped at the last supplied variant',
                               'black':'fixed variant regardless of count'},
              'limitations':['Color mapping is based on gem colors; priority uses the user-supplied order.',
                             'MIDI documents arrangements, not mixed-enemy runtime switching rules.',
                             'Playback uses SoundFont samples and volume envelopes; reverb and modulators are not emulated.']}
    (REFERENCE / 'arrangements.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    analysis_path = REFERENCE / 'analysis.json'
    if analysis_path.exists():
        analysis = json.loads(analysis_path.read_text(encoding='utf-8'))
        analysis['instrument_roles'] = ROLES
        analysis['arrangement_details'] = 'arrangements.json'
        analysis['runtime_rules'] = report['runtime_rules']
        analysis['playback_limitations'] = report['limitations']
        analysis_path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Imported {len(arrangements)} arrangements, {len(patterns)} unique part patterns, {len(samples)} samples.')
    for section in sections:
        print(section['label'], section['tick'], ', '.join(section['parts']))


if __name__ == '__main__':
    main()
