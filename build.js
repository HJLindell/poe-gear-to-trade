// Turns Awakened PoE Trade's stats.ndjson into data/stats.js: { "matcher text": { i: {kind: [tradeIds]}, s: sign, v: fixedValue } }
// Refresh after a league patch:
//   curl -sL -o data/stats.ndjson https://raw.githubusercontent.com/SnosMe/awakened-poe-trade/master/renderer/public/data/en/stats.ndjson
//   node build.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'data');

const out = {};
for (const line of fs.readFileSync(path.join(dir, 'stats.ndjson'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  // Grouped rows (local vs global variants etc.) share one matcher text: merge their ids.
  // "select" rows are local vs global variants picked by item class (test = "WEAPON" / "ARMOUR" / null).
  const tests = row.resolve?.strat === 'select' ? row.resolve.test : null;
  for (const [idx, stat] of (row.stats || [row]).entries()) {
    const ids = Object.entries(stat.trade.ids || {}).filter(([kind]) => kind !== 'pseudo');
    if (!ids.length) continue;
    for (const m of stat.matchers) {
      const key = m.string.replace(/​/g, '');
      const e = (out[key] ||= { i: {} });
      if (tests) (e.sel ||= []).push([tests[idx], Object.fromEntries(ids)]);
      for (const [kind, list] of ids) e.i[kind] = [...new Set([...(e.i[kind] || []), ...list])];
      if ((m.negate ? -1 : 1) * (stat.trade.inverted ? -1 : 1) < 0) e.s = -1;
      if (m.value !== undefined) e.v ??= m.value;
    }
  }
}

fs.writeFileSync(path.join(dir, 'stats.js'), 'globalThis.__pctStats = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, 'matchers written');
