import { el } from "./ui.js";
import { SCALE } from "./calc.js";

export const TERM_NAMES = ["", "FIRST TERM", "SECOND TERM", "THIRD TERM"];
export const TERM_NAMES_FR = ["", "PREMIER TRIMESTRE", "DEUXIÈME TRIMESTRE", "TROISIÈME TRIMESTRE"];

// Card wording. "fr" is used automatically for Francophone classes (or when chosen on the Report cards tab).
export const TXT = {
  en: { title: "REPORT CARD", name: "Name: ", cls: "Class: ", section: "Section: ", count: "Number in class: ", subject: "Subject / Competence", coef: "Coef", seq: "Seq", stud: "Student average /20", clsAvg: "Class average /20", appr: "Appreciation", studAvgS: "Student average", clsAvgS: "Class average", pos: "Position", remark: "Class teacher's remark: ", scale: "Scale /20: ", from: "from", teacher: "Class teacher", principal: "Principal", parent: "Parent / Guardian", terms: TERM_NAMES },
  fr: { title: "BULLETIN SCOLAIRE", name: "Nom et prénoms : ", cls: "Classe : ", section: "Section : ", count: "Effectif : ", subject: "Matière / Compétence", coef: "Coef", seq: "Séq", stud: "Moyenne élève /20", clsAvg: "Moyenne classe /20", appr: "Appréciation", studAvgS: "Moyenne de l'élève", clsAvgS: "Moyenne de la classe", pos: "Rang", remark: "Observation du maître / de la maîtresse : ", scale: "Barème /20 : ", from: "dès", teacher: "Le maître / La maîtresse", principal: "Le Directeur / La Directrice", parent: "Parent / Tuteur", terms: TERM_NAMES_FR },
};
// Only real image data (made by the app) is ever put in an <img>.
const okImg = (u) => typeof u === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 400000;

// Same CSS is used on screen, for printing, and inside the file sent to the principal.
export const CARD_CSS = `
.rc{box-sizing:border-box;width:var(--cw,190mm);margin:0 auto 12px;padding:6mm;background:#fff;color:#000;border:1.5px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:var(--cf,11px);page-break-after:always;break-after:page}
.rc *{box-sizing:border-box}
.rc h1{margin:0;text-align:center;font-size:1.35em;text-transform:uppercase}
.rc h2{margin:2px 0 6px;text-align:center;font-size:1.1em}
.rc .meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid #000;border-bottom:0}
.rc .meta div{padding:3px 6px;border-bottom:1px solid #000}
.rc .meta div:nth-child(odd){border-right:1px solid #000}
.rc table{width:100%;border-collapse:collapse;margin-top:6px}
.rc th,.rc td{border:1px solid #000;padding:3px 4px;text-align:center}
.rc td.l,.rc th.l{text-align:left}
.rc th{background:#e8e8e8}
.rc .sum{display:grid;grid-template-columns:repeat(4,1fr);margin-top:6px;border:1px solid #000}
.rc .sum div{padding:4px 6px;border-right:1px solid #000;text-align:center}
.rc .sum div:last-child{border-right:0}
.rc .sum b{display:block;font-size:1.25em}
.rc .sum span{font-size:.85em;text-transform:uppercase}
.rc .remark{margin-top:6px;border:1px solid #000;padding:4px 6px;min-height:2.4em}
.rc .scale{margin-top:6px;font-size:.85em}
.rc .sig{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:6px;text-align:center}
.rc .sig div{border-top:1px solid #000;padding-top:3px;position:relative}
.rc .sig .sp{border:0;padding:0;height:20mm;position:relative;display:flex;align-items:flex-end;justify-content:center}
.rc .sig .sp:empty{height:12mm}
.rc .sig .sp img{max-height:19mm;max-width:100%;object-fit:contain}
.rc .sig .sp img.stamp{max-height:24mm;position:absolute;right:0;bottom:-2mm;opacity:.9}
.rc .foot{margin-top:6px;text-align:right;font-size:.75em;color:#444}
`;

const fmt = (n) => (n == null ? "–" : String(Number(n.toFixed(2))));

export function renderCard({ schoolName, className, section, year, term, row, classAvg, classSubjectAvgs, count, seqs, business, remark, lang = "en", stamp, signature, teacherSign }) {
  const g = row.grade;
  const T = TXT[lang] || TXT.en;
  const head = el(
    "tr",
    {},
    el("th", { class: "l" }, T.subject),
    el("th", {}, T.coef),
    seqs.map((q) => el("th", {}, `${T.seq} ${q}`)),
    el("th", {}, T.stud),
    el("th", {}, T.clsAvg),
    el("th", {}, T.appr)
  );
  const body = row.subjects.map((s, i) => {
    const a = s.avg == null ? null : SCALE.find((x) => s.avg >= x.min);
    return el(
      "tr",
      {},
      el("td", { class: "l" }, s.name),
      el("td", {}, fmt(s.coef)),
      seqs.map((q) => el("td", {}, fmt(s.seq[q]))),
      el("td", {}, fmt(s.avg)),
      el("td", {}, fmt(classSubjectAvgs ? classSubjectAvgs[i] : null)),
      el("td", {}, a ? `${a.letter} (${a.short})` : "–")
    );
  });
  return el(
    "div",
    { class: "rc" },
    el("h1", {}, schoolName || "School"),
    el("h2", {}, `${T.title} – ${T.terms[term]}${year ? " – " + year : ""}`),
    el(
      "div",
      { class: "meta" },
      el("div", {}, el("b", {}, T.name), row.name),
      el("div", {}, el("b", {}, T.cls), className),
      el("div", {}, el("b", {}, T.section), section || "–"),
      el("div", {}, el("b", {}, T.count), String(count))
    ),
    el("table", {}, head, body),
    el(
      "div",
      { class: "sum" },
      el("div", {}, el("span", {}, T.studAvgS), el("b", {}, `${fmt(row.studentAvg)} / 20`)),
      el("div", {}, el("span", {}, T.clsAvgS), el("b", {}, `${fmt(classAvg)} / 20`)),
      el("div", {}, el("span", {}, T.pos), el("b", {}, row.rank ? `${row.rank} / ${count}` : "–")),
      el("div", {}, el("span", {}, T.appr), el("b", {}, g ? `${g.letter} – ${g.short}` : "–"))
    ),
    remark ? el("div", { class: "remark" }, el("b", {}, T.remark), remark) : null,
    el(
      "div",
      { class: "scale" },
      T.scale + [...SCALE].reverse().map((s) => `${s.letter} (${s.short}) ${T.from} ${s.min}`).join(" · ")
    ),
    el(
      "div",
      { class: "sig" },
      el("div", {}, el("div", { class: "sp" }, okImg(teacherSign) ? el("img", { src: teacherSign, alt: "" }) : null), T.teacher),
      el("div", {}, el("div", { class: "sp" }, okImg(signature) ? el("img", { src: signature, alt: "" }) : null, okImg(stamp) ? el("img", { src: stamp, alt: "", class: "stamp" }) : null), T.principal),
      el("div", {}, el("div", { class: "sp" }), T.parent)
    ),
    business ? el("div", { class: "foot" }, `${business.name} · ${business.phone}`) : null
  );
}
