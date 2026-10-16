#!/usr/bin/env python3
"""Retry failed voice lines with adjusted edge-tts parameters.
Run in Colab after main batches complete.

The 4 batch-1 failures were edge-tts 'No audio was received' errors.
This script retries with:
1. Simplified rate/pitch (closer to defaults)
2. Longer timeout and retry with backoff
3. Fallback to alternate voice if primary fails
"""
import asyncio
import edge_tts
import json
import os
import subprocess
import sys
import time

# Fallback voices if primary fails
FALLBACK_CAST = {
    'karens': 'en-US-JennyNeural',
    'valleyGirls': 'en-US-AriaNeural',
    'tradwives': 'en-US-AvaNeural',
    'fratHouse': 'en-US-GuyNeural',
    'brainRot': 'en-US-BrandonNeural',
    'rednecks': 'en-US-ChristopherNeural',
    'gymRats': 'en-US-DavisNeural',
    'cloutStreamers': 'en-US-JasonNeural',
    'wallstreetBets': 'en-US-EricNeural',
    'hoaDads': 'en-US-AndrewNeural',
    'fabulous': 'en-AU-NeilNeural',
    'trumpers': 'en-US-RogerNeural',
    'furries': 'en-GB-RyanNeural',
    'animeWeebs': 'en-US-BrandonNeural',
    'pickleballRetirees': 'en-AU-WilliamNeural',
    'wokeLibs': 'en-US-SaraNeural',
}

async def gen_with_retry(text, voice, rate, pitch, out_mp3, max_retries=3):
    """Try primary voice, then fallback with simplified params."""
    for attempt in range(max_retries):
        try:
            # First try: original params
            if attempt == 0:
                await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(out_mp3)
            # Second try: simplified params (closer to defaults)
            elif attempt == 1:
                await edge_tts.Communicate(text, voice, rate="+10%", pitch="+0Hz").save(out_mp3)
            # Third try: fallback voice with default params
            else:
                fid = out_mp3.split('/')[-1].split('_')[0]
                fallback = FALLBACK_CAST.get(fid, 'en-US-AvaNeural')
                await edge_tts.Communicate(text, fallback).save(out_mp3)
            return True
        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # exponential backoff
    return False

def mp3_to_ogg(mp3_path, ogg_path):
    r = subprocess.run(
        ['ffmpeg', '-y', '-i', mp3_path, '-c:a', 'libvorbis', '-q:a', '4', ogg_path],
        capture_output=True
    )
    return r.returncode == 0

async def main():
    # Failed lines from batch 1 (to be updated as more batches complete)
    # Format: (filename, text, voice, rate, pitch)
    failed_lines = []
    
    # Load from failures file if it exists
    if os.path.exists('/tmp/failed_lines.json'):
        with open('/tmp/failed_lines.json') as f:
            failed_lines = json.load(f)
    
    if not failed_lines:
        print("No failed lines to retry. Exiting.")
        return
    
    print(f"Retrying {len(failed_lines)} failed lines...")
    
    outdir = "/tmp/retry_batch"
    os.makedirs(outdir, exist_ok=True)
    
    done = 0
    still_failed = []
    
    for fname, text, voice, rate, pitch in failed_lines:
        mp3 = os.path.join(outdir, fname + '.mp3')
        ogg = os.path.join(outdir, fname + '.ogg')
        
        ok = await gen_with_retry(text, voice, rate, pitch, mp3)
        if ok and mp3_to_ogg(mp3, ogg):
            if os.path.exists(mp3):
                os.remove(mp3)
            done += 1
            print(f"  ✓ {fname}")
        else:
            still_failed.append((fname, text, voice, rate, pitch))
            print(f"  ✗ {fname} (still failing)")
    
    print(f"\nRetry complete: {done} recovered, {len(still_failed)} still failing")
    
    # Save still-failing for manual review
    if still_failed:
        with open('/tmp/still_failing.json', 'w') as f:
            json.dump(still_failed, f, indent=2)
        print(f"Still-failing lines saved to /tmp/still_failing.json")

if __name__ == '__main__':
    asyncio.run(main())
