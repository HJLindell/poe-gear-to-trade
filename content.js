// Ctrl+click an item on the character page -> open a trade search with its mods filled in.
(() => {
  const STATS = globalThis.__pctStats;
  const MIN_PCT = 0.9; // searched roll = 90% of the item's roll; loosen or tighten here

  const MOD_KINDS = {
    enchantMods: 'enchant',
    implicitMods: 'implicit',
    fracturedMods: 'fractured',
    explicitMods: 'explicit',
    craftedMods: 'crafted',
  };
  const SLOT_CATEGORY = {
    Helm: 'armour.helmet', BodyArmour: 'armour.chest', Gloves: 'armour.gloves', Boots: 'armour.boots',
    Belt: 'accessory.belt', Amulet: 'accessory.amulet', Ring: 'accessory.ring', Ring2: 'accessory.ring', Ring3: 'accessory.ring',
  };
  const NUM = /[+-]?\d+(?:\.\d+)?/g;

  // "+92 to maximum Life" -> { ids: ['explicit.stat_3299347043'], value: 92 } or null.
  // Lines that feed a trade "total" pseudo stat -> [[pseudoId, value], ...], else null.
  // Totals add up hybrid, crafted and implicit sources, which is how these are priced.
  const RES = { Fire: 'fire', Cold: 'cold', Lightning: 'lightning', Chaos: 'chaos' };
  const ATTR = ['Strength', 'Dexterity', 'Intelligence'];
  function pseudoOf(text, cls) {
    const P = 'pseudo.pseudo_total_';
    let m;
    if ((m = text.match(/^([+-]?\d+)% to (\w+)(?: and (\w+))? Resistances?$/)) && RES[m[2]] && (!m[3] || RES[m[3]])) {
      return [m[2], m[3]].filter(Boolean).map((r) => [P + RES[r] + '_resistance', +m[1]]);
    }
    if ((m = text.match(/^([+-]?\d+)% to all Elemental Resistances$/))) {
      return ['fire', 'cold', 'lightning'].map((r) => [P + r + '_resistance', +m[1]]);
    }
    if ((m = text.match(/^\+(\d+) to maximum (Life|Mana)$/))) return [[P + m[2].toLowerCase(), +m[1]]];
    if ((m = text.match(/^\+(\d+) to (\w+)(?: and (\w+))?$/)) && ATTR.includes(m[2]) && (!m[3] || ATTR.includes(m[3]))) {
      return [m[2], m[3]].filter(Boolean).map((a) => [P + a.toLowerCase(), +m[1]]);
    }
    if ((m = text.match(/^\+(\d+) to all Attributes$/))) return ATTR.map((a) => [P + a.toLowerCase(), +m[1]]);
    if (cls !== 'ARMOUR' && (m = text.match(/^\+(\d+) to maximum Energy Shield$/))) return [[P + 'energy_shield', +m[1]]];
    if ((m = text.match(/^(\d+)% increased maximum Energy Shield$/))) return [['pseudo.pseudo_increased_energy_shield', +m[1]]];
    return null;
  }

  // Local defence lines on armour pieces: searched through the item's final Armour / Evasion / ES value instead.
  const LOCAL_DEF = /^(\+\d+ to (Armour|Evasion Rating|maximum Energy Shield|Ward)|\d+% increased (Armour|Evasion Rating|Energy Shield|Ward|Armour and Evasion|Armour and Energy Shield|Evasion and Energy Shield|Armour, Evasion and Energy Shield))$/;
  const DEF_PROP = { Armour: 'ar', 'Evasion Rating': 'ev', 'Energy Shield': 'es', Ward: 'ward' };
  const clean = (s) => s.replace(/​/g, '').replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, '$1');

  // cls: 'WEAPON' | 'ARMOUR' | null, picks the local or global variant of a stat.
  function matchMod(text, kind, cls = null) {
    // The API wraps keywords as "[id|Shown Text]" or "[Shown Text]": keep the shown text.
    text = clean(text);
    const nums = [...text.matchAll(NUM)].slice(0, 8);
    // Some matchers keep literal numbers ("# Dexterity per 1 Dexterity"), so try every
    // subset of numbers as placeholders, all-placeholders first.
    for (let mask = (1 << nums.length) - 1; mask >= 0; mask--) {
      let key = '', pos = 0;
      const vals = [];
      nums.forEach((m, i) => {
        if (!(mask & (1 << i))) return;
        key += text.slice(pos, m.index) + '#';
        pos = m.index + m[0].length;
        vals.push(parseFloat(m[0]));
      });
      key += text.slice(pos);
      const entry = STATS[key];
      if (!entry) continue;
      const variant = entry.sel && (entry.sel.find((v) => v[0] === cls) || entry.sel.find((v) => v[0] === null));
      const ids = variant?.[1][kind] || entry.i[kind];
      if (!ids) continue;
      let value;
      if (vals.length === 0) value = entry.v;
      else if (vals.length === 1) value = vals[0];
      else if (vals.length === 2 && key.includes('# to #')) value = (vals[0] + vals[1]) / 2; // trade uses the average
      // other multi-number mods: require the stat, no roll filter
      if (value !== undefined) value *= entry.s || 1;
      return { ids, value };
    }
    return null;
  }

  function rollFilter(value) {
    if (value === undefined) return {};
    const r = value * MIN_PCT;
    // Whole numbers unless the roll itself is a small decimal (0.4% leech, 1.5% crit).
    const v = Number.isInteger(value) || Math.abs(r) >= 10 ? Math.round(r) : +r.toFixed(2);
    return value >= 0 ? { min: v } : { max: v };
  }

  function buildQuery(item) {
    const unique = [3, 9, 10].includes(item.frameType);
    const base = item.baseType || item.typeLine;
    const q = { stats: [{ type: 'and', filters: [] }] };
    if (unique) {
      // Trade lists Foulborn uniques under the plain name plus a misc filter.
      const foulborn = item.mutated || /^Foulborn /.test(item.name || '');
      if (item.name) q.name = item.name.replace(/^Foulborn /, '');
      if (foulborn) q.filters = { misc_filters: { filters: { foulborn_item: { option: 'true' } } } };
      q.type = base;
    } else if (item.frameType === 1 || item.frameType === 2) {
      const category = SLOT_CATEGORY[item.inventoryId];
      const type = { rarity: { option: 'nonunique' } };
      if (category) type.category = { option: category };
      else q.type = base; // weapons, quivers, jewels, flasks: exact base
      q.filters = { type_filters: { filters: type } };
    } else {
      q.type = base;
    }

    const props = (item.properties || []).map((p) => p.name);
    const cls = props.includes('Attacks per Second') ? 'WEAPON'
      : props.some((p) => /^(Armour|Evasion Rating|Energy Shield|Ward|Chance to Block)$/.test(p)) ? 'ARMOUR' : null;

    // Rares: resists, life, attributes go to "total" pseudo stats and local defences to the
    // armour filters. Uniques keep their exact lines.
    const totals = !unique;
    if (totals && cls === 'ARMOUR') {
      const armour = {};
      for (const p of item.properties || []) {
        const key = DEF_PROP[p.name], v = parseInt(p.values?.[0]?.[0]);
        if (key && v) armour[key] = { min: Math.round(v * MIN_PCT) };
      }
      if (Object.keys(armour).length) (q.filters ||= {}).armour_filters = { filters: armour };
    }

    const unmatched = [];
    let matched = 0;
    let hybridDef = false;
    const merged = new Map(); // same stat on several lines: trade wants one filter with the sum
    const add = (m) => {
      const prev = merged.get(m.ids.join());
      if (prev && prev.value !== undefined && m.value !== undefined) prev.value += m.value;
      else if (!prev) merged.set(m.ids.join(), m);
    };
    for (const [field, fieldKind] of Object.entries(MOD_KINDS)) {
      for (const mod of item[field] || []) {
        // Mods arrive as strings or as { description, flags: { fractured | crafted | mutated } }.
        const text = clean(typeof mod === 'string' ? mod : mod?.description ?? JSON.stringify(mod));
        const kind = mod?.flags?.fractured ? 'fractured' : mod?.flags?.crafted ? 'crafted' : fieldKind;
        if (totals && cls === 'ARMOUR' && LOCAL_DEF.test(text)) {
          if (text.includes('%')) hybridDef = true;
          matched++;
          if (kind !== 'fractured') continue; // covered by the armour filters; a fractured line also stays as its own filter
        }
        const pseudo = totals && kind !== 'fractured' && pseudoOf(text, cls);
        if (pseudo) {
          matched++;
          for (const [id, value] of pseudo) add({ ids: [id], value });
          continue;
        }
        const m = matchMod(text, kind, cls);
        if (!m) { unmatched.push(text); continue; }
        if (!LOCAL_DEF.test(text)) matched++;
        m.stun = /increased Stun and Block Recovery$/.test(text);
        add(m);
      }
    }
    for (const m of merged.values()) {
      const filters = m.ids.map((raw) => {
        const [id, option] = raw.split('|'); // "enchant.stat_x|25970" = option stat (anoints)
        const f = { id, value: option ? { option: +option } : rollFilter(m.value) };
        // ponytail: heuristic. Stun recovery next to a defence % line is almost always the hybrid
        // prefix's side stat, so it is listed unticked. A real stun suffix gets unticked too.
        if (m.stun && hybridDef) f.disabled = true;
        return f;
      });
      if (filters.length === 1) q.stats[0].filters.push(filters[0]);
      else q.stats.push({ type: 'count', value: { min: 1 }, filters }); // several trade ids for one text: either one
    }
    return { query: { query: q, sort: { price: 'asc' } }, matched, unmatched };
  }

  if (typeof module !== 'undefined') module.exports = { matchMod, buildQuery, pseudoOf };
  if (typeof document === 'undefined') return;

  // ---- page side ----

  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;max-width:420px;padding:10px 14px;' +
      'background:#1b1b1b;color:#e0c890;border:1px solid #6b5a36;font:13px/1.4 sans-serif;white-space:pre-wrap';
    document.body.append(el);
    setTimeout(() => el.remove(), 6000);
  }

  // The page's markup is not something we control, so find the item by its icon URL:
  // walk up from the click target until an element holding an icon of a known item shows up.
  function findItem(target) {
    const all = [...(window.__pctItems?.values() || [])];
    if (!all.length) return null;
    let candidates = [];
    for (let el = target, i = 0; el && i < 6 && !candidates.length; el = el.parentElement, i++) {
      const urls = [...(el.matches('img') ? [el] : el.querySelectorAll('img'))].map((img) => img.src);
      const bg = getComputedStyle(el).backgroundImage.match(/url\("?([^")]+)/);
      if (bg) urls.push(bg[1]);
      if (urls.length > 4) break; // climbed past a single item into the whole inventory
      candidates = all.filter((it) => urls.includes(it.icon));
    }
    const byIcon = candidates.length > 0;
    if (candidates.length !== 1) {
      // Same icon twice (two rings) or no icon hit: the hover popup shows the item's name.
      const visible = document.body.innerText;
      const named = (byIcon ? candidates : all).filter((it) => visible.includes(it.name || it.typeLine));
      if (named.length === 1 || (byIcon && named.length)) return named[0];
    }
    return candidates[0] || null;
  }

  document.addEventListener('click', (e) => {
    if (!e.ctrlKey) return;
    if (!window.__pctItems?.size) return toast('Gear to Trade: no item data captured yet. Reload the page.');
    const item = findItem(e.target);
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const { query, matched, unmatched } = buildQuery(item);
    const url = 'https://www.pathofexile.com/trade/search/' + encodeURIComponent(item.league || 'Standard') +
      '?q=' + encodeURIComponent(JSON.stringify(query));
    console.log('[gear-to-trade]', JSON.stringify({ item, query }));
    window.open(url, '_blank');
    toast(`${item.name || item.typeLine}: ${matched} mods matched` +
      (unmatched.length ? `, ${unmatched.length} not matched:\n` + unmatched.join('\n') : ''));
  }, true);
})();
