# Somewhere 🌍

**One riddle. One place on Earth. The whole world guessing.**

Every day at midnight UTC, everyone on the planet gets the same riddle. It points to one spot
on Earth. Read the clues (each extra clue lowers your points), drop one pin on the map, and
see how close you got, where everyone else guessed, and how you rank against the world.

- No sign-up. Players get a random name they can change.
- Live global leaderboard, a "Country cup" and a live feed.
- Live map of where people are playing from (city level, from Netlify's geolocation; no GPS prompt).
- Everyone's guesses appear only after you lock in, so no spoilers.
- Share text with emoji squares, plus a "Save image" story card with a mini map of your guess.
- The server recomputes every score, so nobody can post fake points.
- Umami analytics, set up the same way as Driftline.

## What's inside

```
public/              the website (plain HTML/CSS/JS, no build step)
  index.html, style.css, app.js
  game.js            rules shared by the site and the server (day number, scoring)
  puzzles.js         generated from tools/puzzles.json (lightly scrambled)
  vendor/            d3, topojson and the world map, self-hosted
netlify/functions/   the backend (Netlify Functions)
  play.mjs           POST /api/play: save a guess, return score and "beat X%"
  stats.mjs          GET /api/stats: live counts, leaderboard, countries, player map
  pins.mjs           GET /api/pins: everyone's guesses (only after you've played)
  name.mjs           POST /api/name: change your name on today's board
lib/db.mjs           database connection; creates the tables by itself on first use
tools/puzzles.json   30 riddles. Add more here.
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
| Reveal clue | Opens another clue | clue number, day |
| Lock in | Locks in a guess | clues used, distance range, day |
| Share result / Save image | Taps a share button | |
| Board tab | Switches leaderboard tab | tab |
| Rename, How to play | Taps those buttons | |

"Lock in ÷ visitors" is your completion rate, and "Share result ÷ Lock in" is your share rate,
the number that decides whether it spreads.

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

There are 30 days of riddles and they loop after that. To add more, edit
`tools/puzzles.json` (name, lat, lon, 5 clues from hardest to easiest, and a fun fact), then:

```bash
npm run encode
```

and push or deploy. Tip: find exact coordinates by right-clicking a spot in Google Maps.

## How scoring works

- Up to 5,000 points. Within 25 km is a perfect score, then it drops off with distance.
- Clue multiplier: 1 clue ×1, 2 clues ×0.8, 3 clues ×0.6, 4 clues ×0.45, 5 clues ×0.3.
- Ties on the leaderboard go to whoever locked in faster.

## Costs

The live stats are cached on Netlify's CDN for 15 seconds, so even with many players the
database only gets a few reads a minute. Each play is one function call plus a few small
writes. Netlify DB's free tier covers a launch; if it takes off, upgrade the Neon plan.

## Ideas for growth

- Post the share card on TikTok/IG stories each day ("I was 12 km off, can you beat me?").
- Weekly "World Cup": countries compete on average score.
- Let players submit riddles about their hometown.
- Add an archive so new players can play past days.
