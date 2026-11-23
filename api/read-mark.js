// Server side of the smart reader. The AI key lives only in Vercel's settings (never in the app files).
// Env: GEMINI_API_KEY and/or ANTHROPIC_API_KEY; READER=gemini|claude (optional); FIREBASE_API_KEY (optional).
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyAy0kCAgO4nR7mG1DopTmOKc7vADHTUwgU";
const MAX_B64 = 400000; // about 300 KB of picture
const PROMPT =
  'This is a small photo of a mark handwritten on a school exam script by a teacher, written like "18/20" or as a fraction ' +
  'with one number above the other. Read only that mark. Answer ONLY with JSON: {"value": number or null, "total": number or null, "sure": true or false}. ' +
  '"value" is the mark obtained, "total" is the number it is out of (null if not written). If you cannot read it, use null. Never guess.';

const hits = new Map(); // per user, best effort slow-down (resets when the server restarts)
function tooMany(uid) {
  const now = Date.now();
  const list = (hits.get(uid) || []).filter((t) => now - t < 60000);
  if (list.length >= 40) return true;
  list.push(now);
  hits.set(uid, list);
  return false;
}

export async function whoIs(idToken, fetchFn = fetch) {
  if (!idToken) return null;
  const r = await fetchFn(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.users && j.users[0] ? j.users[0].localId : null;
}

export function parseReply(text) {
  const m = String(text || "").match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : null);
    const value = num(o.value);
    let total = num(o.total);
    if (total === 0) total = null;
    if (value == null) return { value: null, total: null, sure: false };
    if (total != null && value > total) return { value: null, total: null, sure: false };
    return { value, total, sure: o.sure !== false };
  } catch { return null; }
}

// Short reason from the AI service (never contains the key).
async function errText(r) {
  try {
    const j = await r.json();
    const m = (j.error && (j.error.message || j.error.status)) || "";
    return String(m).replace(/key=[^\s&]+/g, "key=…").slice(0, 150);
  } catch { return ""; }
}

async function askGemini(b64, mime, fetchFn) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });
  if (!r.ok) throw new Error("gemini " + r.status + " " + (await errText(r)));
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
}

async function askClaude(b64, mime, fetchFn) {
  const r = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-haiku-5-5", max_tokens: 100,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mime, data: b64 } }, { type: "text", text: PROMPT }] }],
    }),
  });
  if (!r.ok) throw new Error("claude " + r.status + " " + (await errText(r)));
  const j = await r.json();
  return (j.content || []).map((c) => c.text || "").join("");
}

export async function handle(body, idToken, fetchFn = fetch) {
  const provider = process.env.READER || (process.env.GEMINI_API_KEY ? "gemini" : "claude");
  if (provider === "gemini" ? !process.env.GEMINI_API_KEY : !process.env.ANTHROPIC_API_KEY) return { status: 503, json: { error: "reader not set up" } };
  const uid = await whoIs(idToken, fetchFn);
  if (!uid) return { status: 401, json: { error: "sign in check failed" } };
  if (tooMany(uid)) return { status: 429, json: { error: "slow down" } };
  const b64 = body && body.image;
  const mime = body && body.mime === "image/png" ? "image/png" : "image/jpeg";
  if (typeof b64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length > MAX_B64) return { status: 400, json: { error: "bad picture" } };
  try {
    const text = provider === "gemini" ? await askGemini(b64, mime, fetchFn) : await askClaude(b64, mime, fetchFn);
    const out = parseReply(text);
    if (!out) return { status: 200, json: { value: null, total: null, sure: false } };
    return { status: 200, json: out };
  } catch (e) {
    return { status: 502, json: { error: "reader failed", detail: String(e && e.message || e).slice(0, 220) } };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Setup check you can open in a browser. It never shows the key itself.
    const provider = process.env.READER || (process.env.GEMINI_API_KEY ? "gemini" : "claude");
    const keySet = provider === "gemini" ? !!process.env.GEMINI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
    return res.status(200).json({ ok: true, provider, keySet });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const out = await handle(req.body, token);
  res.status(out.status).json(out.json);
}
