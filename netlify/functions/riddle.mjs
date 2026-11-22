// The riddles, one step at a time, so the answers never sit in the page waiting to be peeked at.
//
// GET  /api/riddle?day=N&player=P[&dev=KEY]
//      Today's 5 riddles: first clue only (more if this player already opened them), no answers,
//      except for riddles this player has already guessed.
// POST /api/riddle { action: "clue",  day, player, round, want }
//      Opens clues up to `want` (the server remembers, so clues can't be "un-opened").
// POST /api/riddle { action: "guess", day, player, round, lat, lon, clues, secs }
//      Marks the spot. The first guess for a riddle is final. Returns the score and the answer.
//
// Tester mode (dev): nothing is saved, any past day or today can be played, and future days
// need the TESTER_KEY setting in Netlify (so nobody can play tomorrow's riddles early).
import { dayNumber, distanceKm, scoreFor, maxFor, MAX_CLUES, ROUNDS } from "../../public/game.js";
import { puzzlesFor, hasDate, isOpen } from "../../lib/puzzles.mjs";
import { db } from "../../lib/db.mjs";
import { json, validPlayer, readJson, fail } from "../../lib/http.mjs";

const MAX_DAY = 400;
const r4 = (n) => Math.round(n * 1e4) / 1e4;

function testerOk(key) {
  const real = (process.env.TESTER_KEY || "").trim();
  return !!real && typeof key === "string" && key === real;
}

// What the browser may see of one riddle. `clues` = how many clues are open,
// `guess` = the player's guess (then the answer is included too).
function view(p, clues, guess, all = false) {
  const open = all || guess ? p.clues.length : Math.max(1, Math.min(clues, p.clues.length));
  const v = { level: p.level, kind: /^📖/.test(p.from || "") ? "book" : "film", nclues: p.clues.length, clues: p.clues.slice(0, open) };
  if (all || guess || open >= 2) v.from = p.from; // the spyglass (2nd clue) reveals the title
  if (all || guess) v.answer = { name: p.name, lat: p.lat, lon: p.lon, fact: p.fact || "" };
  if (guess) v.guess = guess;
  return v;
}

function scoreGuess(p, lat, lon, clues, secs) {
  const km = Math.round(distanceKm(lat, lon, p.lat, p.lon) * 10) / 10;
  return { glat: r4(lat), glon: r4(lon), clues, km, score: scoreFor(km, clues, maxFor(p), secs), secs };
}

const cleanSecs = (s) => Number.isFinite(Number(s)) ? Math.max(0, Math.min(86400, Math.round(Number(s)))) : 86400;
const rowGuess = (t) => t && t.glat != null
  ? { glat: t.glat, glon: t.glon, clues: t.clues, km: Number(t.km), score: t.score, secs: t.secs } : null;

