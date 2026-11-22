// Pure calculation logic for the report card system (no browser or Firebase needed).
// Marks are out of 20. Each term has two sequences (Seq 1, Seq 2).

export const SCALE = [
  { min: 18, letter: "A+", short: "Exp", label: "Expert" },
  { min: 15, letter: "A", short: "CA", label: "Competence Acquired" },
  { min: 11, letter: "B", short: "CPA", label: "Competence in the Process of Acquisition" },
  { min: 0, letter: "C", short: "CNA", label: "Competence Not Acquired" },
];

export function appreciation(avg) {
  if (avg == null || Number.isNaN(avg)) return null;
  return SCALE.find((s) => avg >= s.min) || SCALE[SCALE.length - 1];
}

export const round2 = (x) => Math.round(x * 100) / 100;
export const mkKey = (term, seq, subjectIdx) => `${term}_${seq}_${subjectIdx}`;
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

// "English Language:5" per line (also accepts "English Language 5"). Coef defaults to 1.
export function parseSubjects(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s:,;=-]+(\d+(?:\.\d+)?)$/);
      if (m && m[1].trim()) return { name: m[1].trim(), coef: parseFloat(m[2]) };
      return { name: line, coef: 1 };
    });
}

// Ties share a position and the next student gets the next number (no skipping): 1,1,2,3.
export function denseRanks(values) {
  const distinct = [...new Set(values.filter((v) => v != null).map(round2))].sort((a, b) => b - a);
  return values.map((v) => (v == null ? null : distinct.indexOf(round2(v)) + 1));
}

// pupils: [{id,name}], marksByPupil: {pupilId: {"term_seq_subjectIdx": number}}
export function computeTerm({ pupils, marksByPupil, subjects, term, seqs = [1, 2] }) {
  const rows = pupils.map((p) => {
    const m = marksByPupil[p.id] || {};
    const subs = subjects.map((s, i) => {
      const seq = {};
      const vals = [];
      for (const q of seqs) {
        const v = m[mkKey(term, q, s.id ?? i)];
        seq[q] = isNum(v) ? v : null;
        if (isNum(v)) vals.push(v);
      }
      return { idx: i, name: s.name, coef: s.coef, seq, avg: vals.length ? mean(vals) : null };
    });
    let num = 0;
    let den = 0;
    for (const s of subs) {
      if (s.avg != null) {
        num += s.avg * s.coef;
        den += s.coef;
      }
    }
    return {
      pupilId: p.id,
      name: p.name,
      subjects: subs,
      total: den ? round2(num) : null,
      totalCoef: den || null,
      studentAvg: den ? round2(num / den) : null,
    };
  });

  const ranks = denseRanks(rows.map((r) => r.studentAvg));
  rows.forEach((r, i) => {
    r.rank = ranks[i];
    r.grade = appreciation(r.studentAvg);
  });

  const avgs = rows.map((r) => r.studentAvg).filter((v) => v != null);
  const classAvg = avgs.length ? round2(mean(avgs)) : null;
  const subjectAvgs = subjects.map((s, i) => {
    const a = rows.map((r) => r.subjects[i].avg).filter((v) => v != null);
    return { idx: i, name: s.name, coef: s.coef, avg: a.length ? round2(mean(a)) : null, n: a.length };
  });
  const ranked = rows.filter((r) => r.rank != null).length;
  return { rows, classAvg, subjectAvgs, ranked };
}

// How far a class has got with entering one sequence.
export function completion({ pupils, marksByPupil, subjects, term, seq }) {
  const total = pupils.length * subjects.length;
  let filled = 0;
  let pupilsDone = 0;
  for (const p of pupils) {
    const m = marksByPupil[p.id] || {};
    let c = 0;
    subjects.forEach((s, i) => {
      if (isNum(m[mkKey(term, seq, s.id ?? i)])) c++;
    });
    filled += c;
    if (subjects.length && c === subjects.length) pupilsDone++;
  }
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const status = !pupils.length || filled === 0 ? "not started" : pupilsDone === pupils.length ? "done" : "in progress";
  return { total, filled, pct, pupilsDone, pupils: pupils.length, status };
}

