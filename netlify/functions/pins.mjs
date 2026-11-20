// GET /api/pins?day=N&player=ID : everyone's guesses, one list per round. Only shown
// after you have finished today's game, so the crowd can't give the answers away.
import { dayNumber, ROUNDS } from "../../public/game.js";
import { db } from "../../lib/db.mjs";
import { json, validPlayer, fail } from "../../lib/http.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const today = dayNumber();
  const day = Math.min(Math.max(1, Math.round(Number(url.searchParams.get("day")) || today)), today);
  const player = url.searchParams.get("player");
  try {
    const sql = await db();
    if (day === today) {
      if (!validPlayer(player)) return json({ error: "play first" }, { status: 403 });
      const played = await sql`SELECT 1 FROM games WHERE day = ${day} AND player = ${player}`;
      if (!played.length) return json({ error: "play first" }, { status: 403 });
    }
    const rows = await sql`SELECT rounds FROM games WHERE day = ${day} ORDER BY created DESC LIMIT 600`;
    const pins = Array.from({ length: ROUNDS }, () => []);
    for (const { rounds } of rows) {
      rounds.forEach((r, i) => { if (pins[i]) pins[i].push([Math.round(r[0] * 10) / 10, Math.round(r[1] * 10) / 10, r[4]]); });
    }
    return json({ day, pins });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/pins", method: "GET" };
