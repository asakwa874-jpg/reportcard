// Official competence booklet: monthly marks entry, term summary and the full-page report card.
import { el, select, toast, imageToDataUrl } from "./ui.js";
import { SCALE, autoRemark } from "./calc.js";
import { TERM_MONTHS, compKey, computeCompTerm, computeCompYear } from "./comp.js";

const fmt = (n) => (n == null ? "" : String(Number(n.toFixed(2))));
const okImg = (u) => typeof u === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 400000;
const MONTH_NAMES = ["", "Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6", "Month 7", "Month 8"];

export function compSheetTab(box, { S, saveMark, put, termOptions, TERM_NAMES }) {
  const comps = S.cls.comps || [];
  let view = "m" + TERM_MONTHS[S.term][0];
  const draw = () => {
    if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab).")));
    const months = TERM_MONTHS[S.term];
    if (view !== "sum" && !months.includes(+view.slice(1))) view = "m" + months[0];
    const picker = el("div", { class: "row" },
      select(termOptions, S.term, (v) => { S.term = +v; view = "m" + TERM_MONTHS[S.term][0]; draw(); }),
      select([...months.map((m) => ({ value: "m" + m, label: MONTH_NAMES[m] })), { value: "sum", label: "Term summary" }], view, (v) => { view = v; draw(); }));
    if (view === "sum") return put(box, el("div", { class: "card noprint" }, picker, el("button", { class: "btn alt sm", onclick: () => window.print() }, "Print")), summary());
    const month = +view.slice(1);
    const grid = [];
    const head1 = el("tr", {}, el("th", { rowspan: "2" }, "#"), el("th", { rowspan: "2" }, "Pupil"), comps.map((c) => el("th", { colspan: String(c.parts.length) }, c.name)));
    const head2 = el("tr", {}, comps.map((c) => c.parts.map((p) => el("th", {}, p.name, el("br"), el("small", {}, `/${p.max}`)))));
    const body = S.pupils.map((p, r) => el("tr", {}, el("td", {}, r + 1), el("td", { class: "n" }, p.name),
      comps.map((c) => c.parts.map((pt, j) => {
        const key = compKey(month, c.id, j);
        const cur = (S.marks[p.id] || {})[key];
        const col = grid.length ? 0 : 0; void col;
        const inp = el("input", { type: "text", inputmode: "decimal", value: cur == null ? "" : String(cur), "aria-label": `${p.name} ${c.name} ${pt.name}` });
        (grid[r] = grid[r] || []).push(inp);
        const ci = grid[r].length - 1;
        inp.addEventListener("change", async () => {
          const t = inp.value.trim().replace(",", ".");
          const before = (S.marks[p.id] || {})[key];
          let val = null;
          if (t !== "") { val = Number(t); if (Number.isNaN(val) || val < 0 || val > pt.max) { toast(`${pt.name} is a number from 0 to ${pt.max}.`); inp.value = before == null ? "" : String(before); return; } val = Math.round(val * 100) / 100; }
          try { await saveMark(p.id, key, val); inp.classList.add("saved"); setTimeout(() => inp.classList.remove("saved"), 600); }
          catch (e) { toast("Not saved: " + e.message); }
        });
        inp.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const nx = grid[r + 1] && grid[r + 1][ci];
          if (nx) { nx.focus(); nx.select(); } else inp.blur();
        });
        return el("td", {}, inp);
      }))));
    put(box,
      el("div", { class: "card noprint" }, picker, el("p", { class: "muted" }, `${TERM_NAMES[S.term]} · ${MONTH_NAMES[month]}. Type each evaluation mark, press Enter to go down. It saves by itself. Leave empty if not done this month.`)),
      el("div", { class: "card" }, el("div", { class: "scroll" }, el("table", { class: "grid" }, head1, head2, body))));
  };
  const summary = () => {
    const res = computeCompTerm({ pupils: S.pupils, marksByPupil: S.marks, comps, term: S.term });
    return el("div", { class: "card" }, el("div", { class: "scroll" }, el("table", { class: "grid" },
      el("tr", {}, el("th", {}, "#"), el("th", {}, "Pupil"), comps.map((c) => el("th", {}, c.name, el("br"), el("small", {}, `/${c.max}`))), el("th", {}, "Total"), el("th", {}, "Avg /20"), el("th", {}, "Rank"), el("th", {}, "Grade")),
      res.rows.map((r, i) => el("tr", {}, el("td", {}, i + 1), el("td", { class: "n" }, r.name), r.subjects.map((s) => el("td", { class: "n" }, fmt(s.score))),
        el("td", { class: "n" }, r.total == null ? "" : `${fmt(r.total)}/${r.totalMax}`), el("td", { class: "n" }, fmt(r.studentAvg)), el("td", { class: "n" }, r.rank ?? ""), el("td", { class: "n" }, r.grade ? `${r.grade.letter} (${r.grade.short})` : ""))))),
      el("p", { class: "muted" }, `Class average: ${res.classAvg ?? "–"}/20. Each evaluation's term mark is the average of the months entered.`));
  };
  draw();
}

