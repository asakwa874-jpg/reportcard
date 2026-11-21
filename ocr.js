// Reads a handwritten or printed number from the camera, inside the phone's browser.
// It uses the free Tesseract.js reader, downloaded the first time it is needed (about 10 MB, needs internet once).
// The teacher always confirms the number before it is saved.
import { extractMark } from "./calc.js";

const SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the reader. Check your internet connection."));
    document.head.append(s);
  });
}

async function getWorker(onStatus) {
  if (!workerPromise) {
    workerPromise = (async () => {
      if (onStatus) onStatus("Loading the reader (first time only)…");
      await loadScript(SRC);
      const w = await window.Tesseract.createWorker("eng");
      await w.setParameters({
        tessedit_char_whitelist: "0123456789.,/",
        tessedit_pageseg_mode: (window.Tesseract.PSM && window.Tesseract.PSM.SINGLE_LINE) || "7",
      });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

// Crop the framed area from a video or image and clean it up (grey, then black and white) so digits stand out.
export function cropToCanvas(source, box) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  const sx = sw * box.x, sy = sh * box.y, cw = sw * box.w, ch = sh * box.h;
  const scale = Math.min(3, 180 / ch);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(cw * scale));
  c.height = Math.max(1, Math.round(ch * scale));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g]++;
  }
  // Otsu threshold
  const total = c.width * c.height;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, max = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > max) { max = between; thr = t; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > thr ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function readMarkFromCanvas(canvas, onStatus) {
  const w = await getWorker(onStatus);
  if (onStatus) onStatus("Reading…");
  const { data } = await w.recognize(canvas);
  return { text: data.text, mark: extractMark(data.text) };
}
