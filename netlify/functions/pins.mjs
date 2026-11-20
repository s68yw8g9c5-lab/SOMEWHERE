// GET /api/pins?day=N&player=ID : everyone's guesses. Only shown after you have
// played today, so the crowd can't give the answer away.
import { dayNumber } from "../../public/game.js";
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
      const played = await sql`SELECT 1 FROM plays WHERE day = ${day} AND player = ${player}`;
      if (!played.length) return json({ error: "play first" }, { status: 403 });
    }
    const rows = await sql`SELECT glat, glon, score FROM plays WHERE day = ${day} ORDER BY created DESC LIMIT 1500`;
    return json({ day, pins: rows.map((r) => [Math.round(r.glat * 10) / 10, Math.round(r.glon * 10) / 10, r.score]) });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/pins", method: "GET" };
