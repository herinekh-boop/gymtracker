// End-to-end test: drives the real app in a headless iPhone-sized browser.
// Run: node tests/e2e.test.mjs   (needs Playwright + Chromium installed)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

let pw;
try { pw = await import('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const { chromium, devices } = pw;

// ---- tiny static file server for the app folder ----
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// Freeze "now" at Thu 24 Sep 2026 18:00, and control the clock for timers
await page.clock.install({ time: new Date(2026, 8, 24, 18, 0, 0) });

const step = (name) => console.log('✓', name);
const view = () => page.locator('#view').innerText();
const card = (name) => page.locator('.ex-card', { has: page.locator('h3', { hasText: name }) });
const confirmYes = () => page.locator('.modal [data-m="yes"]').click();

try {
  // ---------- home ----------
  await page.goto(URL_);
  await page.waitForSelector('.week-card');
  let text = await view();
  assert.match(text, /2\s*\/ 4/);
  assert.match(text, /Jambes\s*3 exercises · Next up/);
  step('home: weekly counter 2/4 and next session = Jambes');

  // ---------- start Pull session ----------
  await page.locator('.tpl-btn', { hasText: 'Pull (Tirage)' }).click();
  await page.locator('[data-a="start"]').click();
  await page.waitForSelector('.ex-card');
  const tr = card('Tractions supination assistées');
  text = await tr.innerText();
  assert.match(text, /Last \(23 Sept?\):\s*28 kg assist\., 6\/6\/6\/6/);
  assert.match(text, /Try −2\.5 kg assistance/);
  step('session: "Last" numbers and assisted progression hint shown');

  // −2.5 kg on set 1 → following sets follow
  await tr.locator('.stepper[data-field="kg"][data-s="0"] [data-act="dec"]').click();
  const kgs = await card('Tractions supination assistées').locator('.stepper[data-field="kg"] input').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(kgs, ['25.5', '25.5', '25.5', '25.5']);
  step('stepper: weight change applies to following sets');

  // ---------- rest timer ----------
  await card('Tractions supination assistées').locator('[data-a="done"][data-s="0"]').click();
  await page.waitForSelector('#timer.show');
  assert.match(await page.locator('#timer').innerText(), /Rest[\s\S]*1:30/);
  await page.clock.fastForward(40_000);
  await page.waitForTimeout(100);
  assert.match(await page.locator('.timer-num').innerText(), /0:(49|50|51)/);
  step('timer: 90 s rest starts and counts from timestamps');

  // Close & reopen the app: session and timer must come back
  await page.reload();
  await page.waitForSelector('.ex-card');
  assert.equal(await page.locator('.session-title h1').innerText(), 'Pull (Tirage)');
  assert.match(await page.locator('.timer-num').innerText(), /0:(48|49|50|51)/);
  assert.equal(await card('Tractions supination assistées').locator('.set-row.done').count(), 1);
  step('resume: reopening the app resumes the session and the running timer');

  await page.locator('[data-timer="add"]').click();
  assert.match(await page.locator('.timer-num').innerText(), /1:0[3-6]/);
  await page.clock.fastForward(66_500);
  await page.waitForTimeout(100);
  assert.match(await page.locator('#timer').innerText(), /Time’s up/);
  step('timer: +15s works and shows "Time’s up"');

  // Finish the remaining 3 sets → the last one triggers the 30 s "next exercise" timer
  for (const s of [1, 2, 3]) await card('Tractions supination assistées').locator(`[data-a="done"][data-s="${s}"]`).click();
  assert.match(await page.locator('#timer').innerText(), /Next exercise in[\s\S]*Tirage neutre[\s\S]*0:30/);
  await page.locator('[data-timer="skip"]').click();
  assert.equal(await page.locator('#timer.show').count(), 0);
  step('timer: last set starts the 30 s "next exercise" timer; skip works');

  // ---------- swap today only ----------
  await card('Tirage bûcheron').locator('[data-a="swap"]').click();
  await page.locator('.modal [data-search]').fill('rowing');
  await page.locator('.modal [data-m="new"]').click();
  await page.locator('.modal [name="name"]').fill('Rowing haltère');
  await page.locator('.modal [data-m="save"]').click();
  await page.locator('.modal [data-m="c"]', { hasText: 'Today only' }).click();
  assert.match(await card('Rowing haltère').innerText(), /Swapped from Tirage bûcheron/);
  step('swap: created a new exercise on the spot and swapped for today only');

  // ---------- swap permanently ----------
  await card('Curl biceps').locator('[data-a="swap"]').click();
  await page.locator('.modal [data-search]').fill('Tirage vertical prise large');
  await page.locator('.modal [data-m="pick"]').first().click();
  await page.locator('.modal [data-m="c"]', { hasText: 'Permanently' }).click();
  const pullItems = await page.evaluate(async () => (await import('./js/store.js')).tplById('pull').items.map((i) => i.exerciseId));
  assert.deepEqual(pullItems, ['tractions', 'tirage-neutre', 'bucheron', 'tv-large', 'lat']);
  step('swap: permanent swap updates the Pull session (today-only one did not)');

  // ---------- add an extra exercise (timed: Burpees) ----------
  await page.locator('[data-a="addex"]').click();
  await page.locator('.modal [data-search]').fill('Burpees');
  await page.locator('.modal [data-m="pick"]').first().click();
  const bur = card('Burpees');
  assert.match(await bur.innerText(), /Last \(23 Sept?\):\s*50 reps in 15:00/);
  await bur.locator('[data-a="sw"]').click();
  await page.clock.fastForward(14 * 60_000);
  await card('Burpees').locator('[data-a="sw"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.stepper[data-field="time"] input')].some((i) => i.value === '14:00'));
  await card('Burpees').locator('[data-a="done"]').click();
  step('extra exercise: added Burpees, stopwatch filled 14:00');

  // Note + finish
  await card('Tirage neutre').locator('[data-a="note"]').click();
  await card('Tirage neutre').locator('textarea').fill('Bonne forme');
  await page.locator('[data-a="snote"]').fill('Great session');
  await page.waitForTimeout(500);
  await page.locator('.session-head [data-a="finish"]').click();
  await confirmYes();
  await page.waitForSelector('.pr-card');
  text = await view();
  assert.match(text, /Session complete/);
  assert.match(text, /Tractions supination assistées\s*Least assistance: 25\.5 kg assist/);
  assert.match(text, /Burpees\s*Fastest \(50\+ reps\): 14:00/);
  step('finish: summary with new personal records (assisted ↓ and faster time)');

  const saved = await page.evaluate(async () => {
    const { S } = await import('./js/store.js');
    const w = S.workouts.find((x) => x.name === 'Pull (Tirage)' && x.start.startsWith('2026-09-24'));
    return { n: S.workouts.length, entries: w.entries.map((e) => e.name), note: w.note, active: S.meta.active };
  });
  assert.equal(saved.n, 6);
  assert.deepEqual(saved.entries, ['Tractions supination assistées', 'Burpees']);
  assert.equal(saved.note, 'Great session');
  assert.equal(saved.active, null);
  step('finish: only ticked exercises saved, session note kept, no active session left');

  // ---------- home after ----------
  await page.locator('[data-a="done"]').click();
  await page.waitForSelector('.week-card');
  assert.match(await view(), /3\s*\/ 4/);
  step('home: counter now 3/4');

  // ---------- history + chart ----------
  await page.locator('.tab', { hasText: 'History' }).click();
  await page.waitForSelector('.cal-grid');
  assert.equal(await page.locator('.cal-cell.has').count(), 5); // 15, 16, 20, 23, 24
  await page.locator('[data-a="ex"]', { hasText: 'Dips assistés' }).click();
  await page.waitForSelector('canvas#chart');
  assert.match(await view(), /Going down is good/);
  assert.match(await view(), /Least assistance\s*18 kg assist\./);
  step('history: calendar marks 5 days; assisted chart + records shown');

  // ---------- edit a past session ----------
  await page.goto(URL_ + '#/workout/h2');
  await page.locator('[data-a="edit"]').click();
  await page.locator('input[data-f="reps"][data-e="1"][data-s="0"]').fill('10');
  await page.locator('[data-a="save"]').click();
  await page.waitForSelector('[data-a="edit"]');
  assert.match(await view(), /Lat machine \(tirage vertical\)\s*15 kg, 10/);
  step('history: edit a past session');

  // ---------- backup export / import ----------
  await page.locator('.tab', { hasText: 'Settings' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-a="export"]').click()]);
  const file = await dl.path();
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(backup.app, 'gymtracker');
  assert.equal(backup.data.workouts.length, 6);
  await page.waitForFunction(() => /Last backup: \d+ September 2026/.test(document.body.innerText));
  step('backup: export produced a JSON file with all 6 sessions');

  // Delete a session, then import the backup to restore it
  await page.goto(URL_ + '#/workout/h1');
  await page.locator('[data-a="delete"]').click();
  await confirmYes();
  assert.equal(await page.evaluate(async () => (await import('./js/store.js')).S.workouts.length), 5);
  await page.goto(URL_ + '#/settings');
  await page.locator('input[data-a="import"]').setInputFiles(file);
  await confirmYes();
  await page.waitForTimeout(300);
  const after = await page.evaluate(async () => {
    const { S } = await import('./js/store.js');
    return { n: S.workouts.length, ex: S.exercises.some((e) => e.name === 'Rowing haltère') };
  });
  assert.deepEqual(after, { n: 6, ex: true });
  step('backup: import restored the deleted session');

  // ---------- abs video session ----------
  await page.goto(URL_ + '#/home');
  await page.locator('.tpl-btn', { hasText: 'Abdos' }).click();
  await page.locator('[data-a="start"]').click();
  const vid = card('Abs video');
  assert.match(await vid.innerText(), /Caroline abs\s*done 0×/);
  assert.equal(await vid.locator('a[href="https://youtu.be/3oeimlA6s68"]').count(), 1);
  await vid.locator('[data-a="vdone"]').click();
  await page.waitForSelector('.ex-card.complete');
  assert.match(await card('Abs video').innerText(), /Done ✓/);
  step('abs: suggested video with link; mark done');

  // ---------- manage: new session ----------
  await page.locator('.session-head [data-a="home"]').click();
  await page.locator('.tab', { hasText: 'Manage' }).click();
  await page.locator('[data-a="newtpl"]').click();
  await page.locator('input[data-f="name"]').fill('Vincent Full Body');
  await page.locator('input[data-f="name"]').dispatchEvent('change');
  await page.locator('[data-a="add"]').click();
  await page.locator('.modal [data-m="pick"][data-id="squats"]').click();
  await page.locator('[data-a="back"]').click();
  await page.waitForSelector('[data-a="newtpl"]');
  assert.match(await view(), /Vincent Full Body\s*1 exercises/);
  step('manage: created a new session with an exercise');

  // ---------- offline: service worker caches everything ----------
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.session-title h1'); // unfinished Abdos session resumes, offline
  step('offline: app reloads with no network');
  await ctx.setOffline(false);

  assert.deepEqual(errors, [], 'no JavaScript errors');
  step('no JavaScript errors');
  console.log('\nAll end-to-end checks passed.');
} catch (err) {
  await page.screenshot({ path: path.join(root, 'tests', 'failure.png'), fullPage: true }).catch(() => {});
  console.error('✗ FAILED:', err.message, '\nJS errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
