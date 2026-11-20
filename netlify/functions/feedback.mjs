// POST /api/feedback { msg, contact? } : the feedback box in the "How to play" window.
// Read messages in your database's table viewer (table "feedback").
import { dayNumber } from "../../public/game.js";
import { db } from "../../lib/db.mjs";
import { json, readJson, fail } from "../../lib/http.mjs";

const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, n);

export default async (req, context) => {
  const b = await readJson(req);
  const msg = clean(b?.msg, 2000);
  if (msg.length < 2) return json({ error: "empty" }, { status: 400 });
  const cc = context.geo?.country?.code || "";
  try {
    const sql = await db();
    // Light spam brake: at most 30 messages a minute across the whole site.
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM feedback WHERE created > ${Date.now() - 60000}`;
    if (n >= 30) return json({ error: "busy" }, { status: 429 });
    await sql`INSERT INTO feedback (msg, contact, country, day, created)
              VALUES (${msg}, ${clean(b.contact, 120) || null}, ${/^[A-Z]{2}$/.test(cc) ? cc : null}, ${dayNumber()}, ${Date.now()})`;
    return json({ ok: true });
  } catch (e) { return fail(e); }
};

export const config = { path: "/api/feedback", method: "POST" };
