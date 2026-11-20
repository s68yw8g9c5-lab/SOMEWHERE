// GET /api/stats?day=N : live numbers for everyone (no spoilers in here).
import { dayNumber } from "../../public/game.js";
import { db } from "../../lib/db.mjs";
import { json, fail } from "../../lib/http.mjs";

export default async (req) => {
  const today = dayNumber();
  const q = Number(new URL(req.url).searchParams.get("day")) || today;
  const day = Math.min(Math.max(1, Math.round(q)), today);
  try {
    const sql = await db();
    const [tot, top, countries, cells, recent] = await Promise.all([
      sql`SELECT * FROM day_totals WHERE day = ${day}`,
      sql`SELECT name, country, score, km, clues FROM plays WHERE day = ${day} ORDER BY score DESC, ms ASC LIMIT 25`,
      sql`SELECT country, players, sum_score FROM day_country WHERE day = ${day} ORDER BY players DESC LIMIT 60`,
      sql`SELECT lat, lon, players FROM day_cells WHERE day = ${day} ORDER BY players DESC LIMIT 3000`,
      sql`SELECT name, country, score FROM plays WHERE day = ${day} ORDER BY created DESC LIMIT 8`,
    ]);
    const t = tot[0] || { players: 0, sum_km: 0, sum_score: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
    const n = Number(t.players);
    return json({
      day,
      live: day === today,
      players: n,
      avgKm: n ? Math.round(Number(t.sum_km) / n) : null,
      avgScore: n ? Math.round(Number(t.sum_score) / n) : null,
      clueDist: [t.c1, t.c2, t.c3, t.c4, t.c5],
      top,
      countries: countries.map((c) => ({ c: c.country, n: c.players, avg: Math.round(Number(c.sum_score) / c.players) })),
      where: cells.map((c) => [c.lat, c.lon, c.players]),
      recent,
      at: Date.now(),
    }, { cacheSeconds: 15 });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/stats", method: "GET" };
