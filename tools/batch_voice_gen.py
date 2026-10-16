#!/usr/bin/env python3
"""Batched voice generation for HOA Warfare. Run in Colab.
Usage: python3 batch_voice_gen.py <batch_num> [batch_size]
Each batch generates 50 lines, converts MP3->OGG, saves to /tmp/batch_N/.
After each batch, upload the .ogg files to GitHub web/vo/ via browser.
"""
import asyncio, edge_tts, json, os, subprocess, sys, requests
import xml.sax.saxutils as saxutils

CAST = {
    'karens': ('en-US-AvaNeural', '+25%', '+15Hz'),
    'valleyGirls': ('en-US-JennyNeural', '+20%', '+10Hz'),
    'tradwives': ('en-US-AriaNeural', '+10%', '+5Hz'),  # SaraNeural removed by MS
    'fratHouse': ('en-US-AndrewNeural', '+25%', '+0Hz'),
    'brainRot': ('en-US-AndrewNeural', '+30%', '+5Hz'),  # JasonNeural removed by MS
    'rednecks': ('en-US-DavisNeural', '+15%', '-5Hz'),
    'gymRats': ('en-US-GuyNeural', '+20%', '-5Hz'),
    'cloutStreamers': ('en-US-AndrewNeural', '+25%', '+5Hz'),  # BrandonNeural removed by MS
    'wallstreetBets': ('en-US-ChristopherNeural', '+15%', '+0Hz'),
    'hoaDads': ('en-US-RogerNeural', '+10%', '-10Hz'),
    'fabulous': ('en-AU-WilliamNeural', '+15%', '+5Hz'),
    'trumpers': ('en-US-SteffanNeural', '+10%', '-5Hz'),
    'furries': ('en-GB-ThomasNeural', '+20%', '+10Hz'),
    'animeWeebs': ('en-US-EricNeural', '+25%', '+15Hz'),
    'pickleballRetirees': ('en-AU-NeilNeural', '+5%', '-15Hz'),
    'wokeLibs': ('en-US-MichelleNeural', '+15%', '+10Hz'),
}

def sanitize_text(text):
    """Escape XML special chars and strip emojis that break edge-tts SSML."""
    # Escape &, <, > for SSML
    text = saxutils.escape(text)
    # Remove emojis and other non-BMP characters that break the TTS service
    text = ''.join(c for c in text if ord(c) < 0x10000)
    return text.strip()

async def gen_line(text, voice, rate, pitch, out_mp3):
    try:
        clean_text = sanitize_text(text)
        if not clean_text:
            print(f"  SKIP: empty after sanitization")
            return False
        await edge_tts.Communicate(clean_text, voice, rate=rate, pitch=pitch).save(out_mp3)
        return True
    except Exception as e:
        print(f"  FAIL: {e}")
        return False

def mp3_to_ogg(mp3_path, ogg_path):
    r = subprocess.run(['ffmpeg', '-y', '-i', mp3_path, '-c:a', 'libvorbis', '-q:a', '4', ogg_path],
                       capture_output=True)
    return r.returncode == 0

async def main():
    batch_num = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else 50

    # Load content
    with open('/tmp/hoa_content.json') as f:
        data = json.load(f)

    # Check existing files in repo
    existing = set()
    try:
        r = requests.get('https://api.github.com/repos/bparlette/hoa-warfare/contents/web/vo?ref=main', timeout=30)
        if r.status_code == 200:
            for f in r.json():
                if f['name'].endswith('.ogg'):
                    existing.add(f['name'][:-4])
    except Exception as e:
        print(f"Warning: could not check existing files: {e}")
    print(f"Already have {len(existing)} voice files in repo")

    # Collect all lines
    all_lines = []
    for fid, fdata in data.get('factions', {}).items():
        if fid not in CAST:
            continue
        voice, rate, pitch = CAST[fid]
        for event, variants in fdata.get('lines', {}).items():
            for vname, vlines in variants.items():
                for i, l in enumerate(vlines):
                    if isinstance(l, dict):
                        if l.get('retired'):
                            continue
                        text = l.get('t', '')
                    else:
                        text = l
                    if not text or not isinstance(text, str):
                        continue
                    fname = f"{fid}_{event}_{vname[0]}_{i}"
                    if fname in existing:
                        continue
                    all_lines.append((fname, text, voice, rate, pitch))

    # Prioritize demo factions first
    DEMO_FACTIONS = ['karens', 'tradwives', 'hoaDads', 'furries', 'trumpers', 'pickleballRetirees']
    all_lines.sort(key=lambda x: (0 if x[0].split('_')[0] in DEMO_FACTIONS else 1, x[0]))

    print(f"Total lines needing generation: {len(all_lines)}")

    # Slice batch
    start = (batch_num - 1) * batch_size
    batch = all_lines[start:start + batch_size]
    print(f"Batch {batch_num}: lines {start} to {start + len(batch)}")

    outdir = f"/tmp/batch_{batch_num}"
    os.makedirs(outdir, exist_ok=True)

    done, failed = 0, 0
    for fname, text, voice, rate, pitch in batch:
        mp3 = os.path.join(outdir, fname + '.mp3')
        ogg = os.path.join(outdir, fname + '.ogg')
        if os.path.exists(ogg):
            continue
        ok = await gen_line(text, voice, rate, pitch, mp3)
        if ok and mp3_to_ogg(mp3, ogg):
            os.remove(mp3)
            done += 1
        else:
            failed += 1
        if (done + failed) % 10 == 0:
            print(f"  Progress: {done} done, {failed} failed")

    print(f"\nBatch {batch_num} complete: {done} generated, {failed} failed")
    print(f"Files in {outdir}/ ready for GitHub upload")

asyncio.run(main())
