import assert from "node:assert/strict";
import { computeTerm, denseRanks, appreciation, parseSubjects, completion, weakest, mkKey, extractMark, parsePasted, classStats, autoRemark, seqGap } from "./calc.js";

// parseSubjects
assert.deepEqual(parseSubjects("English Language:5\nMathematics 5\nArt"), [
  { name: "English Language", coef: 5 },
  { name: "Mathematics", coef: 5 },
  { name: "Art", coef: 1 },
]);

// dense ranks: ties share a position, next is the next number
assert.deepEqual(denseRanks([15, 18, 15, 12, null]), [2, 1, 2, 3, null]);

// grading scale
assert.equal(appreciation(18).letter, "A+");
assert.equal(appreciation(17.99).letter, "A");
assert.equal(appreciation(15).letter, "A");
assert.equal(appreciation(14.5).letter, "B");
assert.equal(appreciation(10.9).letter, "C");
assert.equal(appreciation(null), null);

// computeTerm
const subjects = [
  { name: "Maths", coef: 5 },
  { name: "English", coef: 3 },
];
const pupils = [
  { id: "a", name: "Ada" },
  { id: "b", name: "Bola" },
  { id: "c", name: "Chi" },
];
const marksByPupil = {
  a: { [mkKey(1, 1, 0)]: 16, [mkKey(1, 2, 0)]: 14, [mkKey(1, 1, 1)]: 10, [mkKey(1, 2, 1)]: 12 },
  b: { [mkKey(1, 1, 0)]: 15, [mkKey(1, 2, 0)]: 15, [mkKey(1, 1, 1)]: 11, [mkKey(1, 2, 1)]: 11 },
  c: { [mkKey(1, 1, 0)]: 8 },
};
const r = computeTerm({ pupils, marksByPupil, subjects, term: 1 });
// Ada: maths 15, english 11 -> (75+33)/8 = 13.5 ; Bola the same: 15,11 -> 13.5 ; Chi: maths 8 only -> 8
assert.equal(r.rows[0].studentAvg, 13.5);
assert.equal(r.rows[1].studentAvg, 13.5);
assert.equal(r.rows[2].studentAvg, 8);
assert.deepEqual(r.rows.map((x) => x.rank), [1, 1, 2]);
assert.equal(r.classAvg, 11.67);
assert.equal(r.subjectAvgs[0].avg, 12.67); // (15+15+8)/3
assert.equal(weakest(r.subjectAvgs, 1)[0].name, "English");

// completion
const c = completion({ pupils, marksByPupil, subjects, term: 1, seq: 1 });
assert.equal(c.pupilsDone, 2);
assert.equal(c.status, "in progress");
assert.equal(completion({ pupils: [], marksByPupil: {}, subjects, term: 1, seq: 1 }).status, "not started");

// extractMark
assert.equal(extractMark("15/20"), 15);
assert.equal(extractMark(" 14,5 "), 14.5);
assert.equal(extractMark("x 17 x"), 17);
assert.equal(extractMark("152"), null);
assert.equal(extractMark("abc"), null);
assert.equal(extractMark("34 and 9/20"), 9);

// parsePasted
const cls = [{ id: "a", name: "Ada Ngwa" }, { id: "b", name: "Bola Tabe" }, { id: "c", name: "Chi Ada" }];
const pp = parsePasted("1. Ada Ngwa 15\nbola - 12,5/20\nChi Ada: 9\nAda 11\nZed 10\nBola Tabe 25\nhello", cls);
assert.deepEqual(pp.map((x) => x.status), ["ok", "ok", "ok", "ambiguous", "nomatch", "badmark", "badmark"]);
assert.equal(pp[1].pupilId, "b");
assert.equal(pp[1].mark, 12.5);
const pos = parsePasted("15\n12\n9", cls);
assert.deepEqual(pos.map((x) => x.pupilId), ["a", "b", "c"]);
assert.equal(parsePasted("Ngwa 14", cls)[0].pupilId, "a");