/* ---------- full-page card ---------- */
export const COMP_CSS = `
.cc{box-sizing:border-box;width:190mm;min-height:270mm;margin:0 auto 12px;padding:8mm;background:#fff;color:#000;border:1.5px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:12px;page-break-after:always;break-after:page;position:relative}
.cc *{box-sizing:border-box}
.cc h1{margin:0;text-align:center;font-size:1.4em;text-transform:uppercase}
.cc h2{margin:2px 0 8px;text-align:center;font-size:1.1em}
.cc .meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #000;border-bottom:0}
.cc .meta div{padding:4px 6px;border-bottom:1px solid #000}
.cc .meta div:nth-child(odd){border-right:1px solid #000}
.cc table{width:100%;border-collapse:collapse;margin-top:8px}
.cc th,.cc td{border:1px solid #000;padding:5px 4px;text-align:center}
.cc td.l,.cc th.l{text-align:left}
.cc th{background:#e8e8e8}
.cc tr.tot td{font-weight:700;background:#f3f3f3}
.cc .sum{display:grid;grid-template-columns:repeat(4,1fr);margin-top:8px;border:1px solid #000}
.cc .sum div{padding:5px 6px;border-right:1px solid #000;text-align:center}
.cc .sum div:last-child{border-right:0}
.cc .sum b{display:block;font-size:1.25em}
.cc .sum span{font-size:.8em;text-transform:uppercase}
.cc .remark{margin-top:8px;border:1px solid #000;padding:5px 6px;min-height:3em}
.cc .scale{margin-top:8px;font-size:.85em}
.cc .sig{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px;text-align:center}
.cc .sig div{border-top:1px solid #000;padding-top:3px}
.cc .sig .sp{border:0;padding:0;height:22mm;position:relative;display:flex;align-items:flex-end;justify-content:center}
.cc .sig .sp img{max-height:20mm;max-width:100%;object-fit:contain}
.cc .sig .sp img.stamp{max-height:26mm;position:absolute;right:0;bottom:-2mm;opacity:.9}
.cc .foot{margin-top:8px;text-align:right;font-size:.75em;color:#444}
@media print{.cc{margin:0 auto;border:1.5px solid #000}}
`;

