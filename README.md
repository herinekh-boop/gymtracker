# 🏋️ Gym Tracker

A personal gym tracker for iPhone. It works **100 % offline** at the gym and
keeps all your data **on your phone** (nothing is sent anywhere).

Your app's address: **https://herinekh-boop.github.io/gymtracker/**
(it will work once GitHub Pages is turned on — see step 2 below).

---

## 1. Put the app on GitHub

Your GitHub account and the `gymtracker` repository already exist, and the
code has been uploaded to the branch **`claude/gym-tracker-pwa-vpfqee`**.

*(Starting from zero someday? Go to github.com → **Sign up** → create an
account → click **+** (top right) → **New repository** → name it `gymtracker`,
choose **Public** → **Create repository** → **uploading an existing file** →
drag in all the app's files and folders → **Commit changes**.)*

## 2. Turn on GitHub Pages (free hosting)

1. On a computer (or Safari in desktop mode), open
   **https://github.com/herinekh-boop/gymtracker**
2. Click **Settings** (top menu of the repository, the ⚙️ tab).
3. In the left menu, click **Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Under **Branch**, pick the branch that holds the app
   (`claude/gym-tracker-pwa-vpfqee`, or `main` if you merged it there),
   folder **/ (root)** → **Save**.
6. Wait 1–2 minutes and refresh the page. A box appears:
   *"Your site is live at https://herinekh-boop.github.io/gymtracker/"*.

> Note: GitHub Pages is free for **public** repositories. The code is public,
> but **your workout data is not** — it only exists on your phone.

## 3. Install it on your iPhone

1. Open **Safari** (it must be Safari, not Chrome) and go to
   **https://herinekh-boop.github.io/gymtracker/**
2. Wait until the app has loaded once (this saves it for offline use).
3. Tap the **Share** button (square with an arrow ↑) at the bottom.
4. Scroll down and tap **Add to Home Screen** → **Add**.
5. Open the app **from the new icon** on your Home Screen. It opens full
   screen, like a real app, and works without internet.

⚠️ Always use the Home Screen icon. The Safari tab and the Home Screen app
keep **separate** data.

## 4. Using it at the gym

- **Home**: sessions this week (X / 4, week starts Monday), the suggested
  next session (Push → Pull → Jambes → Abdos + Épaules), or pick any session
  (including Raptor). Tap **Start session**.
- **During a session**: each exercise shows *Last: …* from last time. Sets are
  pre-filled; adjust with the big **− / +** buttons (or tap the number to type).
  Tap **✓** when a set is done → 90 s rest timer. After the last set of an
  exercise → 30 s before the next one. Change these in **Settings**.
- **⇄ Swap**: replace an exercise today only or permanently (or create a new
  one). **+ Add exercise** at the bottom for extras.
- **✎ Note** per exercise, and a session note at the bottom.
- Closed the app by mistake? Reopen it — you're back where you left off,
  timer included.
- 💡 green hints (e.g. *Try +1 kg*) appear when you hit all target reps on all
  sets in your last 2 sessions. They're only suggestions — nothing changes
  automatically.
- **Assisted** exercises (Dips assistés, Tractions assistées): you enter the kg
  of **assistance**. Going **down** is progress — the charts and records treat
  it that way (green line = better).

About the timer sound on iPhone: the beep follows the ring/silent switch, and
iPhones don't let web apps make sound while the screen is locked. The timer
itself stays correct; when you come back it shows the right time (or "Time's
up"). The app keeps the screen awake during a session (can be turned off in
Settings).

## 5. Backups (important!)

Your data lives only on your phone. If you delete the app, the data goes too.

- **Settings → Export backup** → the Share sheet opens → **Save to Files**
  (or choose Google Drive).
- To restore (new phone, reinstall…): **Settings → Import backup…** → pick the
  file. ⚠️ This replaces everything in the app with the file's content.
- The app reminds you gently if you haven't backed up in 2 weeks.

## 6. Updating the app later (without losing data)

Your workouts are stored in the phone's database, **separately from the app
files**. Updating the files never touches your data.

1. Change the files (or ask Claude to), and in **`sw.js`** change the line
   `const VERSION = '1.0.0';` to a new number (e.g. `'1.0.1'`). Also update
   `APP_VERSION` in `js/app.js` so Settings shows the new version.
   *(This version change is what tells the phone there's something new.)*
2. Upload the changed files to GitHub (on the repository page:
   **Add file → Upload files**, or let Claude push them).
3. Wait 1–2 minutes, open the app with internet. An orange bar appears:
   **"A new version is ready — tap to update"** → tap it. Done.

To be extra safe, export a backup before big updates.

Never tap "Reset app to starting data" in Settings unless you really mean it,
and never "Clear History and Website Data" in iPhone Settings → Safari
without a backup.

---

## For tweaks later: how the code is organised

No build step: these plain files *are* the app.

| File | What it does |
|---|---|
| `index.html` | The page skeleton |
| `css/styles.css` | All the looks (colours at the top) |
| `js/app.js` | Starts the app, switches screens, app version |
| `js/seed.js` | Starting data (exercises, sessions, past workouts) — only used on first launch |
| `js/logic.js` | The "brain": hints, records, week counter, rotation, formatting |
| `js/store.js` / `js/db.js` | Saving data on the phone (IndexedDB) + backup |
| `js/timer.js` | Rest timer & sound |
| `js/views/*.js` | One file per screen: home, session, history, manage, settings |
| `sw.js` | Offline support (list of files + version) |
| `vendor/chart.umd.min.js` | Chart.js (charts), stored locally for offline |

### Tests

Needs Node.js and Playwright:

```
npm test
```

Runs the logic tests (`tests/logic.test.mjs`) and a full end-to-end run in a
headless iPhone-sized browser (`tests/e2e.test.mjs`): logging a session, rest
timer, resume after closing, swap, hints, records, history edit,
export/import backup, abs video, offline reload.
