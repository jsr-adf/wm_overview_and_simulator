'use strict';
/**
 * tests/kicktipp.test.js — Tests für lib/kicktipp.js (HTML-Parser)
 * Run: node tests/kicktipp.test.js
 */

const assert = require('assert');
const { KickTippClient } = require('../lib/kicktipp');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch(e) { console.log(`  ❌ ${name}: ${e.message}`); failed++; }
}

// ─── parseInputTag ───────────────────────────────────────────────────────────
console.log('\nparseInputTag:');
test('name + value', () => {
  const r = KickTippClient.parseInputTag('type="text" name="foo" value="bar"');
  assert.strictEqual(r.name, 'foo');
  assert.strictEqual(r.value, 'bar');
});
test('Attribut-Reihenfolge egal', () => {
  const r = KickTippClient.parseInputTag('value="42" name="spieltippForms[99].heimTipp" type="text"');
  assert.strictEqual(r.name, 'spieltippForms[99].heimTipp');
  assert.strictEqual(r.value, '42');
});
test('Kein value-Attribut → leerer String', () => {
  const r = KickTippClient.parseInputTag('name="foo" type="text"');
  assert.strictEqual(r.value, '');
});
test('Hidden-Typ erkannt', () => {
  const r = KickTippClient.parseInputTag('type="hidden" name="tipperId" value="123456"');
  assert.strictEqual(r.type, 'hidden');
  assert.strictEqual(r.value, '123456');
});

// ─── parsePage ───────────────────────────────────────────────────────────────
console.log('\nparsePage:');

const MOCK_HTML = `
<form id="tippabgabeForm">
  <input type="hidden" name="tipperId" value="999" />
  <input type="hidden" name="tippsaisonId" value="4729275" />
  <table>
    <tr class="datarow">
      <td>1</td>
      <td class="nw">28.06.26</td>
      <td class="nw">Deutschland</td>
      <td class="nw">Frankreich</td>
      <input type="hidden" name="spieltippForms[101].tippAbgegeben" value="true" />
      <input type="text" name="spieltippForms[101].heimTipp" value="2" />
      <input type="text" name="spieltippForms[101].gastTipp" value="1" />
    </tr>
    <tr class="datarow">
      <td>2</td>
      <td class="nw">29.06.26</td>
      <td class="nw">England</td>
      <td class="nw">DR Kongo</td>
      <input type="hidden" name="spieltippForms[102].tippAbgegeben" value="true" />
      <input type="text" name="spieltippForms[102].heimTipp" value="" />
      <input type="text" name="spieltippForms[102].gastTipp" value="" />
    </tr>
  </table>
</form>
`;

test('Zwei Spiele geparst', () => {
  const { games } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(games.length, 2);
});
test('Teamname korrekt', () => {
  const { games } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(games[0].heimName, 'Deutschland');
  assert.strictEqual(games[0].gastName, 'Frankreich');
});
test('Bestehender Tipp ausgelesen', () => {
  const { games } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(games[0].existHeim, '2');
  assert.strictEqual(games[0].existGast, '1');
});
test('Leerer Tipp → leerer String', () => {
  const { games } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(games[1].existHeim, '');
  assert.strictEqual(games[1].existGast, '');
});
test('Hidden Fields geparst', () => {
  const { hidden } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(hidden['tipperId'], '999');
  assert.strictEqual(hidden['tippsaisonId'], '4729275');
});
test('tippAbgegeben immer true', () => {
  const { hidden } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(hidden['spieltippForms[101].tippAbgegeben'], 'true');
});
test('Spiel-ID korrekt', () => {
  const { games } = KickTippClient.parsePage(MOCK_HTML);
  assert.strictEqual(games[0].id, '101');
  assert.strictEqual(games[1].id, '102');
});

// ─── parseVerification ───────────────────────────────────────────────────────
console.log('\nparseVerification:');
test('Gibt gespeicherte Werte zurück', () => {
  const results = KickTippClient.parseVerification(MOCK_HTML);
  assert.strictEqual(results.length, 1); // nur das Spiel mit Werten
  assert.strictEqual(results[0].hv, '2');
  assert.strictEqual(results[0].gv, '1');
  assert.strictEqual(results[0].heim, 'Deutschland');
});

// ─── Ergebnis ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
