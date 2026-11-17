// node test.js  (run node build.js first)
const assert = require('assert');
require('./data/stats.js');
const { matchMod, buildQuery } = require('./content.js');

assert.deepStrictEqual(matchMod('+92 to maximum Life', 'explicit'), { ids: ['explicit.stat_3299347043'], value: 92 });
assert.deepStrictEqual(matchMod('Lose 5 Life when you Block', 'explicit'), { ids: ['explicit.stat_762600725'], value: -5 });
assert.strictEqual(matchMod('Adds 10 to 20 Physical Damage', 'explicit').value, 15);
assert.strictEqual(matchMod('1 Added Passive Skill is a Jewel Socket', 'explicit').value, 1); // literal-number matcher
assert.strictEqual(matchMod('Not a real mod 5', 'explicit'), null);
assert.ok(matchMod("Allocates [blight_special_notable22|Sione's Ambition]", 'enchant')); // API keyword markup
assert.strictEqual(matchMod('+92 to maximum Life', 'enchant'), null); // no id for that kind: unmatched, not wrong

// local vs global is picked by item class, not offered as a count group
assert.deepStrictEqual(matchMod('15% increased Attack Speed', 'explicit').ids, ['explicit.stat_681332047']);
assert.deepStrictEqual(matchMod('15% increased Attack Speed', 'explicit', 'WEAPON').ids, ['explicit.stat_210067635']);
assert.deepStrictEqual(matchMod('+32 to maximum Energy Shield', 'explicit', 'ARMOUR').ids, ['explicit.stat_4052037485']);

// the real gloves from the character page: fractured + crafted flags, hybrid ES% + stun recovery
const gloves = buildQuery({
  frameType: 2, name: 'Hate Knuckle', typeLine: 'Warlock Gloves', baseType: 'Warlock Gloves', inventoryId: 'Gloves',
  properties: [{ name: 'Quality', values: [['+22%', 1]] }, { name: 'Energy Shield', values: [['313', 1]] }],
  implicitMods: [{ description: 'Inflict Lightning Exposure on Hit, applying -13% to Lightning Resistance' }],
  explicitMods: [
    { description: '93% increased Energy Shield', flags: { fractured: true } },
    { description: '15% increased Attack Speed' },
    { description: '+32 to maximum Energy Shield' },
    { description: '40% increased Energy Shield' },
    { description: '+44% to Lightning Resistance' },
    { description: '17% increased Stun and Block Recovery' },
    { description: '+33% to Fire Resistance', flags: { crafted: true } },
    'Gibberish 3',
  ],
});
const q = gloves.query.query;
assert.strictEqual(q.type, undefined);
assert.strictEqual(q.filters.type_filters.filters.category.option, 'armour.gloves');
assert.deepStrictEqual(q.filters.armour_filters, { filters: { es: { min: 282 } } }); // local ES lines -> final ES value
assert.strictEqual(q.stats.length, 1); // no count groups
assert.deepStrictEqual(q.stats[0].filters, [
  { id: 'implicit.stat_981753179', value: { max: -12 } },
  { id: 'fractured.stat_4015621042', value: { min: 84 } },
  { id: 'explicit.stat_681332047', value: { min: 14 } },
  { id: 'pseudo.pseudo_total_lightning_resistance', value: { min: 40 } },
  { id: 'explicit.stat_2511217560', value: { min: 15 }, disabled: true }, // hybrid side stat: unticked
  { id: 'pseudo.pseudo_total_fire_resistance', value: { min: 30 } },
]);
assert.deepStrictEqual(gloves.unmatched, ['Gibberish 3']);
assert.strictEqual(gloves.matched, 8);

// totals: several sources feed one pseudo filter
const summed = buildQuery({ frameType: 2, typeLine: 'Ring', inventoryId: 'Ring',
  implicitMods: ['+10% to Fire and Cold Resistances'],
  explicitMods: ['+40 to maximum Life', '+60 to maximum Life', '+30% to Fire Resistance', '+12% to all Elemental Resistances', '+20 to Strength and Dexterity'] });
assert.deepStrictEqual(summed.query.query.stats[0].filters, [
  { id: 'pseudo.pseudo_total_fire_resistance', value: { min: 47 } },
  { id: 'pseudo.pseudo_total_cold_resistance', value: { min: 20 } },
  { id: 'pseudo.pseudo_total_life', value: { min: 90 } },
  { id: 'pseudo.pseudo_total_lightning_resistance', value: { min: 11 } },
  { id: 'pseudo.pseudo_total_strength', value: { min: 18 } },
  { id: 'pseudo.pseudo_total_dexterity', value: { min: 18 } },
]);

const ring = buildQuery({ frameType: 2, typeLine: 'Two-Stone Ring', inventoryId: 'Ring2', enchantMods: ['Allocates Acrimony'] });
assert.deepStrictEqual(ring.query.query.stats[0].filters, [{ id: 'enchant.stat_2954116742', value: { option: 25970 } }]);

const unique = buildQuery({ frameType: 3, name: 'Kaom\'s Heart', typeLine: 'Glorious Plate', explicitMods: ['+500 to maximum Life'] }).query.query;
assert.strictEqual(unique.name, 'Kaom\'s Heart');
assert.strictEqual(unique.type, 'Glorious Plate');
assert.strictEqual(unique.stats[0].filters[0].disabled, undefined); // ticked

const foul = buildQuery({ frameType: 3, name: 'Foulborn Voice of the Storm', typeLine: 'Lapis Amulet' }).query.query;
assert.strictEqual(foul.name, 'Voice of the Storm');
assert.strictEqual(foul.filters.misc_filters.filters.foulborn_item.option, 'true');

console.log('ok');