export function weakest(subjectAvgs, n = 3) {
  return subjectAvgs
    .filter((s) => s.avg != null)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, n);
}

/* ---------- smart options ---------- */

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Reads a mark (0 to 20) out of text from a photo or a pasted line. "15/20", "14,5", "x 17 x" -> 15, 14.5, 17.
export function extractMark(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  const over = t.match(/(?<!\d)(\d{1,2}(?:[.,]\d{1,2})?)\s*\/\s*20(?!\d)/);
  const cands = over ? [over[1]] : [...t.matchAll(/(?<!\d)\d{1,2}(?:[.,]\d{1,2})?(?!\d)/g)].map((m) => m[0]);
  for (const c of cands) {
    const n = Number(c.replace(",", "."));
    if (!Number.isNaN(n) && n >= 0 && n <= 20) return n;
  }
  return null;
}

// Pasted marks for ONE subject. Lines like "Ada Ngwa 15", "Ada - 15/20", or just "15" (then the order of the class list is used).
export function parsePasted(text, pupils) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const normPupils = pupils.map((p) => ({ p, n: norm(p.name) }));
  return lines.map((line, idx) => {
    const m = line.match(/^(.*?)[\s:;,=\-–]*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\/\s*20)?\s*$/);
    if (!m) return { line, status: "badmark", pupilId: null, mark: null, name: line };
    const namePart = m[1].replace(/^\s*\d+[.)]\s*/, "").trim(); // drop "1." or "2)" list numbers
    const mark = Number(m[2].replace(",", "."));
    if (mark < 0 || mark > 20) return { line, status: "badmark", pupilId: null, mark, name: namePart };
    if (!namePart) {
      const p = pupils[idx];
      return p ? { line, status: "ok", pupilId: p.id, name: p.name, mark } : { line, status: "nomatch", pupilId: null, name: "", mark };
    }
    const q = norm(namePart);
    let hits = normPupils.filter((x) => x.n === q);
    if (!hits.length) {
      const words = q.split(" ");
      hits = normPupils.filter((x) => words.every((w) => x.n.split(" ").includes(w)));
    }
    if (!hits.length) hits = normPupils.filter((x) => x.n.includes(q) || (x.n.length > 2 && q.includes(x.n)));
    if (hits.length === 1) return { line, status: "ok", pupilId: hits[0].p.id, name: hits[0].p.name, mark };
    return { line, status: hits.length ? "ambiguous" : "nomatch", pupilId: null, name: namePart, mark };
  });
}

// Broadsheet statistics per subject and overall (pass mark 10/20).
export function classStats(res, passMark = 10) {
  const subjects = res.rows.length
    ? res.subjectAvgs.map((s, i) => {
        const vals = res.rows.map((r) => r.subjects[i].avg).filter((v) => v != null);
        return {
          name: s.name,
          avg: s.avg,
          high: vals.length ? round2(Math.max(...vals)) : null,
          low: vals.length ? round2(Math.min(...vals)) : null,
          passPct: vals.length ? Math.round((vals.filter((v) => v >= passMark).length / vals.length) * 100) : null,
        };
      })
    : [];
  const avgs = res.rows.map((r) => r.studentAvg).filter((v) => v != null);
  return {
    subjects,
    high: avgs.length ? Math.max(...avgs) : null,
    low: avgs.length ? Math.min(...avgs) : null,
    passPct: avgs.length ? Math.round((avgs.filter((v) => v >= passMark).length / avgs.length) * 100) : null,
  };
}

// Class teacher's remark made from the grade and the pupil's weakest subject.
export function autoRemark(row, lang = "en") {
  const g = row.grade;
  if (!g) return "";
  const fr = lang === "fr";
  const base = (fr
    ? { "A+": "Excellent travail. Continuez ainsi.", A: "Très bon résultat. Continuez à bien travailler.", B: "Bons efforts. Plus d'entraînement donnera de meilleurs résultats.", C: "Doit fournir plus d'efforts et être suivi de près à la maison." }
    : { "A+": "Excellent work. Keep it up.", A: "Very good result. Keep working hard.", B: "Good effort. More practice will bring better results.", C: "Needs more effort and close follow-up at home." })[g.letter];
  const sub = row.subjects.filter((s) => s.avg != null).sort((a, b) => a.avg - b.avg)[0];
  const weak = g.letter !== "A+" && sub && sub.avg < 10 ? (fr ? ` Doit s'améliorer en ${sub.name}.` : ` Must improve in ${sub.name}.`) : "";
  return base + weak;
}

