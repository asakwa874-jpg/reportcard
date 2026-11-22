// Smart scan for the official competence booklet: choose month, competence and evaluation once, then snap
// each pupil's script. A mark written as 32/40 is converted to the evaluation's own maximum before saving.
import { el, select, toast } from "./ui.js";
import { cropToCanvas, readMarkFromCanvas } from "./ocr.js";
import { TERM_MONTHS, compKey } from "./comp.js";
import { extractFraction, convertMark } from "./calc.js";
import { stopScan } from "./scan.js";

const FRAME = { x: 0.15, y: 0.35, w: 0.7, h: 0.3 };
// The picture is shown cropped (object-fit: cover). Work out the same framed area in the real video picture.
function frameFor(video) {
  const vw = video.videoWidth, vh = video.videoHeight, cw = video.clientWidth, ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch) return FRAME;
  const scale = Math.max(cw / vw, ch / vh);
  const visW = cw / scale, visH = ch / scale;
  const ox = (vw - visW) / 2, oy = (vh - visH) / 2;
  return { x: (ox + FRAME.x * visW) / vw, y: (oy + FRAME.y * visH) / vh, w: (FRAME.w * visW) / vw, h: (FRAME.h * visH) / vh };
}
let stream = null;
const stopCam = () => { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } };

export function compScanTab(box, { S, saveMark, put, termOptions, TERM_NAMES }) {
  const comps = S.cls.comps || [];
  if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab).")));
  if (!comps.length) return put(box, el("div", { class: "card" }, el("p", {}, "This class has no competences yet.")));
  if (S.snapPupil == null || !S.pupils.find((p) => p.id === S.snapPupil)) S.snapPupil = S.pupils[0].id;
  if (!(S.snapComp < comps.length)) S.snapComp = 0;
  if (!(S.snapPart < comps[S.snapComp].parts.length)) S.snapPart = 0;
  if (!TERM_MONTHS[S.term].includes(S.snapMonth)) S.snapMonth = TERM_MONTHS[S.term][0];

  const video = el("video", { class: "cam", playsinline: true, autoplay: true });
  video.muted = true;
  const camWrap = el("div", { class: "camwrap" }, video, el("div", { class: "camframe" }));
  camWrap.style.display = "none";
  const status = el("p", { class: "muted" }, "Start the camera, frame the circled mark on the script and tap Read mark.");
  const who = el("p", {});
  const raw = el("input", { type: "text", inputmode: "decimal", placeholder: "Mark on script, e.g. 32" });
  const tot = el("input", { type: "text", inputmode: "decimal", placeholder: "Script total, e.g. 40" });
  const conv = el("p", { class: "big" });
  const cur = () => comps[S.snapComp];
  const part = () => cur().parts[S.snapPart];
  const key = () => compKey(S.snapMonth, cur().id, S.snapPart);

  const pupilSel = select(S.pupils.map((p) => ({ value: p.id, label: p.name })), S.snapPupil, (v) => { S.snapPupil = v; refresh(); });
  const monthSel = select(TERM_MONTHS[S.term].map((m) => ({ value: m, label: `Month ${m}` })), S.snapMonth, (v) => { S.snapMonth = +v; refresh(); });
  const compSel = select(comps.map((c, i) => ({ value: i, label: c.name })), S.snapComp, (v) => { S.snapComp = +v; S.snapPart = 0; compScanTab(box, { S, saveMark, put, termOptions, TERM_NAMES }); });
  const partSel = select(cur().parts.map((p, i) => ({ value: i, label: `${p.name} (/${p.max})` })), S.snapPart, (v) => { S.snapPart = +v; refresh(); });
  const startBtn = el("button", { class: "btn" }, "Start camera");
  const stopBtn = el("button", { class: "btn alt" }, "Stop camera");
  stopBtn.style.display = "none";
  const readBtn = el("button", { class: "btn alt" }, "Read mark");
  const saveBtn = el("button", { class: "btn" }, "Save and next pupil");

  // value after conversion, or an error text
  const result = () => {
    const t = raw.value.trim().replace(",", ".");
    if (t === "") return { empty: true };
    const v = Number(t);
    const tt = tot.value.trim().replace(",", ".");
    const total = tt === "" ? null : Number(tt);
    if (Number.isNaN(v) || v < 0 || (total != null && (Number.isNaN(total) || total <= 0 || v > total))) return { error: "Check the mark and the script total." };
    const out = convertMark(v, total, part().max);
    if (out > part().max) return { error: `${part().name} is out of ${part().max}. Enter the script total if the script is out of more.` };
    return { value: out, total };
  };
  function showConv() {
    const r = result();
    if (r.empty) conv.textContent = "";
    else if (r.error) conv.textContent = r.error;
    else conv.textContent = r.total && r.total !== part().max ? `${raw.value} / ${r.total} becomes ${r.value} / ${part().max}` : `Saves ${r.value} / ${part().max}`;
  }
  function refresh() {
    const p = S.pupils.find((x) => x.id === S.snapPupil);
    const old = (S.marks[p.id] || {})[key()];
    who.replaceChildren(el("b", {}, p.name), ` · Month ${S.snapMonth} · ${cur().name} · ${part().name} (/${part().max})`, old != null ? ` · current mark ${old}` : "");
    pupilSel.value = S.snapPupil;
    raw.value = old == null ? "" : String(old);
    tot.value = old == null ? "" : String(part().max);
    showConv();
  }
  raw.addEventListener("input", showConv);
  tot.addEventListener("input", showConv);

  startBtn.onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      camWrap.style.display = "block"; startBtn.style.display = "none"; stopBtn.style.display = "";
      status.textContent = "Frame the circled mark (like 32/40) and tap Read mark.";
    } catch (e) { toast("Could not open the camera. Allow camera access, or type the mark."); }
  };
  stopBtn.onclick = () => { stopCam(); camWrap.style.display = "none"; startBtn.style.display = ""; stopBtn.style.display = "none"; status.textContent = "Camera stopped."; };

  readBtn.onclick = async () => {
    if (!stream) return toast("Start the camera first.");
    readBtn.disabled = true;
    try {
      const r = await readMarkFromCanvas(cropToCanvas(video, frameFor(video)), (m) => (status.textContent = m));
      const f = extractFraction(r.text);
      if (!f) status.textContent = "Could not read a mark. Move closer, keep it steady, or type the mark.";
      else {
        raw.value = String(f.value);
        tot.value = f.total ? String(f.total) : String(part().max);
        showConv();
        status.textContent = `Read ${f.value}${f.total ? "/" + f.total : ""}. Check it against the script, then tap Save.`;
      }
    } catch (e) { status.textContent = e.message || "Could not read the mark. Type it in."; }
    readBtn.disabled = false;
  };

  saveBtn.onclick = async () => {
    const r = result();
    if (r.error) return toast(r.error);
    const p = S.pupils.find((x) => x.id === S.snapPupil);
    saveBtn.disabled = true;
    try {
      await saveMark(p.id, key(), r.empty ? null : r.value);
      const next = S.pupils[S.pupils.findIndex((x) => x.id === p.id) + 1];
      toast(next ? `Saved for ${p.name}. Next: ${next.name}` : `Saved for ${p.name}. That was the last pupil.`);
      if (next) S.snapPupil = next.id;
      refresh();
      status.textContent = "Frame the next script's mark, or pick the pupil below.";
    } catch (e) { toast("Not saved: " + e.message); }
    saveBtn.disabled = false;
  };

  const picker = el("div", { class: "card" },
    el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; S.snapMonth = TERM_MONTHS[S.term][0]; compScanTab(box, { S, saveMark, put, termOptions, TERM_NAMES }); }), monthSel),
    el("div", { class: "row" }, compSel, partSel));
  // Camera, mark boxes and buttons stay together at the top of the screen while the page scrolls.
  put(box,
    el("div", { class: "card stickycam" }, camWrap, el("div", { class: "row" }, startBtn, stopBtn), status, who,
      el("div", { class: "row" }, raw, tot), conv, el("div", { class: "row" }, readBtn, saveBtn)),
    picker,
    el("div", { class: "card" }, el("label", { class: "f" }, "Pupil"), pupilSel));
  refresh();
}
export { stopCam as stopCompScan };
