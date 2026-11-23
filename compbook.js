// A copy of the official booklet page: one block per competence, Months 1 to 8, term totals, annual total and appreciation.
import { el } from "./ui.js";
import { appreciation } from "./calc.js";
import { TERM_MONTHS, compKey, partTerm, LEVEL1_PRESET } from "./comp.js";

const num = (v) => typeof v === "number" && !Number.isNaN(v);
const fmt = (n) => (n == null ? "" : String(Number(n.toFixed(2))));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sum = (a) => (a.length ? a.reduce((x, y) => x + y, 0) : null);

// Official wording for the Level I preset (used only while the competence still has its preset name).
const PRESET_NAMES = new Set(LEVEL1_PRESET.split("\n").map((l) => l.split("|")[0].trim()));
const OFFICIAL = { "1A": "COMMUNICATE IN ENGLISH", "1B": "COMMUNICATE IN FRENCH", "1C": "COMMUNICATE IN ONE NATIONAL LANGUAGE", "2A": "USE BASIC NOTIONS IN MATHEMATICS", "2B": "USE BASIC NOTIONS IN SCIENCE AND TECHNOLOGY", "3": "PRACTISE CITIZENSHIP VALUES" };
const GROUPS = { 1: { title: "COMMUNICATE IN ENGLISH, FRENCH AND NATIONAL LANGUAGE", marks: 100 }, 2: { title: "USE BASIC NOTIONS IN MATHEMATICS, SCIENCE AND TECHNOLOGY", marks: 100 } };

function labels(c) {
  const m = c.name.match(/^(\d+[A-Za-z]?)\s+(.*)$/);
  const code = m ? m[1].toUpperCase() : "";
  const group = m ? parseInt(m[1], 10) : null;
  const preset = PRESET_NAMES.has(c.name) && OFFICIAL[code];
  const title = (preset || (m ? m[2] : c.name)).toUpperCase();
  return { code, group, title: `${title} (${fmt(c.max)} MARKS)` };
}
const partLabel = (p, i) => `${i + 1} : ${/^oral$/i.test(p.name) ? "ORAL" : p.name} – ${fmt(p.max)}mks`;

// Everything the grid shows for one competence of one pupil.
export function competenceCells(m, c) {
  const month = (mo) => c.parts.map((_, j) => m[compKey(mo, c.id, j)]);
  const monthTotal = (mo) => {
    const v = month(mo); const got = v.map((x, j) => (num(x) ? { x, max: c.parts[j].max } : null)).filter(Boolean);
    return got.length ? { total: sum(got.map((g) => g.x)), maxUsed: sum(got.map((g) => g.max)) } : null;
  };
  const terms = [1, 2, 3].map((t) => {
    const vals = c.parts.map((_, j) => partTerm(m, c, j, t));
    const got = vals.map((x, j) => (x != null ? { x, max: c.parts[j].max } : null)).filter(Boolean);
    return { vals, total: got.length ? sum(got.map((g) => g.x)) : null, maxUsed: got.length ? sum(got.map((g) => g.max)) : null };
  });
  const annualVals = c.parts.map((_, j) => mean(terms.map((t) => t.vals[j]).filter((x) => x != null)));
  const got = annualVals.map((x, j) => (x != null ? { x, max: c.parts[j].max } : null)).filter(Boolean);
  const annual = { vals: annualVals, total: mean(terms.map((t) => t.total).filter((x) => x != null)), maxUsed: got.length ? sum(got.map((g) => g.max)) : null };
  return { month, monthTotal, terms, annual };
}
const grade = (total, maxUsed) => (total == null || !maxUsed ? null : appreciation((total / maxUsed) * 20));

const MK = (n) => Array.from({ length: n }, () => el("td", { class: "mk" }, "MK"));

function block(c, m) {
  const L = labels(c);
  const d = competenceCells(m, c);
  const th = (t, a = {}) => el("th", a, t);
  const head1 = el("tr", {},
    th(`COMPETENCES ${L.code}`.trim(), { rowspan: "2", class: "cn" }),
    el("th", { rowspan: "2", class: "diag" }, el("span", { class: "t" }, "TERM"), el("span", { class: "mth" }, "MONTH")),
    th("FIRST", { colspan: "4" }), th("SECOND", { colspan: "4" }), th("THIRD", { colspan: "3" }),
    th("An. Total", { rowspan: "2", class: "an" }), th("Annual appreciation", { colspan: "4" }));
  const head2 = el("tr", {}, ["1", "2", "3", "Total", "4", "5", "6", "total", "7", "8", "Total", "C", "B", "A", "A+"].map((x) => th(x)));
  const evalRow = el("tr", {}, el("td", { class: "nm", rowspan: String(c.parts.length + 1) }, L.title), el("td", { class: "l mk" }, "EVAL. TYPES"), MK(12),
    ["SNA", "SPA", "SA", "Exp"].map((x) => el("td", { class: "mk" }, x)));
  const cells = (get) => [1, 2, 3, "T1", 4, 5, 6, "T2", 7, 8, "T3"].map((k) => el("td", {}, get(k)));
  const partRows = c.parts.map((p, j) => el("tr", {},
    el("td", { class: "l ev" }, partLabel(p, j)),
    cells((k) => (typeof k === "number" ? fmt((d.month(k))[j]) : fmt(d.terms[+k[1] - 1].vals[j]))),
    el("td", {}, fmt(d.annual.vals[j])), el("td", {}), el("td", {}), el("td", {}), el("td", {})));
  const totRow = el("tr", { class: "tot" }, el("td", { class: "l", colspan: "2" }, "TOTAL"),
    cells((k) => (typeof k === "number" ? fmt((d.monthTotal(k) || {}).total) : fmt(d.terms[+k[1] - 1].total))),
    el("td", {}, fmt(d.annual.total)), el("td", { colspan: "4" }));
  const ag = grade(d.annual.total, d.annual.maxUsed);
  const appRow = el("tr", { class: "app" }, el("td", { class: "l", colspan: "2" }, "APPRECIATION"),
    cells((k) => { const g = typeof k === "number" ? (d.monthTotal(k) ? grade(d.monthTotal(k).total, d.monthTotal(k).maxUsed) : null) : grade(d.terms[+k[1] - 1].total, d.terms[+k[1] - 1].maxUsed); return g ? g.letter : ""; }),
    el("td", {}), ["C", "B", "A", "A+"].map((x) => el("td", { class: "tick" }, ag && ag.letter === x ? "✓" : "")));
  return { L, table: el("table", { class: "bt" }, head1, head2, evalRow, partRows, totRow, appRow) };
}

