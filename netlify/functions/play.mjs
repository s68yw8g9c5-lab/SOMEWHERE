// POST /api/play  { day, player, name, ms }
// Sent once, after the 5th round. The score comes from the guesses the server already
// recorded one riddle at a time (/api/riddle), so pins can't be moved after seeing an answer.
import { dayNumber, scoreFor, maxFor, ROUNDS } from "../../public/game.js";
import { puzzlesFor, isOpen } from "../../lib/puzzles.mjs";
import { db } from "../../lib/db.mjs";
import { json, cleanName, validPlayer, readJson, fail } from "../../lib/http.mjs";

const BUCKET = 100;

export default async (req, context) => {
  const b = await readJson(req);
  if (!b) return json({ error: "bad json" }, { status: 400 });

  const now = Date.now();
  const day = Number(b.day);
  if (!Number.isInteger(day) || day > dayNumber(now) || !isOpen(day, now)) return json({ error: "that game is closed" }, { status: 400 });
  if (!validPlayer(b.player)) return json({ error: "bad player" }, { status: 400 });

  const places = puzzlesFor(day);
  const ms = Math.max(0, Math.min(86400000, Math.round(Number(b.ms) || 0)));
  let sql, rounds = null;
  try {
    sql = await db();
    const [had] = await sql`SELECT 1 FROM games WHERE day = ${day} AND player = ${b.player}`;
    if (!had) {
      const turns = await sql`SELECT round, clues, glat, glon, km, secs FROM turns
                              WHERE day = ${day} AND player = ${b.player} AND glat IS NOT NULL ORDER BY round`;
      if (turns.length !== ROUNDS) return json({ error: "finish all 5 riddles first" }, { status: 400 });
      rounds = turns.map((t, i) => [t.glat, t.glon, t.clues, Number(t.km), scoreFor(Number(t.km), t.clues, maxFor(places[i]), t.secs), t.secs]);
    }
  } catch (e) { return fail(e); }
  rounds = rounds || [];
  const km = Math.round(rounds.reduce((s, r) => s + r[3], 0) * 10) / 10;
  // The riddle times can't add up to more than the whole game took.
  if (rounds.reduce((s, r) => s + r[5], 0) > ms / 1000 + 5) {
    rounds.forEach((r, i) => { r[5] = 86400; r[4] = scoreFor(r[3], r[2], maxFor(places[i]), 86400); });
  }
  const score = rounds.reduce((s, r) => s + r[4], 0);

  const geo = context.geo || {};
  const cc = geo.country?.code || "";
  const country = /^[A-Z]{2}$/.test(cc) ? cc : "XX";
  // Player locations are not stored or shown (no "where people play" dots).
  const plat = null, plon = null;
  const name = cleanName(b.name);

  try {
    const inserted = !rounds.length ? [] : await sql`
      INSERT INTO games (day, player, name, country, plat, plon, rounds, km, score, ms, created)
      VALUES (${day}, ${b.player}, ${name}, ${country}, ${plat}, ${plon}, ${sql.json(rounds)}, ${km}, ${score}, ${ms}, ${now})
      ON CONFLICT (day, player) DO NOTHING
      RETURNING 1`;
    const isNew = inserted.length === 1;

    if (isNew) {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO g_totals (day, players, sum_km, sum_score) VALUES (${day}, 1, ${km}, ${score})
                 ON CONFLICT (day) DO UPDATE SET players = g_totals.players + 1,
                   sum_km = g_totals.sum_km + ${km}, sum_score = g_totals.sum_score + ${score}`;
        await tx`INSERT INTO g_country (day, country, players, sum_score) VALUES (${day}, ${country}, 1, ${score})
                 ON CONFLICT (day, country) DO UPDATE SET players = g_country.players + 1,
                   sum_score = g_country.sum_score + ${score}`;
        await tx`INSERT INTO g_hist (day, bucket, players) VALUES (${day}, ${Math.floor(score / BUCKET)}, 1)
                 ON CONFLICT (day, bucket) DO UPDATE SET players = g_hist.players + 1`;
      });
    }

    // Return the stored game (if they already played, this is their first result, not the new one).
    const [row] = await sql`SELECT name, country, rounds, km, score FROM games WHERE day = ${day} AND player = ${b.player}`;
    const [{ above }] = await sql`SELECT COALESCE(SUM(players), 0)::int AS above FROM g_hist
                                  WHERE day = ${day} AND bucket > ${Math.floor(row.score / BUCKET)}`;
    const [tot] = await sql`SELECT players FROM g_totals WHERE day = ${day}`;
    const players = tot?.players || 1;
    const beat = players > 1 ? Math.round(((players - 1 - above) / (players - 1)) * 100) : 100;

    return json({ ...row, day, players, beat: Math.max(0, Math.min(100, beat)), duplicate: !isNew });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/play", method: "POST" };
