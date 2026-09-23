// Unit tests for the pure logic (run: node --test tests/logic.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { SEED_EXERCISES, SEED_TEMPLATES, SEED_VIDEOS, seedWorkouts } from '../js/seed.js';

const ex = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
const W = seedWorkouts();

test('week counter: Monday to Sunday, any session counts', () => {
  assert.equal(L.countThisWeek(W, new Date(2026, 8, 23, 20)), 2); // week of Mon 21: two sessions on Wed 23
  assert.equal(L.countThisWeek(W, new Date(2026, 8, 20, 20)), 3); // week of Mon 14: Tue 15, Wed 16, Sun 20
  assert.equal(L.countThisWeek(W, new Date(2026, 8, 28, 9)), 0);  // next Monday: new week
});

test('next session in rotation after Pull is Jambes; Raptor ignored', () => {
  assert.equal(L.nextRotationTemplate(SEED_TEMPLATES, W).id, 'legs');
  assert.equal(L.nextRotationTemplate(SEED_TEMPLATES, []).id, 'push');
});

test('"Last" text formatting', () => {
  const last = (id) => L.formatSets(L.historyFor(id, W)[0].entry);
  assert.equal(last('dips'), '18 kg assist., 6/6/6/6');
  assert.equal(last('pompes-max'), '20/6/3 reps');
  assert.equal(last('dev-epaules'), '3 kg, 8/8 · 4 kg, 8/8');
  assert.equal(last('burpees'), '50 reps in 15:00');
  assert.equal(last('lat'), '20 kg');
});

test('prefill copies last time set by set', () => {
  const sets = L.prefillSets(ex['dev-epaules'], L.historyFor('dev-epaules', W)[0].entry);
  assert.deepEqual(sets.map((s) => s.kg), [3, 3, 4, 4]);
  assert.ok(sets.every((s) => s.reps === 8 && !s.done));
});

test('progression hints for each type', () => {
  // Tractions: 4x6 hit twice -> assisted hint (step 2.5)
  assert.equal(L.progressionHint(ex.tractions, W), 'Try −2.5 kg assistance');
  // Dips: only 1 of last 2 sessions had reps -> no hint
  assert.equal(L.progressionHint(ex.dips, W), null);
  const mk = (id, sets, day) => ({ id: 'x' + day, start: new Date(2026, 9, day).toISOString(), entries: [{ exerciseId: id, type: ex[id].type, sets }] });
  const full = (n, kg, reps, time = null) => Array.from({ length: n }, () => ({ kg, reps, time, done: true }));
  assert.equal(L.progressionHint(ex['dev-couche'], [...W, mk('dev-couche', full(4, 4, 8), 1)]), 'Try +1 kg');
  assert.equal(L.progressionHint(ex['crunch'], [...W, mk('crunch', full(4, 10, 8), 1)]), 'Try +2.5 kg');
  assert.equal(L.progressionHint(ex['pompes-inclinees'], [...W, mk('pompes-inclinees', full(4, null, 8), 1)]), 'Try +1 rep');
  assert.equal(L.progressionHint(ex.burpees, [...W, mk('burpees', full(1, null, 50, 840), 1)]), 'Try to beat 14 min');
  // a missed rep -> no hint
  const missed = full(4, 4, 8); missed[3].reps = 7;
  assert.equal(L.progressionHint(ex['dev-couche'], [...W, mk('dev-couche', missed, 1)]), null);
});

test('assisted: LOWER kg is a record; chart metric is the lowest', () => {
  const prs = L.personalRecords(ex.dips, W);
  assert.equal(prs.find((r) => r.key === 'least').value, 18);
  assert.equal(L.chartMetric(L.historyFor('dips', W)[0].entry, 'assisted'), 18);
  // the 23 Sep Raptor session set a "least assistance" record vs 23 kg on 20 Sep
  const raptor = W.find((w) => w.id === 'h5');
  const news = L.newRecords(raptor, ex, W);
  assert.ok(news.some((r) => r.exerciseId === 'dips' && r.label === 'Least assistance'));
});

test('timed: faster time is a record', () => {
  const w = { id: 'n', start: new Date(2026, 9, 1).toISOString(), entries: [{ exerciseId: 'burpees', type: 'timed', sets: [{ reps: 50, time: 800, done: true }] }] };
  const news = L.newRecords(w, ex, [...W, w]);
  assert.ok(news.some((r) => r.label.startsWith('Fastest')));
});

test('video rotation suggests the least recently done', () => {
  const vids = [...SEED_VIDEOS, { id: 'v2', title: 'Other', url: 'x', order: 1 }];
  const done = (vid, day) => ({ id: 'v' + day, start: new Date(2026, 8, day).toISOString(), entries: [{ exerciseId: 'abs-video', type: 'video', video: { videoId: vid, done: true } }] });
  assert.equal(L.suggestVideo(vids, []).id, 'v-caroline');
  assert.equal(L.suggestVideo(vids, [done('v-caroline', 1)]).id, 'v2');
  assert.equal(L.suggestVideo(vids, [done('v-caroline', 5), done('v2', 3)]).id, 'v2');
  assert.equal(L.videoStats(vids, [done('v-caroline', 5), done('v-caroline', 6)])['v-caroline'].count, 2);
});

test('backup reminder after 14 days', () => {
  const now = new Date(2026, 9, 20);
  assert.equal(L.needsBackupReminder({ lastBackupAt: new Date(2026, 9, 10).toISOString() }, now), false);
  assert.equal(L.needsBackupReminder({ lastBackupAt: new Date(2026, 9, 1).toISOString() }, now), true);
  assert.equal(L.needsBackupReminder({ installedAt: new Date(2026, 9, 1).toISOString() }, now), true);
  assert.equal(L.needsBackupReminder({ lastBackupAt: new Date(2026, 9, 1).toISOString(), snoozedUntil: new Date(2026, 9, 22).toISOString() }, now), false);
});

test('time parsing', () => {
  assert.equal(L.parseTime('15:00'), 900);
  assert.equal(L.parseTime('15'), 900);
  assert.equal(L.fmtTime(754), '12:34');
});