export const BOOK_CSS = `
.bk{box-sizing:border-box;width:190mm;min-height:277mm;margin:0 auto 12px;padding:5mm 4mm;background:#fff;color:#000;border:1.5px solid #000;font-family:"Times New Roman",Times,serif;page-break-after:always;break-after:page}
.bk *{box-sizing:border-box}
.bk .who{display:flex;justify-content:space-between;gap:6px;font:700 8pt Arial,sans-serif;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:3px}
.bk .ttl{font-weight:700;font-size:9pt;margin:2px 0 3px;display:flex;justify-content:space-between;gap:6px}
.bk .grp{border:1px solid #000;border-bottom:0;text-align:center;font-weight:700;font-size:7.5pt;padding:1px 2px;margin-top:3px}
.bk table.bt{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:2.5mm;font-size:6.5pt}
.bk .bt th,.bk .bt td{border:.7px solid #000;padding:0 1px;height:4.5mm;text-align:center;overflow:hidden;white-space:nowrap}
.bk .bt th{font-weight:700;font-size:6.5pt}
.bk .bt td.l{text-align:left;padding-left:2px}
.bk .bt td.ev{font-size:6.5pt}
.bk .bt td.mk{font-size:4.5pt;color:#555}
.bk .bt td.nm{white-space:normal;word-break:break-word;font-weight:700;font-size:6.5pt;line-height:1.15}
.bk .bt th.cn,.bk .bt th.an{white-space:normal;font-size:6pt;line-height:1.1}
.bk .bt th.diag{position:relative;background:linear-gradient(to top right,transparent 48%,#000 49%,#000 51%,transparent 52%)}
.bk .bt th.diag .t{position:absolute;top:0;right:2px}
.bk .bt th.diag .mth{position:absolute;bottom:0;left:2px}
.bk .bt tr.tot td,.bk .bt tr.app td{font-weight:700}
.bk .bt td.tick{font-size:8pt}
.bk .bt col.c0{width:21mm}.bk .bt col.c1{width:27mm}
.bk .foot{font:6pt Arial,sans-serif;text-align:right;color:#444}
.bk .scale{font:6.5pt Arial,sans-serif;margin-top:1mm}
@media print{.bk{margin:0 auto;border:0;padding:0}}
`;

export function renderBookPage({ schoolName, className, year, pupilName, comps, marks, business }) {
  const colgroup = () => el("colgroup", {}, el("col", { class: "c0" }), el("col", { class: "c1" }));
  const parts = [];
  const done = new Set();
  comps.forEach((c) => {
    const b = block(c, marks || {});
    b.table.prepend(colgroup());
    const g = b.L.group;
    const same = g == null ? 0 : comps.filter((x) => (x.name.match(/^(\d+)/) || [])[1] === String(g)).length;
    if (same > 1 && !done.has(g)) {
      done.add(g);
      const info = GROUPS[g];
      const total = comps.filter((x) => (x.name.match(/^(\d+)/) || [])[1] === String(g)).reduce((a, x) => a + x.max, 0);
      parts.push(el("div", { class: "grp" }, `COMPETENCE ${g}: ${info ? info.title : ""} (${fmt(info ? info.marks : total)} MARKS)`.replace(": (", " (")));
    }
    parts.push(b.table);
  });
  return el("div", { class: "bk" },
    el("div", { class: "who" }, el("span", {}, (schoolName || "").toUpperCase()), el("span", {}, `PUPIL: ${pupilName}`)),
    el("div", { class: "ttl" }, el("span", {}, `${(className || "").toUpperCase()}`), el("span", {}, `SCHOOL YEAR: ${year || "…………………"}`), el("span", {}, "CLASS TEACHER: ……………………………")),
    parts,
    el("div", { class: "scale" }, "Appreciation: C (SNA) = 0–10 · B (SPA) = 11–14 · A (SA) = 15–17 · A+ (Exp) = 18–20. Term mark of an evaluation = average of its months."),
    business ? el("div", { class: "foot" }, `${business.name} · ${business.phone}`) : null);
}
