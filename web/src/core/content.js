// Content library: turns data/hoa_content.json into resolved, ID-stamped lines for one build
// configuration (Clean vs Steam script, legal-safe on/off).
//
// Line ID format (also the VO file name, with '.' -> '_'):
//   <faction>.<event>.<c|s>.<index>[.alt]
//   rivalry.<killer>-<victim>.<c|s>.<index>[.alt]
// Arrays in the JSON are append-only so IDs stay stable once VO is recorded.

export function countWords(text) {
  return text.replace(/\*[^*]*\*/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

export function estimateSeconds(text, wordsPerSecond) {
  return countWords(text) / wordsPerSecond;
}

function normalize(raw) {
  return typeof raw === 'string' ? { t: raw } : raw;
}

function resolveList(list, prefix, legalSafe) {
  const out = [];
  (list || []).forEach((raw, i) => {
    const l = normalize(raw);
    if (l.retired) return;
    const useAlt = legalSafe && !!l.alt;
    out.push({
      id: `${prefix}.${i}${useAlt ? '.alt' : ''}`,
      text: useAlt ? l.alt : l.t,
      flag: l.flag || null,
    });
  });
  return out;
}

export class ContentLibrary {
  /**
   * @param {object} content parsed hoa_content.json
   * @param {{script?: 'clean'|'steam', legalSafe?: boolean}} opts
   */
  constructor(content, opts = {}) {
    this.content = content;
    this.rules = content.rules;
    this.events = content.events;
    this.script = opts.script || 'clean';
    this.legalSafe = opts.legalSafe ?? content.rules.legalSafeModeDefault;
    this._cache = new Map();
  }

  setScript(script) { this.script = script; this._cache.clear(); }
  setLegalSafe(on) { this.legalSafe = on; this._cache.clear(); }

  factionIds() { return Object.keys(this.content.factions); }
  faction(id) { return this.content.factions[id]; }

  /** Returns resolved lines for (faction, event). For 'rivalry' pass the victim faction. */
  getLines(factionId, eventId, victimFaction = null) {
    const key = `${factionId}|${eventId}|${victimFaction}`;
    if (this._cache.has(key)) return this._cache.get(key);
    let lines = [];
    if (eventId === 'rivalry') {
      const entry = this.content.rivalry.find(r => r.killer === factionId && r.victim === victimFaction);
      if (entry) lines = this._merge(entry, `rivalry.${factionId}-${victimFaction}`);
    } else {
      const entry = this.content.factions[factionId]?.lines?.[eventId];
      if (entry) lines = this._merge(entry, `${factionId}.${eventId}`);
    }
    lines.forEach(l => { l.faction = factionId; l.event = eventId; });
    this._cache.set(key, lines);
    return lines;
  }

  _merge(entry, prefix) {
    const clean = resolveList(entry.clean, `${prefix}.c`, this.legalSafe);
    if (this.script !== 'steam') return clean;
    const steam = resolveList(entry.steam, `${prefix}.s`, this.legalSafe);
    if (entry.steamMode === 'replace' && steam.length) return steam;
    return clean.concat(steam);
  }

  /** Time the speaker is "busy" with this line (used for interrupt rules). */
  durationOf(line) {
    return Math.max(0.8, estimateSeconds(line.text, this.rules.wordsPerSecond) + 0.25);
  }

  /** Every line in the file, both scripts, both legal variants. Used by lint + VO CSV export. */
  allLines() {
    const rows = [];
    const push = (entry, prefix, faction, event, victim = '') => {
      for (const [scriptKey, tag] of [['clean', 'c'], ['steam', 's']]) {
        (entry[scriptKey] || []).forEach((raw, i) => {
          const l = normalize(raw);
          const base = { faction, event, victim, script: scriptKey, retired: !!l.retired, flag: l.flag || '' };
          rows.push({ ...base, id: `${prefix}.${tag}.${i}`, text: l.t, variant: 'primary' });
          if (l.alt) rows.push({ ...base, id: `${prefix}.${tag}.${i}.alt`, text: l.alt, variant: 'legal-alt' });
        });
      }
    };
    for (const [fid, f] of Object.entries(this.content.factions)) {
      for (const [ev, entry] of Object.entries(f.lines)) push(entry, `${fid}.${ev}`, fid, ev);
    }
    for (const r of this.content.rivalry) push(r, `rivalry.${r.killer}-${r.victim}`, r.killer, 'rivalry', r.victim);
    return rows;
  }
}
