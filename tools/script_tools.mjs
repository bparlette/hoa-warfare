#!/usr/bin/env node
// Script tooling.  node tools/script_tools.mjs lint | csv > dist/vo_session_sheet.csv | stats
import { readFileSync } from 'node:fs';
import { ContentLibrary, estimateSeconds, countWords } from '../web/src/core/content.js';

const content = JSON.parse(readFileSync(new URL('../data/hoa_content.json', import.meta.url)));
const lib = new ContentLibrary(content);
const rows = lib.allLines().filter(r => !r.retired);
const wps = content.rules.wordsPerSecond, max = content.rules.maxBarkSec;
const cmd = process.argv[2] || 'lint';

if (cmd === 'lint') {
  let fails = 0;
  for (const r of rows) {
    const s = estimateSeconds(r.text, wps);
    if (s > max) { fails++; console.log(`TOO LONG ${s.toFixed(2)}s  ${r.id}  "${r.text}"`); }
  }
  for (const [id, f] of Object.entries(content.factions))
    for (const ev of content.requiredEvents) if (!f.lines[ev]?.clean?.length) { fails++; console.log(`MISSING  ${id}.${ev}`); }
  const flagged = rows.filter(r => r.flag);
  console.log(`${rows.length} lines, ${flagged.length} legal-flagged, ${fails} problems`);
  process.exit(fails ? 1 : 0);
} else if (cmd === 'csv') {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  console.log('file,id,faction,event,victim,script,variant,flag,words,est_sec,text');
  for (const r of rows)
    console.log([r.id.replace(/\./g, '_') + '.ogg', r.id, r.faction, r.event, r.victim, r.script, r.variant, r.flag, countWords(r.text), estimateSeconds(r.text, wps).toFixed(2), r.text].map(esc).join(','));
} else if (cmd === 'stats') {
  const by = {};
  for (const r of rows) by[r.faction] = (by[r.faction] || 0) + 1;
  console.table(by);
  console.log('total', rows.length, '| clean', rows.filter(r => r.script === 'clean').length, '| steam', rows.filter(r => r.script === 'steam').length);
}