export default async (req) => {
  const now = Date.now(), today = dayNumber(now);
  const isGet = req.method === "GET";
  const b = isGet ? Object.fromEntries(new URL(req.url).searchParams) : await readJson(req);
  if (!b) return json({ error: "bad json" }, { status: 400 });

  const day = Number(b.day);
  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY) return json({ error: "bad day" }, { status: 400 });
  const dev = b.dev !== undefined && b.dev !== null && b.dev !== false;
  const tester = dev && testerOk(String(b.dev));
  if (day > today && !tester) {
    return json({ error: dev ? "locked" : "not yet" }, { status: 403 });
  }
  const places = puzzlesFor(day);
  // Days that can't be played for the leaderboard any more give everything away.
  const closed = !isOpen(day, now);
  // Tester mode and closed days save nothing.
  const stateless = dev || closed;
  const days = dev ? Array.from({ length: 60 }, (_, i) => i + 1).filter((d) => hasDate(d) && (d <= today || tester)) : undefined;

  if (!stateless && !validPlayer(b.player)) return json({ error: "bad player" }, { status: 400 });

  try {
    if (isGet) {
      if (closed) return json({ day, days, rounds: places.map((p) => view(p, 0, null, true)) });
      if (dev) return json({ day, days, tester, rounds: places.map((p) => view(p, 1, null)) });
      const sql = await db();
      // Finished today already (e.g. before this change went live): nothing left to hide.
      const [game] = await sql`SELECT rounds FROM games WHERE day = ${day} AND player = ${b.player}`;
      if (game) return json({ day, finished: true, rounds: places.map((p, i) => {
        const x = game.rounds[i] || [];
        return view(p, 0, { glat: x[0], glon: x[1], clues: x[2], km: Number(x[3]), score: x[4], secs: x[5] }, true);
      }) });
      const turns = await sql`SELECT round, clues, glat, glon, km, score, secs FROM turns WHERE day = ${day} AND player = ${b.player}`;
      const by = Object.fromEntries(turns.map((t) => [t.round, t]));
      return json({ day, rounds: places.map((p, i) => view(p, by[i]?.clues || 1, rowGuess(by[i]))) });
    }

    // POST: one riddle.
    const round = Number(b.round);
    if (!Number.isInteger(round) || round < 0 || round >= Math.min(ROUNDS, places.length)) return json({ error: "bad round" }, { status: 400 });
    const p = places[round];
    if (b.action === "clue") {
      if (closed) return json(view(p, 0, null, true));
      const want = Math.max(1, Math.min(MAX_CLUES, p.clues.length, Math.round(Number(b.want) || 1)));
      if (dev) return json(view(p, want, null));
      const sql = await db();
      await sql`INSERT INTO turns (day, player, round, clues, created) VALUES (${day}, ${b.player}, ${round}, ${want}, ${now})
                ON CONFLICT (day, player, round) DO UPDATE SET clues = GREATEST(turns.clues, EXCLUDED.clues)
                WHERE turns.glat IS NULL`;
      const [t] = await sql`SELECT clues, glat, glon, km, score, secs FROM turns WHERE day = ${day} AND player = ${b.player} AND round = ${round}`;
      return json(view(p, t.clues, rowGuess(t)));
    }

    if (b.action === "guess") {
      const lat = Number(b.lat), lon = Number(b.lon);
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return json({ error: "bad pin" }, { status: 400 });
      const claimed = Math.max(1, Math.min(MAX_CLUES, p.clues.length, Math.round(Number(b.clues) || 1)));
      const secs = cleanSecs(b.secs);
      if (stateless) return json(view(p, claimed, scoreGuess(p, lat, lon, claimed, secs), closed));
      const sql = await db();
      const [had] = await sql`SELECT clues, glat, glon, km, score, secs FROM turns WHERE day = ${day} AND player = ${b.player} AND round = ${round}`;
      if (rowGuess(had)) return json(view(p, had.clues, rowGuess(had))); // the first guess stands
      // Clues count as used if the server ever sent them, whatever the browser says.
      const g = scoreGuess(p, lat, lon, Math.max(claimed, had?.clues || 1), secs);
      await sql`INSERT INTO turns (day, player, round, clues, glat, glon, km, score, secs, created)
                VALUES (${day}, ${b.player}, ${round}, ${g.clues}, ${g.glat}, ${g.glon}, ${g.km}, ${g.score}, ${g.secs}, ${now})
                ON CONFLICT (day, player, round) DO UPDATE SET clues = EXCLUDED.clues, glat = EXCLUDED.glat, glon = EXCLUDED.glon,
                  km = EXCLUDED.km, score = EXCLUDED.score, secs = EXCLUDED.secs
                WHERE turns.glat IS NULL`;
      const [t] = await sql`SELECT clues, glat, glon, km, score, secs FROM turns WHERE day = ${day} AND player = ${b.player} AND round = ${round}`;
      return json(view(p, t.clues, rowGuess(t)));
    }
    return json({ error: "bad action" }, { status: 400 });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/riddle", method: ["GET", "POST"] };
