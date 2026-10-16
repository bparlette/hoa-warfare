// T11: deterministic, resumable VO synthesis pipeline.
// Reads the recording sheet (node tools/script_tools.mjs csv), synthesizes one
// .ogg per line ID with faction-specific voice/pitch/rate, and writes
// web/vo/manifest.json (rich schema; web/src/engine/audio.js also accepts the
// legacy flat-array schema).
//
// Usage:
//   node tools/script_tools.mjs csv > dist/vo_session_sheet.csv
//   node tools/vo_synth.mjs [--csv dist/vo_session_sheet.csv] [--out web/vo]
//                            [--workers 4] [--force]
//
// Resumable: existing .ogg files that pass ffprobe validation are skipped.
// Failures are recorded in <out>/.failures.json and retried up to 3 attempts
// per run (fresh budget each run; only rows still missing output are queued).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Faction -> voice casting. Voices verified against the Shortwave catalog
// (2026-10-15). Pitch comes from data/hoa_content.json faction metadata;
// rate is floored at 1.25 for a fast pace across all factions (Cherie 2026-10-15).
const CAST = {
  fratHouse:      { voice: 'avocado_v2:qvd_00059',                pitch: 1.00, rate: 1.25, gender: 'm' },
  brainRot:       { voice: 'avocado_v2:qvd_00173',                pitch: 1.70, rate: 1.35, gender: 'm' },
  valleyGirls:    { voice: 'avocado_v2:rumi',                     pitch: 1.50, rate: 1.25, gender: 'f' },
  oldMoney:       { voice: 'avocado_v2:magnus',                   pitch: 0.60, rate: 1.25, gender: 'm' },
  rednecks:       { voice: 'avocado_v2:bud',                      pitch: 0.80, rate: 1.25, gender: 'm' },
  karens:         { voice: 'avocado_v2:Karen',                    pitch: 1.25, rate: 1.25, gender: 'f' },
  gymRats:        { voice: 'avocado_v2:hubert',                    pitch: 0.75, rate: 1.25, gender: 'm' },
  theaterKids:    { voice: 'avocado_v2:vd2_r82_rep5k_0497_v068_28k_g5k', pitch: 1.30, rate: 1.25, gender: 'f' },
  cloutStreamers: { voice: 'avocado_v2:vdc_3944',                 pitch: 1.10, rate: 1.30, gender: 'm' },
  wallstreetBets:         { voice: 'avocado_v2:qvd_01114',                 pitch: 0.95, rate: 1.30, gender: 'm' },
  emoKids:        { voice: 'avocado_v2:vd_sinister_chalice',       pitch: 0.90, rate: 1.25, gender: 'm' },
  fabulous:        { voice: 'avocado_v2:qvd_00262',                 pitch: 1.15, rate: 1.25, gender: 'm' },
  trumpers:       { voice: 'avocado_v2:vdc_13210',                 pitch: 0.80, rate: 1.25, gender: 'm' },
  wokeLibs:       { voice: 'avocado_v2:MAI_03',                    pitch: 1.10, rate: 1.25, gender: 'f' },
  // Shared voices differentiated by pace/pitch per character (Cherie 2026-10-15):
  // same voice is fine — the pace makes them distinct.
  tradwives:      { voice: 'avocado_v2:MAI_03',                    pitch: 1.05, rate: 1.00, gender: 'f' },
  mlmHuns:        { voice: 'avocado_v2:MAI_03',                    pitch: 1.35, rate: 1.40, gender: 'f' },
  pickleballRetirees: { voice: 'avocado_v2:vdc_22255',            pitch: 0.90, rate: 1.35, gender: 'm' },
  hoaDads:        { voice: 'avocado_v2:vdc_22255',                 pitch: 0.85, rate: 1.15, gender: 'm' },
  animeWeebs:     { voice: 'avocado_v2:qvd_00173',                 pitch: 1.50, rate: 1.40, gender: 'm' },
  furries:        { voice: 'avocado_v2:qvd_00262',                 pitch: 1.40, rate: 1.30, gender: 'm' },
};

const TTS = '/opt/hatch/bin/tts';
const MAX_ATTEMPTS = 3;

function parseArgs(argv) {
  const o = { csv: join(ROOT, 'dist/vo_session_sheet.csv'), out: join(ROOT, 'web/vo'), workers: 4, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--csv') o.csv = argv[++i];
    else if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--workers') o.workers = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (argv[i] === '--force') o.force = true;
  }
  return o;
}

// Minimal RFC4180 CSV parser (handles quoted fields with embedded commas/quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function ffprobe(path) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_name,sample_rate,channels',
    '-of', 'json', path], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const st = (j.streams || [])[0] || {};
    const dur = parseFloat(j.format?.duration);
    if (!dur || dur < 0.2) return null;
    if (!/vorbis|opus/i.test(st.codec_name || '')) return null;
    return { duration: dur, codec: st.codec_name };
  } catch { return null; }
}

function peakDb(path) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect',
    '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume:\s*(-?\d+(\.\d+)?)\s*dB/.exec((r.stderr || '') + (r.stdout || ''));
  return m ? parseFloat(m[1]) : null;
}

// Strip *action* markup the same way audio.js does before TTS.
function cleanText(t) {
  return t.replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();
}

// Backend-hostile tokens: the TTS backend returns empty audio for these
// exact inputs (verified 2026-10-15). Map to phonetic equivalents for the
// synthesis input ONLY; the manifest keeps the canonical text and records
// the substitution as synth_text.
const SYNTH_NORMALIZE = {
  'YEEHAW!': 'Yee haw!',
  'Wrassled!': 'Rassled!',
};

