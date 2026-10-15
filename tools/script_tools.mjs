#!/usr/bin/env node
// Script tooling.  node tools/script_tools.mjs lint | audit | rivalry | csv > dist/vo_session_sheet.csv | stats
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
    if (f.status !== 'draft') for (const ev of content.requiredEvents) if (!f.lines[ev]?.clean?.length) { fails++; console.log(`MISSING  ${id}.${ev}`); }
  const flagged = rows.filter(r => r.flag);
  console.log(`${rows.length} lines, ${flagged.length} legal-flagged, ${fails} problems`);
  process.exit(fails ? 1 : 0);
} else if (cmd === 'csv') {
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  console.log('file,id,faction,event,victim,script,variant,flag,words,est_sec,text');
  for (const r of rows)
    console.log([r.id.replace(/\./g, '_') + '.ogg', r.id, r.faction, r.event, r.victim, r.script, r.variant, r.flag, countWords(r.text), estimateSeconds(r.text, wps).toFixed(2), r.text].map(esc).join(','));
} else if (cmd === 'audit') {
  // Content QA for writers: lint + duplicates + brand terms without a legal-safe alt + thin pools.
  // Exit 1 on hard problems (too long, missing, duplicate); brand/thin-pool findings are warnings.
  const BRANDS = /\b(zyn|amex|american express|uber|ozempic|wegovy|stanley|tesla|starbucks|tiktok|instagram|insta|youtube|twitch|kick|roblox|fortnite|call of duty|cod|apple|ipad|iphone|peloton|lululemon|crocs|red bull|monster|prime|venmo|cashapp|patagonia|new balance|mrbeast|netflix|amazon|walmart|costco|target|chipotle|white claw|natty|bud light|juul|vuse|airpods|xbox|playstation|nintendo|disney|marvel|my chemical romance|skibidi)\b/i;
  let hard = 0, warn = 0;
  const seen = new Map();
  for (const r of rows) {
    const k = r.text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(k) && r.variant === 'primary') { hard++; console.log(`DUPLICATE  ${r.id}  ==  ${seen.get(k)}  "${r.text}"`); }
    else seen.set(k, r.id);
    const s = estimateSeconds(r.text, wps);
    if (s > max) { hard++; console.log(`TOO LONG   ${s.toFixed(2)}s  ${r.id}  "${r.text}"`); }
  }
  for (const [id, f] of Object.entries(content.factions)) {
    if (f.status === 'draft') {
      const done = content.requiredEvents.filter(ev => f.lines[ev]?.clean?.length).length;
      warn++; console.log(`DRAFT      ${id}: ${done}/${content.requiredEvents.length} events written (remove "status" when complete)`);
      continue;
    }
    for (const ev of content.requiredEvents) if (!f.lines[ev]?.clean?.length) { hard++; console.log(`MISSING    ${id}.${ev}`); }
  }
  const hasAlt = new Set(rows.filter(r => r.variant === 'legal-alt').map(r => r.id.replace(/\.alt$/, '')));
  for (const r of rows.filter(r => r.variant === 'primary')) {
    const m = r.text.match(BRANDS);
    if (m && !hasAlt.has(r.id)) { warn++; console.log(`BRAND      ${r.id}  "${m[0]}" has no legal-safe alt  "${r.text}"`); }
  }
  for (const [id, f] of Object.entries(content.factions))
    for (const ev of f.status === 'draft' ? [] : ['kill', 'headshot', 'double']) {
      const n = (f.lines[ev]?.clean || []).length;
      if (n < 2) { warn++; console.log(`THIN POOL  ${id}.${ev}.clean has ${n} line(s); players will hear repeats`); }
    }
  console.log(`\n${rows.length} lines | ${hard} hard problems | ${warn} warnings`);
  process.exit(hard ? 1 : 0);
} else if (cmd === 'rivalry') {
  // Rivalry coverage matrix (killer row x victim column). Phase 0 factions listed first.
  const ids = Object.keys(content.factions).sort((a, b) => (content.factions[b].phase0 ? 1 : 0) - (content.factions[a].phase0 ? 1 : 0));
  const have = new Set(content.rivalry.map(r => `${r.killer}>${r.victim}`));
  const short = id => id.slice(0, 5).padEnd(6);
  console.log('killer\\victim'.padEnd(15) + ids.map(short).join(''));
  for (const k of ids) console.log(short(k).padEnd(15) + ids.map(v => (k === v ? '-     ' : have.has(`${k}>${v}`) ? 'X     ' : '.     ')).join(''));
  const missing = [];
  for (const k of ids) for (const v of ids) if (k !== v && !have.has(`${k}>${v}`)) missing.push(`${k}>${v}`);
  const p0 = missing.filter(m => m.split('>').every(f => content.factions[f].phase0));
  console.log(`\n${have.size}/${ids.length * (ids.length - 1)} directional pairs written. Missing Phase 0 pairs (write these first):`);
  console.log(p0.join('\n') || '(none)');
  console.log(`\n${missing.length - p0.length} other missing pairs: node tools/script_tools.mjs rivalry --all`);
  if (process.argv.includes('--all')) console.log(missing.filter(m => !p0.includes(m)).join('\n'));
} else if (cmd === 'stats') {
  const by = {};
  for (const r of rows) by[r.faction] = (by[r.faction] || 0) + 1;
  console.table(by);
  console.log('total', rows.length, '| clean', rows.filter(r => r.script === 'clean').length, '| steam', rows.filter(r => r.script === 'steam').length);
}
