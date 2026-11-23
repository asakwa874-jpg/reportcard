// "Fill class": pick month, competence and evaluation, then every pupil's name is listed.
// Tap a number pad, press Next, and it moves to the next pupil. Finish opens the report cards.
import { el, select, toast } from "./ui.js";
import { TERM_MONTHS, compKey } from "./comp.js";

export function compFillTab(box, ctx) {
  const { S, saveMark, put, termOptions, TERM_NAMES, goCards } = ctx;
  const comps = S.cls.comps || [];
  if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab).")));
  if (!comps.length) return put(box, el("div", { class: "card" }, el("p", {}, "This class has no competences yet.")));
  if (!TERM_MONTHS[S.term].includes(S.fillMonth)) S.fillMonth = TERM_MONTHS[S.term][0];
  if (!(S.fillComp < comps.length)) S.fillComp = 0;
  if (!(S.fillPart < comps[S.fillComp].parts.length)) S.fillPart = 0;
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
  const pad = el("div", { class: "fpad" },
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => k(d, () => press(d))),
    k(".", () => press(".")), k("0", () => press("0")), k("⌫", () => press("back")),
    k("Clear", clearMark, "alt"), k("Skip", () => commit(true), "alt"), k("Next ▶", () => commit(false), "go"));
  const finish = el("button", { class: "btn alt", onclick: () => goCards && goCards() }, "Finish: open report cards");
  const dock = el("div", { class: "fdock noprint" }, disp, msg, pad, finish);

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