const L = {
  en: { title: "REPORT CARD", terms: ["", "FIRST TERM", "SECOND TERM", "THIRD TERM"], name: "Name: ", cls: "Class: ", year: "School year: ", count: "Number in class: ", comp: "Competence", evals: "Evaluations", total: "Total", appr: "Appreciation", tt: "Term total", avg: "Average /20", rank: "Position", annual: "Annual average /20", t: "Term", rem: "Class teacher's remark", teacher: "Class teacher", parent: "Parent / Guardian", principal: "Principal", scale: "Appreciation:" },
  fr: { title: "BULLETIN SCOLAIRE", terms: ["", "PREMIER TRIMESTRE", "DEUXIÈME TRIMESTRE", "TROISIÈME TRIMESTRE"], name: "Nom et prénoms : ", cls: "Classe : ", year: "Année scolaire : ", count: "Effectif : ", comp: "Compétence", evals: "Évaluations", total: "Total", appr: "Appréciation", tt: "Total du trimestre", avg: "Moyenne /20", rank: "Rang", annual: "Moyenne annuelle /20", t: "Trimestre", rem: "Observation du maître / de la maîtresse", teacher: "Le maître / La maîtresse", parent: "Parent / Tuteur", principal: "Le Directeur / La Directrice", scale: "Appréciation :" },
};

export function renderCompCard({ schoolName, className, year, term, row, yearRow, count, lang = "en", remark, stamp, signature, teacherSign, business }) {
  const T = L[lang] || L.en;
  const ap = (v) => { const a = v == null ? null : SCALE.find((x) => v >= x.min); return a ? `${a.letter} (${a.short})` : ""; };
  const body = row.subjects.map((s) => el("tr", {},
    el("td", { class: "l" }, s.name),
    el("td", { class: "l" }, s.parts.map((p) => `${p.name} ${p.val == null ? "–" : fmt(p.val)}/${p.max}`).join(" · ")),
    el("td", {}, s.score == null ? "" : `${fmt(s.score)}/${s.max}`),
    el("td", {}, ap(s.avg))));
  const img = (u, cls) => (okImg(u) ? el("img", { src: u, class: cls || "" }) : null);
  const termCells = yearRow ? yearRow.terms.map((t, i) => el("div", {}, el("span", {}, `${T.t} ${i + 1}`), el("b", {}, t.studentAvg == null ? "–" : fmt(t.studentAvg)))) : [];
  return el("div", { class: "cc" },
    el("h1", {}, schoolName || ""),
    el("h2", {}, `${T.title} – ${T.terms[term]}`),
    el("div", { class: "meta" },
      el("div", {}, T.name, el("b", {}, row.name)), el("div", {}, T.cls, el("b", {}, className || "")),
      el("div", {}, T.year, year || ""), el("div", {}, T.count, String(count))),
    el("table", {}, el("tr", {}, el("th", { class: "l" }, T.comp), el("th", { class: "l" }, T.evals), el("th", {}, T.total), el("th", {}, T.appr)), body,
      el("tr", { class: "tot" }, el("td", { class: "l", colspan: "2" }, T.tt), el("td", {}, row.total == null ? "" : `${fmt(row.total)}/${row.totalMax}`), el("td", {}, row.grade ? `${row.grade.letter} (${row.grade.short})` : ""))),
    el("div", { class: "sum" }, el("div", {}, el("span", {}, T.avg), el("b", {}, row.studentAvg == null ? "–" : fmt(row.studentAvg))),
      el("div", {}, el("span", {}, T.rank), el("b", {}, row.rank == null ? "–" : `${row.rank}/${count}`)),
      el("div", {}, el("span", {}, T.appr), el("b", {}, row.grade ? row.grade.letter : "–")),
      el("div", {}, el("span", {}, T.annual), el("b", {}, yearRow && yearRow.yearAvg != null ? fmt(yearRow.yearAvg) : "–"))),
    termCells.length ? el("div", { class: "sum" }, termCells) : null,
    el("div", { class: "scale" }, T.scale + " " + SCALE.slice().reverse().map((s) => `${s.letter} = ${s.short} (${s.min}${s.min === 18 ? "–20" : "+"})`).join(" · ")),
    el("div", { class: "remark" }, el("b", {}, T.rem + ": "), remark || ""),
    el("div", { class: "sig" },
      el("div", {}, el("div", { class: "sp" }, img(teacherSign)), T.teacher),
      el("div", {}, el("div", { class: "sp" }), T.parent),
      el("div", {}, el("div", { class: "sp" }, img(signature), img(stamp, "stamp")), T.principal)),
    business ? el("div", { class: "foot" }, `${business.name} · ${business.phone}`) : null);
}

