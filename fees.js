// School fees tracker: who paid, who owes, receipts. Visible to the principal only.
// Data: classes/{cid}.feeAmount (fee for the class) and classes/{cid}/fees/{pupilId} = { due?, phone?, pays:[{id,no,date,amount,note}] }
import { el, select, toast, randomCode, waNumber, printHtml } from "./ui.js";

export const money = (n) => `${Math.round(Number(n) || 0).toLocaleString("en-US")} FCFA`;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const okImg = (u) => typeof u === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 400000;
const today = () => new Date().toISOString().slice(0, 10);

// What one pupil owes. A pupil's own amount (scholarship, discount) beats the class fee.
export function feeSummary(classFee, rec) {
  const own = rec && rec.due != null && rec.due !== "" ? Number(rec.due) : null;
  const due = own != null && own >= 0 ? own : Number(classFee) || 0;
  const paid = ((rec && rec.pays) || []).reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const balance = due - paid;
  const status = due <= 0 && paid <= 0 ? "nofee" : balance <= 0 ? "paid" : paid > 0 ? "part" : "none";
  return { due, paid, balance, status };
}
export function classTotals(classFee, pupils, recs) {
  let expected = 0, collected = 0, owing = 0;
  pupils.forEach((p) => {
    const s = feeSummary(classFee, recs[p.id]);
    expected += s.due; collected += s.paid;
    if (s.balance > 0) owing++;
  });
  return { expected, collected, balance: Math.max(0, expected - collected), owing, pct: expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0 };
}

export function receiptHtml({ school, className, year, pupil, pay, due, paidAfter, stamp, signature, footer }) {
  const bal = due - paidAfter;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(pay.no)}</title><style>
