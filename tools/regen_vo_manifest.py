#!/usr/bin/env python3
"""Regenerate web/vo/manifest.json from actual .ogg files in the repo.
Run locally after all voice batches are uploaded.

This scans web/vo/*.ogg, probes each for duration, and builds the manifest
mapping line IDs to file metadata.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

def probe_duration(ogg_path):
    """Get audio duration in seconds via ffprobe."""
    r = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', str(ogg_path)],
        capture_output=True, text=True, timeout=10
    )
    if r.returncode == 0 and r.stdout.strip():
        return float(r.stdout.strip())
    return 0.0

def main():
    repo_root = Path(__file__).parent.parent
    vo_dir = repo_root / 'web' / 'vo'
    
    # Load content for line metadata
    with open(repo_root / 'data' / 'hoa_content.json') as f:
        content_data = json.load(f)
    
    # Build lookup: filename -> (line_id, text, faction, event)
    file_to_line = {}
    for fid, fdata in content_data.get('factions', {}).items():
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
                    fname = f"{fid}_{event}_{vname[0]}_{i}.ogg"
                    line_id = f"{fid}.{event}.{vname[0]}.{i}"
                    file_to_line[fname] = {
                        'line_id': line_id,
                        'text': text,
                        'faction': fid,
                        'event': event,
                    }
    
    # Scan actual .ogg files
    manifest = {
        'version': 1,
        'generated': subprocess.run(
            ['date', '-u', '+%Y-%m-%dT%H:%M:%S.000Z'],
            capture_output=True, text=True
        ).stdout.strip(),
        'lines': {}
    }
    
    ogg_files = sorted(vo_dir.glob('*.ogg'))
    print(f"Found {len(ogg_files)} .ogg files")
    
    matched = 0
    unmatched = []
    
    for ogg_path in ogg_files:
        fname = ogg_path.name
        duration = probe_duration(ogg_path)
        
        if fname in file_to_line:
            info = file_to_line[fname]
            manifest['lines'][info['line_id']] = {
                'file': fname,
                'duration': round(duration, 5),
                'faction': info['faction'],
                'event': info['event'],
                'text': info['text'],
            }
            matched += 1
        else:
            unmatched.append(fname)
    
    print(f"Matched: {matched}")
    print(f"Unmatched (stale or cut faction): {len(unmatched)}")
    if unmatched:
        print(f"  Examples: {unmatched[:5]}")
    
    # Write manifest
    manifest_path = vo_dir / 'manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    print(f"\nManifest written to {manifest_path}")
    print(f"Total lines in manifest: {len(manifest['lines'])}")

if __name__ == '__main__':
    main()
