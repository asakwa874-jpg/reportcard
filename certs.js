// "Certificates": certificat de scolarité and attestation d'études for one pupil, ready to print.
// The wording follows the school's own certificate. Missing details print as dotted blanks to fill by hand.
import { el, select, toast } from "./ui.js";

const CSS = `
.cs-sheet{background:#fff;color:#000;max-width:190mm;margin:12px auto;padding:12mm 14mm;border:1px solid #bbb;font-family:Georgia,"Times New Roman",serif;font-size:15px;line-height:1.9}
.cs-head{display:grid;grid-template-columns:70px 1fr 70px;align-items:center;gap:8px;text-align:center;border-bottom:3px double #333;padding-bottom:8px;margin-bottom:22px}
.cs-logo{max-width:70px;max-height:70px;object-fit:contain}
.cs-school{font-weight:700;font-size:18px;text-transform:uppercase;line-height:1.3}
.cs-sub{font-size:12px;line-height:1.4}
.cs-title{text-align:center;font-weight:700;font-size:20px;text-decoration:underline;margin:10px 0 2px;text-transform:uppercase}
.cs-year{text-align:center;margin-bottom:18px}
.cs-body{text-align:justify;text-indent:28px}
.cs-body b{font-weight:700}
.cs-foot{margin-top:26px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.cs-date{margin-top:40px}
.cs-sign{text-align:center;min-width:200px}
.cs-sig{position:relative;height:120px;margin-top:4px}
.cs-sig img{position:absolute;left:50%;top:0;transform:translateX(-50%);max-height:110px;max-width:200px}
.cs-sig img.sg{z-index:2}
.cs-dir{font-weight:700}
@media print{
  @page{size:A4;margin:10mm}
  .cs-sheet{border:none;margin:0;max-width:none;padding:6mm 8mm}
}`;

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function niceDate(iso, lang) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const day = Number(m[3]);
  const name = (lang === "fr" ? MONTHS_FR : MONTHS_EN)[Number(m[2]) - 1];
  return lang === "fr" ? `${day === 1 ? "1er" : day} ${name} ${m[1]}` : `${day} ${name} ${m[1]}`;
}