// stats and remarks
const st = classStats(r);
assert.equal(st.subjects[0].high, 15);
assert.equal(st.subjects[0].low, 8);
assert.equal(st.subjects[0].passPct, 67);
assert.equal(st.passPct, 67);
assert.ok(autoRemark(r.rows[2]).includes("Must improve in Maths"));
assert.ok(autoRemark(r.rows[0]).startsWith("Good effort"));
assert.equal(seqGap({ seq: { 1: 18, 2: 8 } }), true);
assert.equal(seqGap({ seq: { 1: 18, 2: null } }), false);

console.log("All calc tests passed");

// ---- v3: French remarks, fees
import { feeSummary, classTotals, receiptHtml, waReceiptText } from "./fees.js";
assert.ok(autoRemark(r.rows[0], "fr").startsWith("Bons efforts"));
assert.ok(autoRemark(r.rows[2], "fr").includes("Doit s'améliorer en Maths"));
assert.deepEqual(feeSummary(25000, { pays: [{ amount: 10000 }, { amount: 5000 }] }), { due: 25000, paid: 15000, balance: 10000, status: "part" });
assert.equal(feeSummary(25000, { pays: [{ amount: 25000 }] }).status, "paid");
assert.equal(feeSummary(25000, { pays: [{ amount: 30000 }] }).balance, -5000);
assert.equal(feeSummary(25000, {}).status, "none");
assert.equal(feeSummary(25000, { due: 12000, pays: [{ amount: 12000 }] }).status, "paid", "pupil's own fee beats the class fee");
assert.equal(feeSummary(0, undefined).status, "nofee");
assert.deepEqual(classTotals(1000, [{ id: "a" }, { id: "b" }], { a: { pays: [{ amount: 1000 }] }, b: { pays: [{ amount: 400 }] } }), { expected: 2000, collected: 1400, balance: 600, owing: 1, pct: 70 });
const rh = receiptHtml({ school: "A<b>", className: "C1", pupil: "Ada", pay: { no: "R26-X", date: "2026-11-21", amount: 5000, note: "" }, due: 25000, paidAfter: 5000, stamp: "javascript:alert(1)" });
assert.ok(!rh.includes("<b>") && rh.includes("A&lt;b&gt;") && !rh.includes("javascript:") && rh.includes("20,000 FCFA"));
assert.ok(waReceiptText({ school: "S", pupil: "Ada", pay: { no: "1", date: "d", amount: 5000 }, due: 5000, paidAfter: 5000 }).includes("Fully paid"));
console.log("v3 tests ok");

// ---- best pupils
import { bestOfClass, bestOfSchool } from "./calc.js";
{
  const subs = [{ id: "m", name: "Maths", coef: 5 }, { id: "e", name: "English", coef: 5 }];
  const ps = [{ id: "a", name: "Ada" }, { id: "b", name: "Bola" }, { id: "c", name: "Chi" }, { id: "d", name: "Dayo" }];
  const mk = { a: { "1_1_m": 18, "1_1_e": 10 }, b: { "1_1_m": 18, "1_1_e": 16 }, c: { "1_1_m": 12, "1_1_e": 19 }, d: { "1_1_m": 20 } };
  const b = bestOfClass(computeTerm({ pupils: ps, marksByPupil: mk, subjects: subs, term: 1 }));
  assert.deepEqual(b.bySubject[0].names.sort(), ["Dayo"], "Maths best is Dayo (20)");
  assert.deepEqual(b.bySubject[1].names, ["Chi"]);
  assert.deepEqual(b.overall.names, ["Bola"], "Dayo has one subject only so cannot be overall best; Bola 17 beats Chi 15.5");
  assert.equal(b.overall.avg, 17);
  assert.equal(b.eligible, 3);
  const tie = bestOfClass(computeTerm({ pupils: ps.slice(0, 2), marksByPupil: { a: { "1_1_m": 15 }, b: { "1_1_m": 15 } }, subjects: subs, term: 1 }));
  assert.deepEqual(tie.bySubject[0].names, ["Ada", "Bola"], "ties are both named");
  assert.deepEqual(bestOfClass(computeTerm({ pupils: ps, marksByPupil: {}, subjects: subs, term: 1 })).overall.names, []);
  const s = bestOfSchool([{ name: "C1", best: b }, { name: "C2", best: { top: [{ name: "Zed", avg: 18.5 }] } }]);
  assert.equal(s.winners[0].name, "Zed");
  assert.equal(s.winners[0].cls, "C2");
}
console.log("best pupils tests ok");
