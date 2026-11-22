// Best pupils: per subject and overall in a class, and the best in the whole school.
import { el, select } from "./ui.js";
import { computeTerm, bestOfClass, bestOfSchool } from "./calc.js";
import { computeCompTerm } from "./comp.js";

const fmt = (n) => (n == null ? "–" : String(Number(n.toFixed(2))));
const nameList = (names) => (names.length ? names.join(", ") : "–");

function classResult(S, pupils, marks, cls, term) {
  if (cls.mode === "comp") return bestOfClass(computeCompTerm({ pupils, marksByPupil: marks, comps: cls.comps || [], term }));
  const subjects = cls.subjects || [];
  return bestOfClass(computeTerm({ pupils, marksByPupil: marks, subjects, term, seqs: [1, 2] }));
}

function classBlock(title, b) {
  return el("div", { class: "card" }, el("h3", {}, title),
    el("p", {}, "Best overall: ", el("b", {}, nameList(b.overall.names)), b.overall.avg != null ? ` (${fmt(b.overall.avg)}/20)` : ""),
    b.top.length > 1 ? el("p", { class: "muted" }, "Top 3: " + b.top.map((t, i) => `${i + 1}. ${t.name} ${fmt(t.avg)}`).join(" · ")) : null,
    el("div", { class: "scroll" }, el("table", { class: "grid" },
      el("tr", {}, el("th", {}, "Subject"), el("th", {}, "Best pupil"), el("th", {}, "Average /20")),
      b.bySubject.map((s) => el("tr", {}, el("td", { class: "l" }, s.name), el("td", { class: "l" }, nameList(s.names)), el("td", {}, fmt(s.avg)))))),
    b.pupils > b.eligible ? el("p", { class: "muted" }, `Overall best counts only the ${b.eligible} of ${b.pupils} pupils who have marks in every subject.`) : null);
}

// Inside one class (teacher or principal).
export function bestClassTab(box, { S, put, termOptions, TERM_NAMES }) {
  const draw = () => {
    const b = classResult(S, S.pupils, S.marks, S.cls, S.term);
    put(box,
      el("div", { class: "card noprint" }, el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; draw(); }),
        el("button", { class: "btn alt", onclick: () => window.print() }, "Print")),
        el("p", { class: "muted" }, "Worked out automatically from the marks you entered (Seq 1 and Seq 2 of the term).")),
      classBlock(`${S.cls.name} · ${TERM_NAMES[S.term]} · best pupils`, b));
  };
  draw();
}

// Principal: whole school.
export async function bestSchoolTab(box, { S, put, termOptions, TERM_NAMES, loadSchoolData }) {
  put(box, el("p", { class: "muted" }, "Working out the best pupils…"));
  await loadSchoolData(false);
  const draw = () => {
    const per = S.classes.map((c) => {
      const d = S.cache[c.id] || { pupils: [], marks: {} };
      return { name: c.name, best: classResult(S, d.pupils, d.marks, c, S.term) };
    });
    const sch = bestOfSchool(per);
    put(box,
      el("div", { class: "card noprint" }, el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; draw(); }),
        el("button", { class: "btn alt", onclick: () => window.print() }, "Print"),
        el("button", { class: "btn alt", onclick: async () => { await loadSchoolData(true); draw(); } }, "Refresh"))),
      el("div", { class: "card" }, el("h3", {}, `Best pupil in the school · ${TERM_NAMES[S.term]}`),
        sch.winners.length
          ? [el("p", { class: "big" }, el("b", {}, sch.winners.map((w) => `${w.name} (${w.cls})`).join(", ")), ` · ${fmt(sch.winners[0].avg)}/20`),
            sch.top.length > 1 ? el("p", { class: "muted" }, "Next: " + sch.top.slice(sch.winners.length).map((t) => `${t.name} (${t.cls}) ${fmt(t.avg)}`).join(" · ")) : null]
          : el("p", { class: "muted" }, "No marks entered yet.")),
      per.map((p) => classBlock(p.name, p.best)));
  };
  draw();
}
