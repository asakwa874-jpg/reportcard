// Tiny DOM helpers. Everything is built with textContent, so pupil names can never inject HTML.

export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

export function select(options, value, onchange, attrs) {
  const s = el("select", attrs || {});
  for (const o of options) {
    const opt = el("option", { value: String(o.value) }, o.label);
    if (String(o.value) === String(value)) opt.selected = true;
    s.append(opt);
  }
  if (onchange) s.addEventListener("change", () => onchange(s.value));
  return s;
}

let toastTimer;
export function toast(msg, ms = 3500) {
  let t = document.getElementById("toast");
  if (!t) {
    t = el("div", { id: "toast", class: "toast noprint" });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

export function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L to avoid mix-ups
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function waNumber(input) {
  const d = String(input || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 9 ? "237" + d : d; // 9-digit Cameroon numbers get the 237 prefix
}

export function download(filename, text, type = "text/html") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Shrinks a chosen picture (stamp or signature) to a small PNG/JPEG so it can be saved with the school and printed on cards.
export function imageToDataUrl(file, maxDim = 260) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error("Choose a photo or image (PNG or JPG)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let out = c.toDataURL("image/png");
      if (out.length > 120000) {            // big photos: JPEG on white is much smaller
        g.globalCompositeOperation = "destination-over";
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", 0.8);
      }
      out.length > 200000 ? reject(new Error("The picture is too big. Use a smaller or simpler image.")) : resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The picture could not be read.")); };
    img.src = url;
  });
}

export function printHtml(html) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(f);
  f.contentDocument.open();
  f.contentDocument.write(html);
  f.contentDocument.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignored */ } setTimeout(() => f.remove(), 60000); }, 300);
}