function synthRow(row, outDir, tmpDir) {
  const id = row.id, file = row.file;
  const cast = CAST[row.faction];
  if (!cast) return { ok: false, error: `no cast for faction ${row.faction}` };
  const expected = id.replace(/\./g, '_') + '.ogg';
  if (file !== expected) return { ok: false, error: `filename mismatch: csv=${file} expected=${expected}` };
  const cleaned = cleanText(row.text);
  const text = SYNTH_NORMALIZE[cleaned] || cleaned;
  if (!text) return { ok: false, error: 'empty text after markup strip' };
  const outPath = join(outDir, file);
  const tmpMp3 = join(tmpDir, file.replace(/\.ogg$/, '.mp3'));
  const tmpOgg = join(tmpDir, file);

  const tts = spawnSync(TTS, ['speak', '--text', text, '--voice', cast.voice,
    '--speed', String(Math.round(cast.rate * 100)),
    '--output', tmpMp3, '--timeout-secs', '120'], { encoding: 'utf8' });
  if (tts.status !== 0 || !existsSync(tmpMp3)) {
    return { ok: false, error: `tts failed: ${(tts.stderr || '').slice(0, 200)}` };
  }
  const af = `rubberband=pitch=${cast.pitch},` +
    `silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB,` +
    `areverse,silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB,areverse`;
  const ff = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', tmpMp3, '-af', af, '-c:a', 'libvorbis', '-q:a', '4', tmpOgg],
    { encoding: 'utf8' });
  if (ff.status !== 0 || !existsSync(tmpOgg)) {
    return { ok: false, error: `ffmpeg failed: ${(ff.stderr || '').slice(0, 200)}` };
  }
  const probe = ffprobe(tmpOgg);
  if (!probe) return { ok: false, error: 'ffprobe validation failed on output' };
  renameSync(tmpOgg, outPath);
  return {
    ok: true, duration: probe.duration, peak_db: peakDb(outPath), voice: cast.voice,
    synth_input: text, canonical: cleaned,
  };
}

async function pool(items, workers, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (e) { results[idx] = { ok: false, error: String(e).slice(0, 200) }; }
    }
  }));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });
  const tmpDir = join(args.out, '.tmp');
  mkdirSync(tmpDir, { recursive: true });

  const rows = parseCsv(readFileSync(args.csv, 'utf8'));
  const header = rows.shift();
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const need of ['file', 'id', 'faction', 'event', 'text']) {
    if (!(need in idx)) { console.error(`csv missing column: ${need}`); process.exit(1); }
  }
  const data = rows.filter(r => r.length > 1).map(r => ({
    file: r[idx.file], id: r[idx.id], faction: r[idx.faction],
    event: r[idx.event], text: r[idx.text],
  }));
  const ids = new Set(data.map(r => r.id));
  if (ids.size !== data.length) { console.error('duplicate ids in csv'); process.exit(1); }
  console.log(`rows: ${data.length}`);

  // Load existing manifest for resumability.
  const manifestPath = join(args.out, 'manifest.json');
  let manifest = { version: 1, generated: null, lines: {} };
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (m && m.lines) manifest = m;
    } catch { /* rebuild */ }
  }
  const failuresPath = join(args.out, '.failures.json');
  let failures = {};
  if (existsSync(failuresPath)) {
    try { failures = JSON.parse(readFileSync(failuresPath, 'utf8')); } catch { failures = {}; }
  }

  const todo = [];
  for (const row of data) {
    const outPath = join(args.out, row.file);
    if (!args.force && existsSync(outPath)) {
      const probe = ffprobe(outPath);
      if (probe && manifest.lines[row.id]?.file === row.file) {
        manifest.lines[row.id].duration = probe.duration; // refresh
        continue;
      }
    }
    todo.push(row);
  }
  console.log(`to synthesize: ${todo.length} (skipping ${data.length - todo.length} valid)`);

  let done = 0, failed = 0;
  await pool(todo, args.workers, (row) => {
    // Fresh attempt budget per run: todo only contains rows still missing
    // valid output, so they always deserve work. failures.json is the log.
    let attempt = 0;
    let res = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      res = synthRow(row, args.out, tmpDir);
      if (res.ok) break;
    }
    if (res.ok) {
      manifest.lines[row.id] = {
        file: row.file, duration: +res.duration.toFixed(3),
        faction: row.faction, event: row.event, text: row.text,
        ...(res.synth_input !== res.canonical ? { synth_text: res.synth_input } : {}),
        voice: res.voice, pitch: CAST[row.faction].pitch, rate: CAST[row.faction].rate,
        peak_db: res.peak_db,
      };
      delete failures[row.id];
      done++;
    } else {
      failures[row.id] = { attempts: attempt, error: res.error };
      failed++;
    }
    if ((done + failed) % 50 === 0) process.stderr.write(`\rprogress: ${done + failed}/${todo.length} (failed ${failed})`);
  });
  process.stderr.write('\n');

  manifest.generated = new Date().toISOString();
  manifest.count = Object.keys(manifest.lines).length;
  try {
    manifest.commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  } catch { /* ignore */ }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  writeFileSync(failuresPath, JSON.stringify(failures, null, 1));
  console.log(`manifest: ${manifest.count}/${data.length} lines`);
  console.log(`failures: ${failed} (see ${failuresPath})`);
  if (failed) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