// Flags that deserve a second look: two sequences far apart for the same subject.
export function seqGap(subject, gap = 8) {
  const a = subject.seq[1];
  const b = subject.seq[2];
  return a != null && b != null && Math.abs(a - b) >= gap;
}

// Best pupils of one class (res = computeTerm result).
// Subject winners: highest subject average (ties share it). Overall: highest student average, counting only pupils
// who have a mark in every subject that has marks in this class, so half-filled sheets cannot win by accident.
export function bestOfClass(res) {
  const used = res.subjectAvgs.filter((s) => s.n > 0).map((s) => s.idx);
  const bySubject = res.subjectAvgs.map((s) => {
    const vals = res.rows.filter((r) => r.subjects[s.idx].avg != null);
    if (!vals.length) return { idx: s.idx, name: s.name, avg: null, names: [] };
    const top = Math.max(...vals.map((r) => round2(r.subjects[s.idx].avg)));
    return { idx: s.idx, name: s.name, avg: top, names: vals.filter((r) => round2(r.subjects[s.idx].avg) === top).map((r) => r.name) };
  });
  const eligible = res.rows.filter((r) => r.studentAvg != null && used.every((i) => r.subjects[i].avg != null));
  const sorted = eligible.slice().sort((a, b) => b.studentAvg - a.studentAvg || a.name.localeCompare(b.name));
  const best = sorted.length ? sorted[0].studentAvg : null;
  return {
    bySubject,
    overall: { avg: best, names: sorted.filter((r) => r.studentAvg === best).map((r) => r.name) },
    top: sorted.slice(0, 3).map((r) => ({ name: r.name, avg: r.studentAvg, grade: r.grade })),
    eligible: eligible.length,
    pupils: res.rows.length,
  };
}

// Best pupil(s) in the whole school: highest student average over all classes (averages are /20, so classes compare fairly).
// classes: [{ name, best }] where best = bestOfClass(...)
export function bestOfSchool(classes) {
  const all = [];
  classes.forEach((c) => c.best.top.forEach((t) => all.push({ cls: c.name, ...t })));
  all.sort((a, b) => b.avg - a.avg || a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name));
  if (!all.length) return { winners: [], top: [] };
  const top = all[0].avg;
  return { winners: all.filter((x) => x.avg === top), top: all.slice(0, 5) };
}

// Reads "32/40", "16 / 20", "14,5" from text. total is null when only one number is found.
export function extractFraction(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  const f = t.match(/(?<!\d)(\d{1,3}(?:[.,]\d{1,2})?)\s*\/\s*(\d{1,3})(?!\d)/);
  if (f) {
    const value = Number(f[1].replace(",", "."));
    const total = Number(f[2]);
    if (total > 0 && value >= 0 && value <= total) return { value, total };
  }
  // Fraction written one above the other (no slash): the OCR reads "12 20" or "12\n20".
  const nums = [...t.matchAll(/(?<!\d)\d{1,3}(?:[.,]\d{1,2})?(?!\d)/g)].map((m) => Number(m[0].replace(",", ".")));
  if (nums.length >= 2 && nums[1] > 0 && nums[0] <= nums[1] && nums[1] >= 5) return { value: nums[0], total: nums[1] };
  return nums.length ? { value: nums[0], total: null } : null;
}

// Script mark out of its own total -> mark out of the evaluation's maximum. 32/40 on an evaluation of 20 -> 16.
export function convertMark(value, total, max) {
  if (value == null || Number.isNaN(value)) return null;
  const v = total ? (value / total) * max : value;
  return Math.round(v * 100) / 100;
}
