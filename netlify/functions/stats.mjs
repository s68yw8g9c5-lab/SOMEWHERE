// GET /api/stats?day=N : live numbers for everyone (no spoilers in here).
import { dayNumber, ROUNDS, HARD_ROUND, LEVELS } from "../../public/game.js";
import { db } from "../../lib/db.mjs";
import { json, fail } from "../../lib/http.mjs";

export default async (req) => {
  const today = dayNumber();
  const q = Number(new URL(req.url).searchParams.get("day")) || today;
  const day = Math.min(Math.max(1, Math.round(q)), today);
  try {
    const sql = await db();
    const crack = Math.round(LEVELS.hard.max / 2); // half the hard round's points = "cracked it"
    const [tot, top, countries, recent, hard] = await Promise.all([
      sql`SELECT * FROM g_totals WHERE day = ${day}`,
      sql`SELECT name, country, score, km, (rounds->${HARD_ROUND}->>4)::int AS hard FROM games WHERE day = ${day} ORDER BY score DESC, ms ASC LIMIT 25`,
      sql`SELECT country, players, sum_score FROM g_country WHERE day = ${day} ORDER BY players DESC LIMIT 60`,
      sql`SELECT name, country, score FROM games WHERE day = ${day} ORDER BY created DESC LIMIT 8`,
      sql`SELECT count(*) FILTER (WHERE (rounds->${HARD_ROUND}->>4)::int >= ${crack}) AS cracked FROM games WHERE day = ${day}`,
    ]);
    const t = tot[0] || { players: 0, sum_km: 0, sum_score: 0 };
    const n = Number(t.players);
    return json({
      day,
      live: day === today,
      players: n,
      avgKm: n ? Math.round(Number(t.sum_km) / n / ROUNDS) : null,   // per round
      avgScore: n ? Math.round(Number(t.sum_score) / n) : null,       // per game
      top: top.map((r) => ({ name: r.name, country: r.country, score: r.score, km: r.km, cracked: r.hard >= crack })),
      cracked: Number(hard[0]?.cracked || 0),   // players who cracked the hard riddle
      countries: countries.map((c) => ({ c: c.country, n: c.players, avg: Math.round(Number(c.sum_score) / c.players) })),
      recent,
      at: Date.now(),
    }, { cacheSeconds: 15 });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/stats", method: "GET" };
