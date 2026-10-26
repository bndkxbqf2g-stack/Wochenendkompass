import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRun, berlinParts, validateItem, extractJson, mergeFeed, isExpired, itemId } from '../scripts/research.mjs';

test('Zeitfenster: Sommerzeit 05:30 UTC läuft, 06:30 UTC nicht', () => {
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-07-10T05:30:00Z') }).run, true);
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-07-10T03:30:00Z') }).run, false);
});
test('Zeitfenster: Winterzeit 06:30 UTC läuft, 05:30 UTC nicht', () => {
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-12-10T06:30:00Z') }).run, true);
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-12-10T05:30:00Z') }).run, false);
});
test('höchstens ein Lauf pro Tag', () => {
  const r = shouldRun({ event: 'schedule', now: new Date('2026-12-10T06:40:00Z'), lastUpdated: '2026-12-10T06:31:00Z' });
  assert.equal(r.run, false);
});
test('Abendlauf 20:00 Berlin (Sommer 18:00 UTC, Winter 19:00 UTC)', () => {
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-07-10T18:00:00Z') }).run, true);
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-12-10T19:00:00Z') }).run, true);
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-12-10T18:00:00Z') }).run, false);
});
test('Morgenlauf blockiert den Abendlauf nicht, Doppellauf im selben Fenster schon', () => {
  const am = '2026-12-10T06:31:00Z';
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-12-10T19:00:00Z'), lastUpdated: am }).run, true);
  assert.equal(shouldRun({ event: 'schedule', now: new Date('2026-12-10T19:10:00Z'), lastUpdated: '2026-12-10T19:00:30Z' }).run, false);
});
test('manueller Start ignoriert das Fenster', () => {
  assert.equal(shouldRun({ event: 'workflow_dispatch', now: new Date('2026-12-10T12:00:00Z') }).run, true);
});
test('berlinParts rechnet Sommerzeit', () => {
  assert.deepEqual(berlinParts(new Date('2026-07-10T05:30:00Z')), { date: '2026-07-10', hour: 7, minute: 30 });
});
test('validateItem verlangt https-URL und Titel, bereinigt Felder', () => {
  assert.equal(validateItem({ title: 'Test', url: 'http://x.de' }), null);
  assert.equal(validateItem({ title: 'ab', url: 'https://x.de' }), null);
  const v = validateItem({ title: 'Houseparty', url: 'https://x.de/a', category: 'unsinn', date: '2026-11-01', time: '9pm' });
  assert.equal(v.category, 'sonstiges'); assert.equal(v.time, null); assert.equal(v.date, '2026-11-01'); assert.ok(v.id);
});
test('extractJson', () => {
  assert.deepEqual(extractJson('Hier: [{"a":1}] Ende'), [{ a: 1 }]);
  assert.equal(extractJson('nix'), null);
});
test('Ablauf: vergangene Termine fallen raus, mehrtägige bleiben', () => {
  const now = new Date('2026-11-05T08:00:00Z');
  assert.equal(isExpired({ date: '2026-11-04' }, now), true);
  assert.equal(isExpired({ date: '2026-11-01', endDate: '2026-11-07' }, now), false);
  assert.equal(isExpired({ date: null }, now), false);
});
test('Merge: Duplikate, neu/entfernt, found bleibt erhalten', () => {
  const now = new Date('2026-11-05T08:00:00Z'), iso = now.toISOString();
  const a = validateItem({ title: 'Weinfest Randersacker', url: 'https://a.de', date: '2026-11-20' });
  const b = validateItem({ title: 'Alt', url: 'https://b.de', date: '2026-11-01' });
  const old = [{ ...a, found: '2026-10-01T00:00:00Z', lastSeen: '2026-11-01T00:00:00Z' }, { ...b, found: 'x', lastSeen: 'x' }];
  const c = validateItem({ title: 'Brunch Sonntag', url: 'https://c.de', date: '2026-11-08' });
  const m = mergeFeed(old, [a, a, c], iso, now);
  assert.equal(m.items.length, 2);
  assert.deepEqual(m.added, [c.id]);
  assert.deepEqual(m.removed, [b.id]);
  assert.equal(m.items.find(i => i.id === a.id).found, '2026-10-01T00:00:00Z');
});
test('itemId ist stabil', () => {
  assert.equal(itemId({ title: 'A b', date: '2026-01-01', place: 'X' }), itemId({ title: 'a  B', date: '2026-01-01', place: 'x' }));
});
