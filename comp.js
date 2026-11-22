// Official competence-based booklet (marks per month, per evaluation type). Pure logic, no browser needed.
import { appreciation, denseRanks, round2 } from "./calc.js";

export const TERM_MONTHS = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8] };
export const compKey = (month, compId, partIdx) => `c${month}_${compId}_${partIdx}`;

// Level I, Class One booklet (preset). Format per line: Competence name | Part max, Part max, ...
export const LEVEL1_PRESET = [
  "1A English Language | Oral 20, Written 15, Attitude 5",
  "1B French Language | Oral 20, Written 15, Attitude 5",
  "1C National Language | Oral 15, Written 5",
  "2A Mathematics | Oral 10, Written 15, Practical 3, Attitude 2",
  "2B Science and Technology | Oral 5, Written 15, Practical 5, Attitude 5",
  "3 Citizenship and Social Life | Oral 10, Written 5, Practical 5, Attitude 10",
].join("\n");

// "Name | Oral 20, Written 15" -> [{name, parts:[{name,max}], max}]. Bad lines are skipped.
export function parseCompetences(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.lastIndexOf("|");
    if (bar < 1) continue;
    const name = line.slice(0, bar).trim();
    const parts = line.slice(bar + 1).split(",").map((p) => {
      const m = p.trim().match(/^(.*?)[\s:=-]*(\d+(?:\.\d+)?)$/);
      return m && m[1].trim() ? { name: m[1].trim(), max: parseFloat(m[2]) } : null;
    }).filter((p) => p && p.max > 0);
    if (!name || !parts.length) continue;
    out.push({ name, parts, max: parts.reduce((a, p) => a + p.max, 0) });
  }
  return out;
}
export const compsToText = (comps) => (comps || []).map((c) => `${c.name} | ${c.parts.map((p) => `${p.name} ${p.max}`).join(", ")}`).join("\n");

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Term mark of one evaluation type = average of the months entered in that term.
export function partTerm(m, comp, partIdx, term) {
  const vals = TERM_MONTHS[term].map((mo) => m[compKey(mo, comp.id, partIdx)]).filter(isNum);
  return vals.length ? mean(vals) : null;
}

// Same shape as computeTerm so Best pupils and Weak subjects work unchanged. Each competence acts as a subject (avg out of 20).
export function computeCompTerm({ pupils, marksByPupil, comps, term }) {
  const rows = pupils.map((p) => {
    const m = marksByPupil[p.id] || {};
    const subs = comps.map((c, i) => {
      const parts = c.parts.map((pt, j) => ({ name: pt.name, max: pt.max, val: partTerm(m, c, j, term) }));
      const got = parts.filter((x) => x.val != null);
      const score = got.length ? got.reduce((a, x) => a + x.val, 0) : null;
      const maxUsed = got.reduce((a, x) => a + x.max, 0);
      return { idx: i, name: c.name, coef: 1, seq: {}, parts, score, max: c.max, maxUsed, avg: score == null ? null : (score / maxUsed) * 20 };
    });
    const have = subs.filter((s) => s.score != null);
    const total = have.length ? have.reduce((a, s) => a + s.score, 0) : null;
    const totalMax = have.reduce((a, s) => a + s.maxUsed, 0);
    return { pupilId: p.id, name: p.name, subjects: subs, total: total == null ? null : round2(total), totalMax: totalMax || null,
      totalCoef: totalMax || null, studentAvg: total == null ? null : round2((total / totalMax) * 20) };
  });
  const ranks = denseRanks(rows.map((r) => r.studentAvg));
  rows.forEach((r, i) => { r.rank = ranks[i]; r.grade = appreciation(r.studentAvg); });
  const avgs = rows.map((r) => r.studentAvg).filter((v) => v != null);
  const subjectAvgs = comps.map((c, i) => {
    const a = rows.map((r) => r.subjects[i].avg).filter((v) => v != null);
    return { idx: i, name: c.name, coef: 1, avg: a.length ? round2(mean(a)) : null, n: a.length };
  });
  return { rows, classAvg: avgs.length ? round2(mean(avgs)) : null, subjectAvgs, ranked: rows.filter((r) => r.rank != null).length };
}

// Annual: mean of the term totals (/20 averages) over the terms that have marks.
export function computeCompYear({ pupils, marksByPupil, comps }) {
  const terms = [1, 2, 3].map((t) => computeCompTerm({ pupils, marksByPupil, comps, term: t }));
  const rows = pupils.map((p, i) => {
    const per = terms.map((t) => t.rows[i]);
    const avgs = per.map((r) => r.studentAvg).filter((v) => v != null);
    const yearAvg = avgs.length ? round2(mean(avgs)) : null;
    return { pupilId: p.id, name: p.name, terms: per, yearAvg, grade: appreciation(yearAvg) };
  });
  const ranks = denseRanks(rows.map((r) => r.yearAvg));
  rows.forEach((r, i) => (r.rank = ranks[i]));
  return { rows, terms };
}

// How much of one month has been entered.
export function compCompletion({ pupils, marksByPupil, comps, month }) {
  let total = 0, filled = 0;
  for (const p of pupils) {
    const m = marksByPupil[p.id] || {};
    comps.forEach((c) => c.parts.forEach((_, j) => { total++; if (isNum(m[compKey(month, c.id, j)])) filled++; }));
  }
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return { total, filled, pct, status: filled === 0 ? "not started" : filled === total ? "done" : "in progress" };
}

// Completion over all months of a term (used by the principal's Progress tab).
export function compTermCompletion({ pupils, marksByPupil, comps, term }) {
  let total = 0, filled = 0;
  for (const mo of TERM_MONTHS[term]) {
    const c = compCompletion({ pupils, marksByPupil, comps, month: mo });
    total += c.total; filled += c.filled;
  }
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return { total, filled, pct, pupils: pupils.length, pupilsDone: 0, status: filled === 0 ? "not started" : filled === total ? "done" : "in progress" };
}
