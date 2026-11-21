# Somewhere 🌍

**5 riddles. 5 places on Earth. The whole world guessing.**

Every day at midnight UTC, everyone on the planet gets the same 5 riddles. Each points to one
spot on Earth. Read the clue (up to 3 per place, each extra one lowers your points), drop a pin,
and see how close you got. After all 5, see your score out of 5,000, where everyone else
guessed, and how you rank against the world and your friends.

- No sign-up. Players get a random name they can change.
- Live global leaderboard, a "Country cup" and a live feed.
- Detailed street map you can zoom down to street level (free OpenFreeMap tiles via MapLibre,
  no account or API key). If those tiles can't load, it switches to a simple built-in world map.
- Everyone's guesses appear only after you lock in, so no spoilers.
- Spoiler-free sharing: emoji squares per round, plus a "Save image" story card (score and
  distance per round, never the places).
- Daily streak with one free "streak saver" a week, so one missed day doesn't reset it.
- A "Did you know?" fact after every place.
- Friends boards: private leaderboards shared by link (`/?friends=CODE`).
- Streamer mode (in the ? window): answers stay blurred until you tap Reveal.
- Write a riddle for your friends: the whole riddle lives in the link, nothing is stored.
- Feedback box in the ? window, saved to the database (table `feedback`).
- The daily game is free, always.
- The server recomputes every score, so nobody can post fake points.
- Umami analytics, set up the same way as Driftline.

## What's inside

```
public/              the website (plain HTML/CSS/JS, no build step)
  index.html, style.css, app.js
  game.js            rules shared by the site and the server (day number, scoring)
  puzzles.js         generated from tools/puzzles.json (lightly scrambled)
  vendor/            MapLibre, d3, topojson and the world map, self-hosted
netlify/functions/   the backend (Netlify Functions)
  play.mjs           POST /api/play: save a guess, return score and "beat X%"
  stats.mjs          GET /api/stats: live counts, leaderboard, countries, player map
  pins.mjs           GET /api/pins: everyone's guesses (only after you've played)
  name.mjs           POST /api/name: change your name on today's board
  friends.mjs        /api/friends: create, join, leave and read friends boards
  feedback.mjs       POST /api/feedback: the feedback box
lib/db.mjs           database connection; creates the tables by itself on first use
tools/puzzles.json   150 riddles (30 days of 5). Add more here.
netlify.toml         tells Netlify where the site and functions are
```

## Put it on Netlify

You need a database for the leaderboard. Netlify DB (Postgres, run by Neon) is built into
Netlify, and the code creates its own tables, so there is no SQL to run.

### Option A: from GitHub (same as Driftline, recommended)

1. Put this folder in a new GitHub repo.
2. In Netlify: **Add new project → Import an existing project →** pick the repo.
   Netlify reads `netlify.toml`, so leave the build settings as they are and click Deploy.
3. Add the database. On your computer, in this folder:

   ```bash
   npm install
   npx netlify login
   npx netlify link              # pick the project you just created
   npx netlify db init --no-boilerplate
   ```

   This creates the database and sets `NETLIFY_DATABASE_URL` on the project for you.
   **Claim the database when Netlify asks** (it links it to a free Neon account). Unclaimed
   databases get deleted after a few days.
4. In Netlify, go to **Deploys → Trigger deploy** so the functions pick up the database.
5. Open your `*.netlify.app` link and play. Every push to GitHub redeploys automatically.

### Option B: straight from your computer

```bash
npm install
npx netlify login
npx netlify init                    # create a new project
npx netlify db init --no-boilerplate
npm run deploy
```

### Already have a Postgres database?

Supabase, Neon or anything else works too. In Netlify, open **Project configuration →
Environment variables**, add `DATABASE_URL` with your connection string, and redeploy.

## Analytics (Umami)

The page loads Umami Cloud, the same way Driftline does. Somewhere needs its **own** website
ID so its numbers don't mix with Driftline's:

1. On https://cloud.umami.is go to **Settings → Websites → Add website** and enter Somewhere's domain.
2. Copy the Website ID and paste it into `public/index.html` in place of `PASTE-SOMEWHERE-UMAMI-ID`.

Events it sends (no names, no pins, no cookies):

| Event | When | Extra data |
|---|---|---|
| First pin | First tap on the map | clues open, day |
| Reveal clue | Opens another clue | clue number, round, day |
| Guess | Pins a guess | round, clues used, distance range, day |
| Finish game | Finishes all 5 rounds | score range, clues, streak, day |
| Share result / Save image | Taps a share button | |
| Open leaderboard / Board tab | Opens the board or switches tab | tab |
| Create friends board / Join friends board / Invite friends | Friends boards | |
| Open riddle maker / Create riddle / Finish friend riddle | Write-your-own riddles | |
| Streamer mode / Send feedback / Rename / How to play | Those buttons | |

"Finish game ÷ visitors" is your completion rate, and "Share result ÷ Finish game" is your share
rate, the number that decides whether it spreads.

## Reading feedback

Messages from the feedback box go to the `feedback` table. Open your database in the Neon
console (Netlify: **Extensions → Neon**, or https://console.neon.tech), click **Tables**, and pick
`feedback`.

## Settings

- **Launch day:** in `public/game.js`, set `LAUNCH_UTC` to the date you go public so your first
  puzzle shows as `#1`. Puzzle numbers then count up every day.
- **Custom domain:** in Netlify, open **Domain management**.

## Try it on your computer first

You need a Postgres connection string (the one `netlify db init` made works):

```bash
npm install
npm run dev        # netlify dev, then open http://localhost:8888
```

If you open `public/index.html` without the backend, the game still works in **preview mode**
with sample players, so you can show it to people before deploying.

## Add more riddles

There are 150 riddles (60 easy, 60 medium, 30 hard = 30 days) and they loop after that.
Each riddle has a `"level"` of `easy`, `medium` or `hard`; keep that 2:2:1 ratio when adding more. To add more, edit
`tools/puzzles.json` (name, lat, lon, 3 clues from hardest to easiest, and a fun fact), then:

```bash
npm run encode
```

and push or deploy. Tip: find exact coordinates by right-clicking a spot in Google Maps.

## How scoring works

- Every day climbs: 2 easy places (up to 700 points), 2 medium (1,000) and 1 hard (1,600), 5,000 per day.
  The leaderboard marks players who scored at least half on the hard riddle with 💀. Within 25 km is a perfect score, then it drops
  off with distance.
- Clue multiplier: 1 clue ×1, 2 clues ×0.7, 3 clues ×0.4.
- Ties on the leaderboard go to whoever locked in faster.

## Costs

The live stats are cached on Netlify's CDN for 15 seconds, so even with many players the
database only gets a few reads a minute. Each play is one function call plus a few small
writes. Netlify DB's free tier covers a launch; if it takes off, upgrade the Neon plan.

## Ideas for growth

- Post the share card on TikTok/IG stories each day ("I was 12 km off, can you beat me?").
- Weekly country competition on average score.
- An archive of past days (a good paid extra later, the daily stays free).
