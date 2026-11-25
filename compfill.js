// "Fill class": pick month, competence and evaluation, then every pupil's name is listed.
// Tap a number pad, press Next, and it moves to the next pupil. Finish opens the report cards.
// Voice mode: the app says the register number, the teacher says the mark, the app asks
// "Correct?", the teacher says "yes". It keeps going until the teacher says "stop" or the class ends.
import { el, select, toast } from "./ui.js";
import { TERM_MONTHS, compKey } from "./comp.js";

/* ---------- voice helpers ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let stopVoice = null; // stops a running voice session when the screen is redrawn or left

const WORDS = {
  zero: 0, "zéro": 0, one: 1, un: 1, une: 1, two: 2, deux: 2, three: 3, trois: 3, four: 4, quatre: 4,
  five: 5, cinq: 5, six: 6, seven: 7, sept: 7, eight: 8, huit: 8, nine: 9, neuf: 9, ten: 10, dix: 10,
  eleven: 11, onze: 11, twelve: 12, douze: 12, thirteen: 13, treize: 13, fourteen: 14, quatorze: 14,
  fifteen: 15, quinze: 15, sixteen: 16, seize: 16, seventeen: 17, "dix-sept": 17, eighteen: 18, "dix-huit": 18,
  nineteen: 19, "dix-neuf": 19, twenty: 20, vingt: 20,
};
// Words the phone often hears instead of a number, especially with African accents
const SOUNDS = {
  won: 1, wan: 1, juan: 1, to: 2, too: 2, tu: 2, tue: 2, tree: 3, free: 3, tri: 3, thee: 3, for: 4, fore: 4, fo: 4, faw: 4,
  fife: 5, fiv: 5, fibe: 5, sick: 6, sicks: 6, sex: 6, sebel: 7, seben: 7, ate: 8, eat: 8, ait: 8, nein: 9, nain: 9,
  night: 9, nye: 9, tin: 10, ton: 10, elevent: 11, twelf: 12, twelv: 12, tirteen: 13, thirten: 13, forteen: 14,
  fourteen: 14, fiftin: 15, sixteen: 16, sixten: 16, seventin: 17, eighteen: 18, ateen: 18, nineten: 19, twenti: 20,
};
const toNum = (t, loose) => (/^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : t in WORDS ? WORDS[t] : loose && t in SOUNDS ? SOUNDS[t] : null);

function parseSpoken(text) {
  const tok = String(text).toLowerCase().replace(/[!?;:]/g, " ").trim().split(/\s+/);
  const loose = tok.length <= 4; // only guess odd sounds in short answers like "for" or "ate"
  // digits said one by one: "one four" -> 14, "1 4" -> 14
  if (tok.length === 2) {
    const a = toNum(tok[0], loose), b = toNum(tok[1], loose);
    if (a != null && b != null && a >= 1 && a <= 2 && b <= 9 && Number.isInteger(a) && Number.isInteger(b)) {
      const v = a * 10 + b;
      if (v <= 20) return v;
    }
  }
  for (let i = 0; i < tok.length; i++) {
    let n = toNum(tok[i], loose);
    if (n == null) continue;
    if (n === 10 && ["sept", "huit", "neuf"].includes(tok[i + 1])) return 10 + WORDS[tok[i + 1]];
    if (["point", "virgule", "comma", "dot"].includes(tok[i + 1])) {
      const d = toNum(tok[i + 2] || "");
      if (d != null && d < 10) n += d / 10;
    } else if (/(and a half|et demi)/.test(tok.slice(i + 1).join(" "))) n += 0.5;
    return Math.round(n * 100) / 100;
  }
  return null;
}
// Look at every alternative the phone heard and prefer one that is a valid mark (0 to max)
const firstNum = (alts, max = 20) => {
  const all = alts.map(parseSpoken).filter((n) => n != null);
  return all.find((n) => n <= max) ?? all[0] ?? null;
};
const hasWord = (alts, list) => alts.some((a) => a.toLowerCase().split(/[\s,.!?]+/).some((w) => list.includes(w)));
const YES = ["yes", "yeah", "yep", "yup", "correct", "right", "ok", "okay", "sure", "oui", "exact", "d'accord"];
const NO = ["no", "nope", "wrong", "incorrect", "non", "faux"];
function command(alts) {
  if (hasWord(alts, ["stop", "stopped", "arrête", "arrete", "arrêt", "arret"])) return "stop";
  if (hasWord(alts, ["skip", "absent", "passer", "next"])) return "skip";
  if (hasWord(alts, ["back", "previous", "retour", "précédent"])) return "back";
  if (hasWord(alts, ["repeat", "again", "répète", "repete"])) return "repeat";
  return null;
}

export function compFillTab(box, ctx) {
  if (stopVoice) stopVoice();
  const { S, saveMark, put, termOptions, TERM_NAMES, goCards } = ctx;
  const comps = S.cls.comps || [];
  if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab).")));
  if (!comps.length) return put(box, el("div", { class: "card" }, el("p", {}, "This class has no competences yet.")));
  if (!TERM_MONTHS[S.term].includes(S.fillMonth)) S.fillMonth = TERM_MONTHS[S.term][0];
  if (!(S.fillComp < comps.length)) S.fillComp = 0;
  if (!(S.fillPart < comps[S.fillComp].parts.length)) S.fillPart = 0;
  if (!S.voiceLang) S.voiceLang = localStorage.getItem("rc_voicelang") || (S.cls.section === "Francophone" ? "fr-FR" : "en-NG");
  let idx = 0;      // active pupil
  let buf = "";     // digits typed for the active pupil
  const cur = () => comps[S.fillComp];
  const part = () => cur().parts[S.fillPart];
  const key = () => compKey(S.fillMonth, cur().id, S.fillPart);
  const mark = (p) => (S.marks[p.id] || {})[key()];
  const show = (v) => (v == null ? "" : String(Number(Number(v).toFixed(2))));

  const redraw = () => compFillTab(box, ctx);
  const picker = el("div", { class: "card noprint" },
    el("div", { class: "row" },
      select(termOptions, S.term, (v) => { S.term = +v; S.fillMonth = TERM_MONTHS[S.term][0]; redraw(); }),
      select(TERM_MONTHS[S.term].map((m) => ({ value: m, label: `Month ${m}` })), S.fillMonth, (v) => { S.fillMonth = +v; redraw(); })),
    el("div", { class: "row" },
      select(comps.map((c, i) => ({ value: i, label: c.name })), S.fillComp, (v) => { S.fillComp = +v; S.fillPart = 0; redraw(); }),
      select(cur().parts.map((p, i) => ({ value: i, label: `${p.name} (/${p.max})` })), S.fillPart, (v) => { S.fillPart = +v; redraw(); })));

  const info = el("p", { class: "muted" });
  const list = el("div", { class: "fillist" });
  const rows = S.pupils.map((p, i) => {
    const val = el("span", { class: "fv" });
    const row = el("button", { class: "fillrow", onclick: () => { idx = i; buf = ""; paint(); } }, el("span", { class: "fn" }, `${i + 1}. ${p.name}`), val);
    list.append(row);
    return { row, val, p };
  });
  const disp = el("div", { class: "fdisp" });
  const msg = el("div", { class: "fmsg" });

  function paint() {
    const m = part().max;
    let done = 0;
    rows.forEach((r, i) => {
      const v = mark(r.p);
      if (v != null) done++;
      r.val.textContent = i === idx && buf !== "" ? buf + "…" : show(v) || "–";
      r.row.classList.toggle("on", i === idx);
      r.row.classList.toggle("done", v != null);
    });
    info.textContent = `${cur().name} · ${part().name} (/${m}) · Month ${S.fillMonth}. ${done} of ${S.pupils.length} pupils filled.`;
    disp.textContent = `${S.pupils[idx].name}:  ${buf === "" ? (show(mark(S.pupils[idx])) || "–") : buf} / ${m}`;
    const act = rows[idx] && rows[idx].row;
    if (act && act.scrollIntoView) act.scrollIntoView({ block: "start" });
  }

  async function commit(skip) {
    const p = S.pupils[idx];
    if (!skip && buf !== "") {
      const v = Number(buf.replace(",", "."));
      if (Number.isNaN(v) || v < 0 || v > part().max) { msg.textContent = `${part().name} is from 0 to ${part().max}.`; return false; }
      try { await saveMark(p.id, key(), Math.round(v * 100) / 100); }
      catch (e) { toast("Not saved: " + e.message); return false; }
    }
    msg.textContent = "";
    buf = "";
    if (idx < S.pupils.length - 1) { idx++; paint(); return true; }
    paint();
    toast("Last pupil done. Tap Finish to open the report cards.");
    return true;
  }
  const press = (k) => {
    msg.textContent = "";
    if (k === "back") buf = buf.slice(0, -1);
    else if (k === ".") { if (buf !== "" && !buf.includes(".")) buf += "."; }
    else if (buf.length < 5) buf += k;
    paint();
  };
  const clearMark = async () => {
    try { await saveMark(S.pupils[idx].id, key(), null); buf = ""; paint(); toast("Mark removed"); }
    catch (e) { toast("Not saved: " + e.message); }
  };
  const k = (label, fn, cls = "") => el("button", { class: "fkey " + cls, onclick: fn }, label);
  // One big key per possible mark (0 up to the evaluation's maximum): tap a number, it saves and moves to the next pupil
  let half = false;
  const halfBtn = k("+ .5", () => { half = !half; halfBtn.classList.toggle("go", half); halfBtn.textContent = half ? "+ .5 ✓" : "+ .5"; }, "alt");
  // The pupil is fixed at the moment of the tap and the screen moves on at once, so quick taps
  // can never land on the wrong pupil while a save is still going on in the background.
  const pick = (n) => {
    const v = n + (half ? 0.5 : 0);
    if (v > part().max) { msg.textContent = `${part().name} is from 0 to ${part().max}.`; return; }
    const i = idx;
    const p = S.pupils[i];
    const mk = key();
    buf = "";
    half = false; halfBtn.classList.remove("go"); halfBtn.textContent = "+ .5";
    if (i < S.pupils.length - 1) idx = i + 1;
    else toast("Last pupil done. Tap Finish to open the report cards.");
    saveMark(p.id, mk, v).catch((e) => { toast(`NOT saved for ${p.name}: ${e.message}`); paint(); });
    paint();
    msg.textContent = `✔ ${i + 1}. ${p.name}: ${show(v)}`;
  };
  const maxMark = Math.floor(part().max);
  const cols = maxMark > 12 ? 5 : 4;
  const gridStyle = el("style", {}, `.fnums{display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;margin:8px 0}.fnums .fkey{min-height:56px;font-size:24px;font-weight:700}.fctl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.fctl .fkey{min-height:48px;font-size:16px}`);
  const nums = el("div", { class: "fnums" }, Array.from({ length: maxMark + 1 }, (_, n) => k(String(n), () => pick(n))));
  const pad = el("div", {}, gridStyle, nums,
    el("div", { class: "fctl" }, halfBtn, k("Clear", clearMark, "alt"), k("Skip", () => commit(true), "alt"), k("⌫", () => press("back"), "alt")));
  const finish = el("button", { class: "btn alt", onclick: () => goCards && goCards() }, "Finish: open report cards");

  /* ---------- voice mode ---------- */
  let on = false;
  let rec = null;
  const fr = () => S.voiceLang.startsWith("fr");
  const voiceBtn = el("button", { class: "btn" }, "🎤 Start voice");
  const langSel = select([
    { value: "en-NG", label: "Voice: English (Africa)" },
    { value: "en-GB", label: "Voice: English (UK)" },
    { value: "en-US", label: "Voice: English (US)" },
    { value: "en-ZA", label: "Voice: English (South Africa)" },
    { value: "fr-FR", label: "Voix : Français" },
  ], S.voiceLang, (v) => { S.voiceLang = v; localStorage.setItem("rc_voicelang", v); });

  const say = (text) => new Promise((res) => {
    if (!on) return res();
    msg.textContent = "🔊 " + text;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = fr() ? "fr-FR" : "en-GB";
    u.onend = res;
    u.onerror = res;
    window.speechSynthesis.speak(u);
  });
  const listen = () => new Promise((res) => {
    if (!on) return res(null);
    msg.textContent = fr() ? "🎤 J'écoute…" : "🎤 Listening…";
    let got = null;
    const r = new SR();
    rec = r;
    r.lang = S.voiceLang;
    r.interimResults = false;
    r.maxAlternatives = 5;
    r.onresult = (e) => { got = Array.from(e.results[0]).map((a) => a.transcript.toLowerCase().trim()); };
    r.onerror = () => {};
    r.onend = () => { if (rec === r) rec = null; res(got); };
    try { r.start(); } catch (e) { res(null); }
  });

  function endVoice() {
    on = false;
    stopVoice = null;
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } rec = null; }
    voiceBtn.textContent = "🎤 Start voice";
    voiceBtn.classList.remove("bad");
  }

  async function voiceLoop() {
    let fails = 0;
    while (on && box.isConnected) {
      paint();
      await say(fr() ? `Numéro ${idx + 1}` : `Number ${idx + 1}`);
      const alts = await listen();
      if (!on) break;
      if (!alts) continue; // heard nothing: say the number again
      const cmd = command(alts);
      if (cmd === "stop") break;
      if (cmd === "repeat") continue;
      if (cmd === "back") { if (idx > 0) idx--; continue; }
      if (cmd === "skip") {
        if (idx < S.pupils.length - 1) { idx++; continue; }
        await say(fr() ? "Classe terminée" : "Class finished");
        break;
      }
      let v = firstNum(alts, part().max);
      if (v == null) {
        fails++;
        await say(fr() ? (fails >= 2 ? "Dites les chiffres un par un" : "Je n'ai pas compris, répétez") : (fails >= 2 ? "Say the digits one by one, like one four" : "Sorry, say the mark again"));
        continue;
      }
      fails = 0;

      // ask to confirm until the teacher says yes or no
      let result = "";
      while (on && result === "") {
        if (v > part().max) { await say(fr() ? `Plus de ${part().max}` : `Above ${part().max}`); result = "again"; break; }
        await say(fr() ? `${v}. Correct ?` : `${v}. Correct?`);
        const a2 = await listen();
        if (!on) return;
        if (!a2) continue;
        const c2 = command(a2);
        if (c2 === "stop") { result = "stop"; break; }
        if (hasWord(a2, YES)) { result = "yes"; break; }
        if (hasWord(a2, NO)) { result = "again"; break; }
        const n2 = firstNum(a2, part().max);
        if (n2 != null) v = n2; // teacher said a different mark: confirm that one instead
      }
      if (!on || result === "stop") break;
      if (result === "again") continue;

      try { await saveMark(S.pupils[idx].id, key(), v); }
      catch (e) { toast("Not saved: " + e.message); break; }
      paint();
      if (idx < S.pupils.length - 1) { idx++; }
      else { await say(fr() ? "Classe terminée" : "Class finished"); break; }
    }
    endVoice();
    msg.textContent = "";
    paint();
  }

  voiceBtn.onclick = () => {
    if (on) { endVoice(); msg.textContent = ""; return; }
    if (!SR || !window.speechSynthesis) return toast("Voice needs Chrome on your phone.");
    on = true;
    stopVoice = endVoice;
    buf = "";
    voiceBtn.textContent = "⏹ Stop voice";
    voiceBtn.classList.add("bad");
    voiceLoop();
  };

  const dock = el("div", { class: "fdock noprint" }, disp, msg,
    el("div", { class: "row" }, voiceBtn, langSel),
    el("p", { class: "muted" }, "Voice: tap a name to start from that pupil. Say the mark, then \"yes\". Also: skip, back, repeat, stop."),
    pad, finish);

  // Enter / digits from a real keyboard also work
  const onKey = (e) => {
    if (!box.isConnected) return document.removeEventListener("keydown", onKey);
    if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === "." || e.key === ",") press(".");
    else if (e.key === "Backspace") press("back");
    else if (e.key === "Enter") { e.preventDefault(); commit(false); }
  };
  document.addEventListener("keydown", onKey);

  put(box, picker, el("div", { class: "card" }, info, list), dock);
  paint();
}