export function certsTab(box, ctx) {
  const { S, put, savePupil } = ctx;
  if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab).")));
  if (!document.getElementById("cs-style")) document.head.append(el("style", { id: "cs-style" }, CSS));

  const g = (f) => S.cls[f] || (S.school && S.school[f]) || "";
  const today = new Date().toISOString().slice(0, 10);
  const st = S.certState || (S.certState = { pid: S.pupils[0].id, doc: "cert", lang: "fr", date: today, status: "now" });
  if (!S.pupils.find((p) => p.id === st.pid)) st.pid = S.pupils[0].id;
  const pupil = () => S.pupils.find((p) => p.id === st.pid);

  const redraw = () => certsTab(box, ctx);
  const dotted = (v, n = 18) => (v ? el("b", {}, v) : el("span", {}, "…".repeat(n)));

  // pupil details (saved on the pupil, shown live in the preview while typing)
  const p0 = pupil();
  const dobI = el("input", { type: "date", value: p0.dob || "" });
  const pobI = el("input", { placeholder: "Place of birth", value: p0.pob || "" });
  const resI = el("input", { placeholder: "Residence (town)", value: p0.residence || "" });
  const regI = el("input", { placeholder: "e.g. FBBS/00055/25", value: p0.regNo || "" });
  const sheetBox = el("div", {});
  const paint = () => sheetBox.replaceChildren(buildSheet());
  [dobI, pobI, resI, regI].forEach((i) => i.addEventListener("input", paint));

  const saveBtn = el("button", { class: "btn alt sm" }, "Save these details");
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      await savePupil(p0.id, { dob: dobI.value, pob: pobI.value.trim(), residence: resI.value.trim(), regNo: regI.value.trim() });
      toast("Details saved.");
    } catch (e) { toast("Not saved: " + e.message); }
    saveBtn.disabled = false;
  };

  function buildSheet() {
    const lang = st.lang;
    const fr = lang === "fr";
    const p = pupil();
    const name = p.name;
    const dob = niceDate(dobI.value, lang);
    const school = g("schoolName");
    const director = g("directorName");
    const title = g("directorTitle");
    const town = g("town");
    const year = S.cls.year || g("year");
    const cls = S.cls.name;
    const regNo = regI.value.trim();
    const dirText = director ? `${director}${title ? ", " + title : ""}` : null;

    let heading, paragraph;
    if (st.doc === "cert") {
      heading = fr ? "Certificat de scolarité" : "Certificate of attendance";
      paragraph = fr
        ? ["Je soussigné ", dirText ? el("b", {}, dirText) : dotted("", 30), ", certifie que l'élève ", el("b", {}, name), ", né(e) le ", dotted(dob), " à ", dotted(pobI.value.trim()),
           ", résidant à ", dotted(resI.value.trim()), ", est régulièrement inscrit(e) dans le registre de l'école sous le numéro ", dotted(regNo),
           " et fréquente la classe de ", el("b", {}, cls), ". En foi de quoi ce certificat lui est délivré pour servir et valoir ce que de droit."]
        : ["I, the undersigned ", dirText ? el("b", {}, dirText) : dotted("", 30), ", certify that the pupil ", el("b", {}, name), ", born on ", dotted(dob), " at ", dotted(pobI.value.trim()),
           ", residing at ", dotted(resI.value.trim()), ", is duly enrolled in the school register under number ", dotted(regNo),
           " and attends ", el("b", {}, cls), ". This certificate is issued to serve and be used as and when necessary."];
    } else {
      heading = fr ? "Attestation d'études" : "Attestation of studies";
      const now = st.status === "now";
      paragraph = fr
        ? ["Je soussigné ", dirText ? el("b", {}, dirText) : dotted("", 30), ", atteste que l'élève ", el("b", {}, name), ", né(e) le ", dotted(dob), " à ", dotted(pobI.value.trim()),
           ", ", now ? "est inscrit(e) et suit régulièrement les cours" : "a suivi régulièrement les cours", " dans notre établissement, ", el("b", {}, school), ", en classe de ", el("b", {}, cls),
           " pour l'année scolaire ", el("b", {}, year), ", sous le numéro d'inscription ", dotted(regNo), ". La présente attestation lui est délivrée pour servir et valoir ce que de droit."]
        : ["I, the undersigned ", dirText ? el("b", {}, dirText) : dotted("", 30), ", attest that the pupil ", el("b", {}, name), ", born on ", dotted(dob), " at ", dotted(pobI.value.trim()),
           ", ", now ? "is enrolled and regularly attends classes" : "regularly attended classes", " at our school, ", el("b", {}, school), ", in ", el("b", {}, cls),
           " for the school year ", el("b", {}, year), ", under registration number ", dotted(regNo), ". This attestation is issued to serve and be used as and when necessary."];
    }

    const logo = g("logo");
    const head = el("div", { class: "cs-head" },
      logo ? el("img", { class: "cs-logo", src: logo, alt: "" }) : el("span"),
      el("div", {},
        el("div", { class: "cs-school" }, school),
        g("address") ? el("div", { class: "cs-sub" }, g("address")) : null,
        g("phones") ? el("div", { class: "cs-sub" }, g("phones")) : null),
      el("span"));

    const stamp = g("stamp");
    const sign = g("signature");
    return el("div", { class: "cs-sheet" },
      head,
      el("div", { class: "cs-title" }, heading),
      el("div", { class: "cs-year" }, fr ? "L'année scolaire : " : "School year: ", el("b", {}, year)),
      el("div", { class: "cs-body" }, paragraph),
      el("div", { class: "cs-foot" },
        el("div", { class: "cs-date" }, fr ? "Fait à " : "Done at ", town ? el("b", {}, town) : dotted("", 8), fr ? ", le " : ", on ", el("b", {}, niceDate(st.date, lang))),
        el("div", { class: "cs-sign" },
          el("div", { class: "cs-dir" }, fr ? "Le Directeur" : "The Director"),
          el("div", { class: "cs-sig" },
            stamp ? el("img", { src: stamp, alt: "" }) : null,
            sign ? el("img", { class: "sg", src: sign, alt: "" }) : null),
          director ? el("div", {}, director) : null)));
  }

  const pupilSel = select(S.pupils.map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.name}` })), st.pid, (v) => { st.pid = v; redraw(); });
  const docSel = select([{ value: "cert", label: "Certificat de scolarité" }, { value: "att", label: "Attestation d'études" }], st.doc, (v) => { st.doc = v; redraw(); });
  const langSel = select([{ value: "fr", label: "Français" }, { value: "en", label: "English" }], st.lang, (v) => { st.lang = v; redraw(); });
  const statusSel = st.doc === "att"
    ? select([{ value: "now", label: "Studies now (currently enrolled)" }, { value: "past", label: "Studied (past)" }], st.status, (v) => { st.status = v; redraw(); })
    : null;
  const dateI = el("input", { type: "date", value: st.date });
  dateI.addEventListener("input", () => { st.date = dateI.value; paint(); });
  const lbl = (t, node) => el("div", {}, el("label", { class: "f" }, t), node);

  const missing = [];
  if (!g("directorName")) missing.push("the director's name");
  if (!g("town")) missing.push("the town");
  if (!g("address") && !g("phones")) missing.push("the school address and phone");

  put(box,
    el("div", { class: "card noprint" },
      el("h3", {}, "Certificates"),
      el("div", { class: "row" }, pupilSel),
      el("div", { class: "row" }, docSel, langSel),
      statusSel ? el("div", { class: "row" }, statusSel) : null,
      lbl("Date on the document", dateI),
      el("details", { open: !(p0.dob && p0.pob && p0.regNo) },
        el("summary", { class: "muted" }, "Pupil details (date of birth, place of birth, residence, registration number)"),
        lbl("Date of birth", dobI), lbl("Place of birth", pobI), lbl("Residence", resI), lbl("Registration number", regI),
        el("div", { class: "row" }, saveBtn)),
      missing.length ? el("p", { class: "note" }, `Not set yet in Setup: ${missing.join(", ")}. Those parts print as dotted blanks.`) : null,
      el("div", { class: "row" }, el("button", { class: "btn", onclick: () => window.print() }, "Print / Save as PDF"))),
    sheetBox);
  paint();
}
