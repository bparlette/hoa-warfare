#!/usr/bin/env python3
"""Remake ALL voice lines from scratch with the '...' trailing pause fix.
Usage: python3 remake_all_voices.py <batch_num> [batch_size]
Each batch generates batch_size lines, converts MP3->OGG with padding.
Run in Colab. Upload .ogg files to GitHub web/vo/ via browser after each batch.
"""
import asyncio, edge_tts, json, os, subprocess, sys
import xml.sax.saxutils as saxutils

CAST = {
    'karens': ('en-US-AvaNeural', '+25%', '+15Hz'),
    'valleyGirls': ('en-US-JennyNeural', '+20%', '+10Hz'),
    'tradwives': ('en-US-AriaNeural', '+10%', '+5Hz'),
    'fratHouse': ('en-US-AndrewNeural', '+25%', '+0Hz'),
    'brainRot': ('en-US-AndrewNeural', '+30%', '+5Hz'),
    'rednecks': ('en-US-DavisNeural', '+15%', '-5Hz'),
    'gymRats': ('en-US-GuyNeural', '+20%', '-5Hz'),
    'cloutStreamers': ('en-US-AndrewNeural', '+25%', '+5Hz'),
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
    text = saxutils.escape(text)
    text = ''.join(c for c in text if ord(c) < 0x10000)
    return text.strip()

async def gen_line(text, voice, rate, pitch, out_mp3):
    try:
        clean_text = sanitize_text(text)
        if not clean_text:
            print(f"  SKIP: empty after sanitization")
            return False
        # Append "..." to force a natural trailing pause — prevents TTS truncation
        if not clean_text.endswith('...'):
            clean_text = clean_text.rstrip('.!?,;:') + '...'
        await edge_tts.Communicate(clean_text, voice, rate=rate, pitch=pitch).save(out_mp3)
        return True
    except Exception as e:
        print(f"  FAIL: {e}")
        return False

def process_audio(mp3_path, ogg_path):
    """Convert MP3 to OGG with padding and fade."""
    # Get duration for fade calculation
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'csv=p=0', mp3_path], capture_output=True, text=True)
    try:
        dur = float(r.stdout.strip())
    except:
        dur = 2.0
    # 0.2s leading silence, 0.3s trailing, 80ms fade-out at end of speech
    af = f'adelay=200|200,apad=pad_dur=0.3,afade=t=out:st={dur + 0.12:.3f}:d=0.08'
    r = subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp3_path,
                        '-c:a', 'libvorbis', '-q:a', '4', '-af', af, ogg_path],
                       capture_output=True)
    return r.returncode == 0

async def main():
    batch_num = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    batch_size = int(sys.argv[2]) if len(sys.argv) > 2 else 50

    with open('/tmp/hoa_content.json') as f:
        data = json.load(f)

    # Collect ALL lines (no skipping)
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
                    all_lines.append((fname, text, voice, rate, pitch))

    # Demo factions first
    DEMO = ['karens', 'tradwives', 'hoaDads', 'furries', 'trumpers', 'pickleballRetirees']
    all_lines.sort(key=lambda x: (0 if x[0].split('_')[0] in DEMO else 1, x[0]))

    total = len(all_lines)
    start = (batch_num - 1) * batch_size
    end = min(start + batch_size, total)
    batch = all_lines[start:end]

    print(f"Batch {batch_num}: lines {start+1}-{end} of {total}")

    outdir = f'/tmp/batch_{batch_num}'
    os.makedirs(outdir, exist_ok=True)

    success = 0
    for fname, text, voice, rate, pitch in batch:
        mp3 = os.path.join(outdir, fname + '.mp3')
        ogg = os.path.join(outdir, fname + '.ogg')
        print(f"  {fname}: '{text[:40]}...'")
        if await gen_line(text, voice, rate, pitch, mp3):
            if process_audio(mp3, ogg):
                # Verify non-zero
                if os.path.getsize(ogg) > 1000:
                    print(f"    OK: {ogg}")
                    success += 1
                    os.remove(mp3)  # Clean up MP3
                else:
                    print(f"    FAIL: zero-byte {ogg}")
            else:
                print(f"    FAIL: ffmpeg {ogg}")
    
    print(f"\nBatch {batch_num} complete: {success}/{len(batch)} succeeded")
    print(f"Files in {outdir}/")

if __name__ == '__main__':
    asyncio.run(main())
