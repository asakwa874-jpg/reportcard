import { el, toast } from "./ui.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z\s]/g, "").trim();

function findPupil(spoken, pupils) {
  const q = norm(spoken);
  if (!q) return null;
  return (
    pupils.find((p) => norm(p.name) === q) ||
    pupils.find((p) => norm(p.name).includes(q)) ||
    pupils.find((p) => norm(p.name).split(" ").includes(q.split(" ")[0]))
  );
}

export function micButton({ getPupils, onMarks, lang = "en-GB" }) {
  if (!SR) return null;
  let rec = null;
  const btn = el("button", { class: "btn alt sm", type: "button" }, "🎤 Speak marks");
  btn.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = lang; // use "fr-FR" for French
    rec.continuous = true;
    rec.onresult = (e) => {
      const text = e.results[e.results.length - 1][0].transcript;
      const nums = (text.match(/\d+([.,]\d+)?/g) || []).map((n) => Number(n.replace(",", ".")));
      const pupil = findPupil(text.replace(/[\d.,]+/g, ""), getPupils());
      if (!pupil || !nums.length) return toast("Not understood: " + text);
      onMarks(pupil, nums);
      toast(`${pupil.name}: ${nums.join(", ")}`);
    };
    rec.onend = () => { rec = null; btn.textContent = "🎤 Speak marks"; };
    rec.onerror = (e) => toast("Voice error: " + e.error);
    rec.start();
    btn.textContent = "⏹ Stop";
  });
  return btn;
}