body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:12px;color:#000}
.r{max-width:150mm;margin:0 auto;border:1.5px solid #000;padding:8mm;position:relative}
h1{margin:0;text-align:center;font-size:20px;text-transform:uppercase}h2{margin:2px 0 10px;text-align:center;font-size:15px}
table{width:100%;border-collapse:collapse}td{border:1px solid #000;padding:6px 8px;font-size:14px}td:first-child{background:#eee;width:42%;font-weight:bold}
.big{font-size:18px;font-weight:bold}.sig{display:flex;justify-content:flex-end;margin-top:12px;min-height:26mm;position:relative}
.sig img{max-height:22mm;max-width:45mm;object-fit:contain}.sig img.st{position:absolute;right:30mm;bottom:-4mm;max-height:26mm}
.f{margin-top:8px;text-align:center;font-size:11px;color:#444}</style></head><body><div class="r">
<h1>${esc(school)}</h1><h2>FEES RECEIPT / REÇU DE PAIEMENT</h2>
<table>
<tr><td>Receipt no.</td><td>${esc(pay.no)}</td></tr><tr><td>Date</td><td>${esc(pay.date)}</td></tr>
<tr><td>Pupil</td><td>${esc(pupil)}</td></tr><tr><td>Class</td><td>${esc(className)}${year ? " · " + esc(year) : ""}</td></tr>
<tr><td>Amount received</td><td class="big">${esc(money(pay.amount))}</td></tr>
${pay.note ? `<tr><td>For</td><td>${esc(pay.note)}</td></tr>` : ""}
<tr><td>Total fees</td><td>${esc(money(due))}</td></tr><tr><td>Total paid so far</td><td>${esc(money(paidAfter))}</td></tr>
<tr><td>Balance</td><td class="big">${bal > 0 ? esc(money(bal)) : "FULLY PAID"}</td></tr></table>
<div class="sig">${okImg(signature) ? `<img src="${signature}" alt="">` : ""}${okImg(stamp) ? `<img class="st" src="${stamp}" alt="">` : ""}</div>
<div class="f">${esc(footer || "")}</div></div></body></html>`;
}

export function waReceiptText({ school, pupil, pay, due, paidAfter }) {
  const bal = due - paidAfter;
  return `${school}\nReceipt ${pay.no} (${pay.date})\nPupil: ${pupil}\nReceived: ${money(pay.amount)}\nTotal paid: ${money(paidAfter)} of ${money(due)}\n${bal > 0 ? "Balance: " + money(bal) : "Fully paid. Thank you."}`;
}

// ctx supplies the app's own pieces so this file stays independent.
export async function feesTab(box, ctx) {
  const { S, db, fs, field, put, business, loadSchoolData, showPrincipal } = ctx;
  const { doc, getDocs, setDoc, updateDoc, collection } = fs;
  const feesRef = (cid) => collection(db, "schools", S.sid, "classes", cid, "fees");
  put(box, el("p", { class: "muted" }, "Loading fees…"));
  await loadSchoolData(false);
  const cache = {}; // cid -> { pupilId: record }
  const loadFees = async (cid) => {
    const snap = await getDocs(feesRef(cid));
    cache[cid] = {};
    snap.forEach((d) => (cache[cid][d.id] = d.data()));
  };
  await Promise.all(S.classes.map((c) => loadFees(c.id)));

  const overview = () => {
    let E = 0, C = 0;
    const rows = S.classes.map((c) => {
      const pupils = (S.cache[c.id] || { pupils: [] }).pupils;
      const t = classTotals(c.feeAmount, pupils, cache[c.id] || {});
      E += t.expected; C += t.collected;
      return el("tr", {}, el("td", {}, c.name), el("td", {}, pupils.length), el("td", {}, c.feeAmount ? money(c.feeAmount) : "–"),
        el("td", {}, money(t.collected)), el("td", {}, money(t.balance)), el("td", {}, `${t.pct}%`),
        el("td", {}, el("button", { class: "btn sm", onclick: () => classView(c.id) }, "Open")));
    });
    put(box,
      el("div", { class: "card" }, el("h3", {}, "School fees"),
        el("p", {}, "Expected: ", el("b", {}, money(E)), " · Collected: ", el("b", {}, money(C)), " · Still owed: ", el("b", {}, money(Math.max(0, E - C)))),
        el("p", { class: "muted" }, "Set the fee for each class, record every payment, print receipts and see who still owes. Only you (the principal) can see this part.")),
      S.classes.length
        ? el("div", { class: "card scroll" }, el("table", { class: "grid" },
          el("tr", {}, ["Class", "Pupils", "Fee", "Collected", "Owed", "Paid", ""].map((h) => el("th", {}, h))), rows))
        : el("p", { class: "muted" }, "Add classes and pupils first."));
  };

  let selected = null;
  const classView = (cid) => {
    const c = S.classes.find((x) => x.id === cid);
    const pupils = (S.cache[cid] || { pupils: [] }).pupils;
    const recs = cache[cid];
    const feeIn = el("input", { type: "number", min: "0", inputmode: "numeric", placeholder: "e.g. 25000", value: c.feeAmount || "" });
    const saveFee = el("button", { class: "btn sm" }, "Save fee");
    saveFee.onclick = async () => {
      const v = Math.max(0, Math.round(+feeIn.value || 0));
      try { await updateDoc(doc(db, "schools", S.sid, "classes", cid), { feeAmount: v }); c.feeAmount = v; toast("Fee saved."); classView(cid); } catch (e) { toast(e.message); }
    };
    const t = classTotals(c.feeAmount, pupils, recs);
    const pillFor = (s) => ({ paid: ["ok", "Paid"], part: ["warn", "Part paid"], none: ["bad", "Not paid"], nofee: ["", "No fee"] }[s.status]);

    const rows = pupils.map((p, i) => {
      const s = feeSummary(c.feeAmount, recs[p.id]);
      const [cls, label] = pillFor(s);
      return el("tr", {}, el("td", {}, i + 1), el("td", { class: "l" }, p.name), el("td", {}, money(s.due)), el("td", {}, money(s.paid)),
        el("td", {}, s.balance > 0 ? money(s.balance) : "–"), el("td", {}, el("span", { class: `pill ${cls}` }, label)),
        el("td", { class: "noprint" }, el("button", { class: "btn sm", onclick: () => { selected = p.id; classView(cid); } }, "Pay")));
    });

    // payment panel for the chosen pupil
    let panel = null;
    if (selected && pupils.some((p) => p.id === selected)) {
      const p = pupils.find((x) => x.id === selected);
      const rec = recs[p.id] || { pays: [] };
      const s = feeSummary(c.feeAmount, rec);
      const amt = el("input", { type: "number", min: "1", inputmode: "numeric", placeholder: "Amount received" });
      const date = el("input", { type: "date", value: today() });
      const note = el("input", { placeholder: "For (e.g. 1st instalment)" });
      const phone = el("input", { type: "tel", placeholder: "Parent's WhatsApp (optional)", value: rec.phone || "" });
      const own = el("input", { type: "number", min: "0", inputmode: "numeric", placeholder: `Class fee (${money(c.feeAmount)})`, value: rec.due != null && rec.due !== "" ? rec.due : "" });
      const persist = async (next) => {
        recs[p.id] = next;
        await setDoc(doc(db, "schools", S.sid, "classes", cid, "fees", p.id), next);
      };
      const give = (pay, after) => {
        const info = { school: S.school.name, className: c.name, year: c.year || S.school.year, pupil: p.name, pay, due: s.due, paidAfter: after,
          stamp: S.school.stamp, signature: S.school.signature, footer: `${business.name} · ${business.phone}` };
        return info;
      };
      const addPay = el("button", { class: "btn" }, "Save payment");
      addPay.onclick = async () => {
        const a = Math.round(+amt.value);
        if (!(a > 0)) return toast("Type the amount received.");
        addPay.disabled = true;
        try {
          const pay = { id: randomCode(6), no: `R${(date.value || today()).slice(2, 4)}-${randomCode(5)}`, date: date.value || today(), amount: a, note: note.value.trim() };
          const next = { due: own.value === "" ? null : Math.max(0, Math.round(+own.value)), phone: phone.value.trim(), pays: [...(rec.pays || []), pay] };
          await persist(next);
          const ns = feeSummary(c.feeAmount, next);
          toast("Payment saved.");
          selected = p.id;
          classView(cid);
          printHtml(receiptHtml({ ...give(pay, ns.paid), due: ns.due, paidAfter: ns.paid }));
        } catch (e) { toast(e.message); addPay.disabled = false; }
      };
      const saveInfo = el("button", { class: "btn alt sm" }, "Save fee/phone only");
      saveInfo.onclick = async () => {
        try { await persist({ due: own.value === "" ? null : Math.max(0, Math.round(+own.value)), phone: phone.value.trim(), pays: rec.pays || [] }); toast("Saved."); classView(cid); } catch (e) { toast(e.message); }
      };
      const hist = (rec.pays || []).slice().reverse().map((pay) => {
        const idx = (rec.pays || []).findIndex((x) => x.id === pay.id);
        const upTo = (rec.pays || []).slice(0, idx + 1).reduce((t, x) => t + x.amount, 0);
        return el("div", { class: "row", style: "align-items:center;justify-content:space-between;border-top:1px solid #ddd;padding:6px 0" },
          el("span", {}, `${pay.date} · `, el("b", {}, money(pay.amount)), pay.note ? ` · ${pay.note}` : "", el("span", { class: "muted" }, ` · ${pay.no}`)),
          el("span", {},
            el("button", { class: "btn alt sm", onclick: () => printHtml(receiptHtml({ ...give(pay, upTo), due: s.due, paidAfter: upTo })) }, "Receipt"),
            " ",
            (waNumber(rec.phone) ? el("button", { class: "btn alt sm", onclick: () => window.open(`https://wa.me/${waNumber(rec.phone)}?text=${encodeURIComponent(waReceiptText({ school: S.school.name, pupil: p.name, pay, due: s.due, paidAfter: upTo }))}`, "_blank") }, "WhatsApp") : null),
            " ",
            el("button", { class: "btn bad sm", onclick: async () => {
              if (!confirm(`Delete this payment of ${money(pay.amount)}?`)) return;
              try { await persist({ ...rec, pays: rec.pays.filter((x) => x.id !== pay.id) }); classView(cid); } catch (e) { toast(e.message); }
            } }, "Delete")));
      });
      panel = el("div", { class: "card noprint" },
        el("h3", {}, p.name),
        el("p", {}, `Fees ${money(s.due)} · Paid ${money(s.paid)} · `, el("b", {}, s.balance > 0 ? `Owes ${money(s.balance)}` : "Fully paid")),
        field("Amount received (FCFA)", amt), field("Date", date), field("For", note),
        el("details", {}, el("summary", { class: "muted" }, "Parent's phone and special fee"), field("Parent's WhatsApp", phone), field("This pupil's own fee (leave empty to use the class fee)", own), el("div", { class: "row" }, saveInfo)),
        el("div", { class: "row" }, addPay, el("button", { class: "btn alt", onclick: () => { selected = null; classView(cid); } }, "Close")),
        hist.length ? el("div", {}, el("h4", {}, "Payments"), hist) : null);
    }

    const owing = pupils.map((p) => ({ p, s: feeSummary(c.feeAmount, recs[p.id]), r: recs[p.id] || {} })).filter((x) => x.s.balance > 0 && x.s.due > 0);
    const owingList = el("div", { class: "card" }, el("h3", {}, `Owing list (${owing.length})`),
      owing.length ? el("table", { class: "grid" }, el("tr", {}, ["Pupil", "Paid", "Owes", ""].map((h) => el("th", { class: h ? "" : "noprint" }, h))),
        owing.map((x) => el("tr", {}, el("td", { class: "l" }, x.p.name), el("td", {}, money(x.s.paid)), el("td", {}, money(x.s.balance)),
          el("td", { class: "noprint" }, waNumber(x.r.phone) ? el("button", { class: "btn alt sm", onclick: () => window.open(`https://wa.me/${waNumber(x.r.phone)}?text=${encodeURIComponent(`${S.school.name}: dear parent, ${x.p.name} (${c.name}) still owes ${money(x.s.balance)} in school fees. Thank you.`)}`, "_blank") }, "Remind") : "")))) : el("p", { class: "muted" }, "Nobody owes anything."));

    put(box,
      el("div", { class: "card noprint" }, el("div", { class: "row" }, el("button", { class: "btn alt sm", onclick: () => { selected = null; overview(); } }, "← All classes"), el("button", { class: "btn alt sm", onclick: () => window.print() }, "Print this page")),
        el("h3", {}, `${c.name} fees`), field("Fee for this class (FCFA, for the year)", feeIn), el("div", { class: "row" }, saveFee),
        el("p", {}, "Expected ", el("b", {}, money(t.expected)), " · Collected ", el("b", {}, money(t.collected)), " · Owed ", el("b", {}, money(t.balance)), ` · ${t.pct}% paid`)),
      panel,
      pupils.length ? el("div", { class: "card scroll" }, el("table", { class: "grid" }, el("tr", {}, ["#", "Pupil", "Fee", "Paid", "Owes", "Status", ""].map((h) => el("th", { class: h ? "" : "noprint" }, h))), rows)) : el("p", { class: "muted" }, "No pupils in this class yet."),
      owingList);
  };
  overview();
}
