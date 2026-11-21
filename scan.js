// Smart scan: one camera view that (1) finds the pupil from the QR label on the script
// and (2) reads the mark you frame. The teacher confirms every mark before it is saved.
import { el, select, toast } from "./ui.js";
import { cropToCanvas, readMarkFromCanvas } from "./ocr.js";

export const qrPayload = (classId, pupilId) => `RC1|${classId}|${pupilId}`;

// Where the mark must sit inside the camera picture (fractions of width and height). Matches .camframe in styles.css.
const FRAME = { x: 0.15, y: 0.35, w: 0.7, h: 0.3 };

let stream = null;
let timer = null;

export function stopScan() {
  if (timer) { clearInterval(timer); timer = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}

export function smartScanTab(box, api) {
  const { S, subjKey, saveMark, parseMark, termSeqPickers, field, put } = api;
  const subjects = S.cls.subjects || [];
  if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab).")));
  if (S.snapPupil == null || !S.pupils.find((p) => p.id === S.snapPupil)) S.snapPupil = S.pupils[0].id;
  if (S.snapSubject >= subjects.length) S.snapSubject = 0;

  const video = el("video", { class: "cam", playsinline: true, autoplay: true });
  video.muted = true;
  const camWrap = el("div", { class: "camwrap" }, video, el("div", { class: "camframe" }));
  camWrap.style.display = "none";
  const status = el("p", { class: "muted" }, "Start the camera, point it at the pupil's QR label, then frame the mark and tap Read mark.");
  const who = el("p", {});
  const mark = el("input", { type: "text", inputmode: "decimal", placeholder: "Mark /20" });
  const pupilSel = select(S.pupils.map((p) => ({ value: p.id, label: p.name })), S.snapPupil, (v) => { S.snapPupil = v; refresh(); });
  const subjSel = select(subjects.map((s, i) => ({ value: i, label: s.name })), S.snapSubject, (v) => { S.snapSubject = +v; refresh(); });
  const startBtn = el("button", { class: "btn" }, "Start camera");
  const stopBtn = el("button", { class: "btn alt" }, "Stop camera");
  stopBtn.style.display = "none";
  const readBtn = el("button", { class: "btn alt" }, "Read mark");
  const saveBtn = el("button", { class: "btn" }, "Save and next pupil");

  const key = () => subjKey(S.term, S.seq, subjects[S.snapSubject], S.snapSubject);
  function refresh() {
    const p = S.pupils.find((x) => x.id === S.snapPupil);
    const cur = (S.marks[p.id] || {})[key()];
    who.replaceChildren(el("b", {}, p.name), " · ", subjects[S.snapSubject].name, cur != null ? ` · current mark ${cur}` : "");
    pupilSel.value = S.snapPupil;
    mark.value = cur == null ? "" : String(cur);
  }

  let detector = null;
  let busy = false;
  let lastBad = 0;
  async function scanQr() {
    if (busy || !detector || video.readyState < 2) return;
    busy = true;
    try {
      const codes = await detector.detect(video);
      const c = codes.find((x) => String(x.rawValue).startsWith("RC1|"));
      if (c) {
        const [, cid, pid] = String(c.rawValue).split("|");
        if (cid !== S.cid) {
          if (Date.now() - lastBad > 3000) { toast("That QR label is for another class."); lastBad = Date.now(); }
        } else if (pid !== S.snapPupil && S.pupils.some((p) => p.id === pid)) {
          S.snapPupil = pid;
          refresh();
          if (navigator.vibrate) navigator.vibrate(80);
          status.textContent = "Pupil found. Frame the mark and tap Read mark.";
        }
      }
    } catch (e) { /* ignore a failed frame */ }
    busy = false;
  }

  startBtn.onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      camWrap.style.display = "block";
      startBtn.style.display = "none";
      stopBtn.style.display = "";
      if ("BarcodeDetector" in window) {
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        status.textContent = "Point the camera at the pupil's QR label.";
        timer = setInterval(scanQr, 350);
      } else {
        status.textContent = "This browser cannot scan QR labels (Chrome on Android can). Pick the pupil by name below, then frame the mark.";
      }
    } catch (e) {
      toast("Could not open the camera. Allow camera access, or pick the pupil by name and type the mark.");
    }
  };
  stopBtn.onclick = () => {
    stopScan();
    camWrap.style.display = "none";
    startBtn.style.display = "";
    stopBtn.style.display = "none";
    status.textContent = "Camera stopped.";
  };

  readBtn.onclick = async () => {
    if (!stream) return toast("Start the camera first.");
    readBtn.disabled = true;
    try {
      const canvas = cropToCanvas(video, FRAME);
      const r = await readMarkFromCanvas(canvas, (m) => (status.textContent = m));
      if (r.mark == null) status.textContent = "Could not read a mark. Move closer, keep it steady, or type the mark.";
      else { mark.value = String(r.mark); status.textContent = `Read ${r.mark}. Check it against the script, then tap Save.`; }
    } catch (e) {
      status.textContent = e.message || "Could not read the mark. Type it in.";
    }
    readBtn.disabled = false;
  };

  saveBtn.onclick = async () => {
    const r = parseMark(mark.value);
    if (r.error) return toast("Marks are numbers from 0 to 20.");
    const p = S.pupils.find((x) => x.id === S.snapPupil);
    saveBtn.disabled = true;
    try {
      await saveMark(p.id, key(), r.empty ? null : r.value);
      const next = S.pupils[S.pupils.findIndex((x) => x.id === p.id) + 1];
      toast(next ? `Saved for ${p.name}. Next: ${next.name}` : `Saved for ${p.name}. That was the last pupil.`);
      if (next) S.snapPupil = next.id;
      refresh();
      status.textContent = "Scan the next QR label, or pick the pupil below.";
    } catch (e) { toast("Not saved: " + e.message); }
    saveBtn.disabled = false;
  };

  put(box,
    el("div", { class: "card" }, termSeqPickers(refresh), field("Subject", subjSel)),
    el("div", { class: "card" }, camWrap, el("div", { class: "row" }, startBtn, stopBtn), status),
    el("div", { class: "card" }, who, field("Pupil (if not scanned)", pupilSel), field("Mark", mark), el("div", { class: "row" }, readBtn, saveBtn))
  );
  refresh();
}