export function compCardsTab(box, { S, put, termOptions, TERM_NAMES, business, download }) {
  const comps = S.cls.comps || [];
  let only = "all";
  const prefs = (() => { try { return JSON.parse(localStorage.getItem("rc_cardprefs") || "{}"); } catch { return {}; } })();
  const draw = () => {
    if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils and enter marks first.")));
    const res = computeCompTerm({ pupils: S.pupils, marksByPupil: S.marks, comps, term: S.term });
    const year = computeCompYear({ pupils: S.pupils, marksByPupil: S.marks, comps });
    const lang = prefs.lang === "en" || prefs.lang === "fr" ? prefs.lang : (S.cls.section === "Francophone" ? "fr" : "en");
    const teacherSign = localStorage.getItem("rc_tsign_" + S.cid) || "";
    const idx = res.rows.map((r, i) => i).filter((i) => only === "all" || res.rows[i].pupilId === only);
    const area = el("div", { class: "cards-area" }, idx.map((i) => renderCompCard({
      schoolName: S.cls.schoolName, className: S.cls.name, year: S.cls.year, term: S.term, row: res.rows[i], yearRow: year.rows[i], count: S.pupils.length,
      lang, remark: prefs.remarks === false ? "" : autoRemark(res.rows[i], lang), stamp: S.cls.stamp, signature: S.cls.signature, teacherSign, business })));
    const langSel = select([{ value: "auto", label: "Language: automatic (by section)" }, { value: "en", label: "Language: English" }, { value: "fr", label: "Langue : Français" }], prefs.lang || "auto", (v) => { prefs.lang = v === "auto" ? undefined : v; localStorage.setItem("rc_cardprefs", JSON.stringify(prefs)); draw(); });
    const fileName = () => `${S.cls.name}-${TERM_NAMES[S.term].toLowerCase().replace(/\s+/g, "-")}-report-cards.html`.replace(/\s+/g, "-");
    const html = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${S.cls.name} report cards</title><style>body{margin:0;padding:8px;background:#fff}${COMP_CSS}@page{size:A4;margin:8mm}</style></head><body>${area.innerHTML}</body></html>`;
    const signFile = el("input", { type: "file", accept: "image/*" });
    signFile.addEventListener("change", async () => {
      if (!signFile.files[0]) return;
      try { localStorage.setItem("rc_tsign_" + S.cid, await imageToDataUrl(signFile.files[0], 360)); toast("Your signature is saved on this phone."); draw(); } catch (e) { toast(e.message); }
    });
    const st = el("style", {}, COMP_CSS + "@media print{@page{size:A4;margin:8mm}}");
    put(box, st,
      el("div", { class: "card noprint" },
        el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; draw(); }),
          select([{ value: "all", label: "All pupils" }, ...S.pupils.map((p) => ({ value: p.id, label: p.name }))], only, (v) => { only = v; draw(); })),
        el("div", { class: "row" }, el("button", { class: "btn", onclick: () => window.print() }, "Print / Save as PDF (one page per pupil)"),
          el("button", { class: "btn alt", onclick: () => download(fileName(), html()) }, "Save file")),
        el("div", { class: "row" }, langSel),
        el("details", {}, el("summary", { class: "muted" }, teacherSign ? "Class teacher's signature (saved)" : "Add the class teacher's signature"), signFile),
        el("p", { class: "muted" }, `${res.ranked} of ${S.pupils.length} pupils have marks. Class average: ${res.classAvg ?? "–"}/20.`)),
      area);
  };
  draw();
}
