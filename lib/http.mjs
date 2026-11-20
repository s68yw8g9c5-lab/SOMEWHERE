export function json(data, { status = 200, cacheSeconds = 0 } = {}) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (cacheSeconds) {
    // Netlify's CDN keeps this response for a few seconds, so thousands of players
    // polling the live stats only hit the database a few times a minute.
    headers["netlify-cdn-cache-control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
    headers["cache-control"] = "public, max-age=0, must-revalidate";
  } else {
    headers["cache-control"] = "no-store";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function cleanName(raw) {
  const s = String(raw || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
  return s || "Explorer";
}

export const validPlayer = (p) => typeof p === "string" && /^[a-zA-Z0-9-]{8,48}$/.test(p);

export async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}

export function fail(e) {
  console.error(e);
  return json({ error: "server error" }, { status: 500 });
}
