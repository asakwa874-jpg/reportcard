import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection,
  query, orderBy, writeBatch, serverTimestamp, Timestamp, deleteField,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig, business } from "./firebase-config.js";
import { el, select, toast, randomCode, waNumber, download, imageToDataUrl } from "./ui.js";
import { computeTerm, completion, weakest, parseSubjects, mkKey, parsePasted, classStats, autoRemark, seqGap } from "./calc.js";
import { qrSvg } from "./qr.js";
import { smartScanTab, stopScan, qrPayload } from "./scan.js";
import { renderCard, CARD_CSS, TERM_NAMES, TERM_NAMES_FR } from "./cards.js";
import { feesTab } from "./fees.js";
import { bestClassTab, bestSchoolTab } from "./best.js";

const root = document.getElementById("app");
const mount = (...nodes) => root.replaceChildren(...nodes.flat(Infinity).filter((x) => x != null && x !== false));
// Put nodes (or arrays of nodes) into a container, replacing what was there.
const put = (box, ...nodes) => box.replaceChildren(...nodes.flat(Infinity).filter((x) => x != null && x !== false));
const styleTag = el("style", {}, CARD_CSS);
document.head.append(styleTag);

let auth;
let db;

// Everything the screens need to remember.
const S = {
  busy: false, role: null, sid: null, school: null, classes: [], cache: {},
  cid: null, cls: null, pupils: [], marks: {}, fromPrincipal: false,
  term: 1, seq: 1, bview: 1, snapPupil: null, snapSubject: 0,
};

/* ---------- small helpers ---------- */
const defaultYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
};
const subjKey = (term, seq, s, i) => mkKey(term, seq, s.id ?? i);
const toDate = (t) => (t && t.toDate ? t.toDate() : t ? new Date(t) : null);
const fmtDate = (d) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "–");
const termOptions = [1, 2, 3].map((t) => ({ value: t, label: TERM_NAMES[t].toLowerCase().replace(/^./, (c) => c.toUpperCase()) }));
const seqOptions = [1, 2].map((q) => ({ value: q, label: `Sequence ${q}` }));
const schoolExpired = () => S.school && toDate(S.school.expiry) < new Date();

function topBar(title, sub, ...buttons) {
  return el("div", { class: "top noprint" }, el("div", { class: "t" }, el("b", {}, title), sub ? el("small", {}, sub) : null), buttons);
}
const footer = () => el("div", { class: "foot noprint" }, `${business.name} · ${business.phone}`);
const logoutBtn = () => el("button", { onclick: logout }, "Sign out");

async function logout() {
  localStorage.removeItem("rc_class");
  Object.assign(S, { role: null, sid: null, school: null, classes: [], cache: {}, cid: null, cls: null });
  await signOut(auth);
  showHome();
}

function field(label, input) {
  return el("div", {}, el("label", { class: "f" }, label), input);
}

function tabBar(tabs, current, onPick) {
  return el(
    "div",
    { class: "tabs noprint" },
    tabs.map(([key, label]) => el("button", { class: key === current ? "on" : "", onclick: () => onPick(key) }, label))
  );
}

/* ---------- start ---------- */
function start() {
  if (String(firebaseConfig.apiKey).startsWith("PASTE")) {
    mount(
      topBar("Almost ready"),
      el("div", { class: "wrap" }, el("div", { class: "card" }, el("h3", {}, "Firebase is not connected yet"),
        el("p", {}, "Open firebase-config.js and paste your Firebase web app settings, then reload. The README explains where to find them."))),
    );
    return;
  }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  onAuthStateChanged(auth, async (user) => {
    if (S.busy) return;
    try {
      if (!user) return showHome();
      if (user.isAnonymous) return await bootTeacher();
      const a = await getDoc(doc(db, "admins", user.uid));
      if (a.exists()) return await showAdmin();
      await bootPrincipal();
    } catch (e) {
      console.error(e);
      showHome("Could not load your account: " + e.message);
    }
  });
}

/* ---------- home & sign in ---------- */
function showHome(msg) {
  mount(
    topBar("School Report Cards", business.name),
    el(
      "div",
      { class: "wrap" },
      msg ? el("p", { class: "note" }, msg) : null,
      el("button", { class: "big", onclick: () => showTeacherCode() }, el("b", {}, "I am a class teacher"), el("span", {}, "Enter the class code your principal gave you")),
      el("button", { class: "big", onclick: () => showStaffLogin() }, el("b", {}, "Principal or admin"), el("span", {}, "Sign in, or register your school with its activation code")),
    ),
    footer()
  );
}

function showTeacherCode(msg) {
  const inp = el("input", { placeholder: "Class code, e.g. K7M2QX", autocapitalize: "characters", autocomplete: "off", maxlength: "12" });
  const btn = el("button", { class: "btn" }, "Open my class");
  btn.onclick = async () => {
    const code = inp.value.trim().toUpperCase();
    if (!code) return;
    btn.disabled = true;
    S.busy = true;
    try {
      if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth);
      if (!auth.currentUser) await signInAnonymously(auth);
      const cs = await getDoc(doc(db, "classCodes", code));
      if (!cs.exists() || !cs.data().active) throw new Error("That code is not valid, or your principal has switched it off.");
      const { schoolId, classId } = cs.data();
      await setDoc(doc(db, "schools", schoolId, "classes", classId, "teachers", auth.currentUser.uid), { code, joinedAt: serverTimestamp() });
      localStorage.setItem("rc_class", JSON.stringify({ sid: schoolId, cid: classId }));
      S.busy = false;
      await bootTeacher();
    } catch (e) {
      S.busy = false;
      toast(e.message || "Could not open the class.");
      btn.disabled = false;
    }
  };
  mount(
    topBar("Class teacher", "Enter your class code", el("button", { onclick: showHome }, "Back")),
    el("div", { class: "wrap" }, msg ? el("p", { class: "note" }, msg) : null,
      el("div", { class: "card" }, field("Class code", inp), el("div", { class: "row" }, btn))),
    footer()
  );
}

function showStaffLogin(msg) {
  const email = el("input", { type: "email", placeholder: "you@example.com", autocomplete: "username" });
  const pass = el("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
  const btn = el("button", { class: "btn" }, "Sign in");
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
    } catch (e) {
      toast("Sign in failed. Check your email and password.");
      btn.disabled = false;
    }
  };
  const reset = el("button", { class: "btn alt sm" }, "Forgot password");
  reset.onclick = async () => {
    if (!email.value.trim()) return toast("Type your email first.");
    try { await sendPasswordResetEmail(auth, email.value.trim()); toast("Password reset email sent."); } catch (e) { toast("Could not send the email."); }
  };
  mount(
    topBar("Principal / Admin", null, el("button", { onclick: showHome }, "Back")),
    el("div", { class: "wrap" }, msg ? el("p", { class: "note" }, msg) : null,
      el("div", { class: "card" }, field("Email", email), field("Password", pass), el("div", { class: "row" }, btn, reset)),
      el("div", { class: "card" }, el("h3", {}, "New school?"),
        el("p", { class: "muted" }, "Register with the activation code you received."),
        el("button", { class: "btn alt", onclick: showRegister }, "Register my school"))),
    footer()
  );
}

function showRegister() {
  const email = el("input", { type: "email", placeholder: "you@example.com", autocomplete: "username" });
  const pass = el("input", { type: "password", placeholder: "At least 6 characters", autocomplete: "new-password" });
  const code = el("input", { placeholder: "Activation code", autocapitalize: "characters", autocomplete: "off" });
  const btn = el("button", { class: "btn" }, "Create principal account");
  btn.onclick = async () => {
    const c = code.value.trim().toUpperCase();
    if (!email.value.trim() || pass.value.length < 6 || !c) return toast("Fill in all three fields (password at least 6 characters).");
    btn.disabled = true;
    S.busy = true;
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
      await linkSchool(cred.user, c);
      S.busy = false;
      await bootPrincipal();
    } catch (e) {
      S.busy = false;
      if (cred) { try { await cred.user.delete(); } catch (_) { /* ignore */ } }
      toast(e.code === "auth/email-already-in-use" ? "That email already has an account. Sign in instead." : e.message || "Could not register.");
      btn.disabled = false;
    }
  };
  mount(
    topBar("Register my school", null, el("button", { onclick: () => showStaffLogin() }, "Back")),
    el("div", { class: "wrap" }, el("div", { class: "card" }, field("Email", email), field("Password", pass), field("Activation code", code), el("div", { class: "row" }, btn))),
    footer()
  );
}

async function linkSchool(user, code) {
  const cs = await getDoc(doc(db, "schoolCodes", code));
  if (!cs.exists() || !cs.data().active) throw new Error("That activation code is not valid.");
  const sid = cs.data().schoolId;
  await setDoc(doc(db, "schools", sid, "principals", user.uid), { code, createdAt: serverTimestamp() });
  await setDoc(doc(db, "users", user.uid), { schoolId: sid });
}

function showLinkSchool() {
  const code = el("input", { placeholder: "Activation code", autocapitalize: "characters" });
  const btn = el("button", { class: "btn" }, "Link my account");
  btn.onclick = async () => {
    btn.disabled = true;
    try { await linkSchool(auth.currentUser, code.value.trim().toUpperCase()); await bootPrincipal(); } catch (e) { toast(e.message); btn.disabled = false; }
  };
  mount(topBar("Link to your school", null, logoutBtn()),
    el("div", { class: "wrap" }, el("div", { class: "card" }, el("p", {}, "This account is not linked to a school yet."), field("Activation code", code), el("div", { class: "row" }, btn))),
    footer());
}

/* ---------- ADMIN ---------- */
async function showAdmin() {
  S.role = "admin";
  mount(topBar("Admin", business.name, logoutBtn()), el("div", { class: "wrap" }, el("p", { class: "muted" }, "Loading schools…")), footer());
  const snap = await getDocs(query(collection(db, "schools"), orderBy("name")));
  const schools = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const name = el("input", { placeholder: "School name (exactly as it must print on cards)" });
  const exp = el("input", { type: "date" });
  const d0 = new Date();
  d0.setFullYear(d0.getFullYear() + 1);
  exp.value = d0.toISOString().slice(0, 10);
  const add = el("button", { class: "btn" }, "Create school");
  add.onclick = async () => {
    if (!name.value.trim()) return toast("Type the school name.");
    add.disabled = true;
    try {
      const code = randomCode(8);
      const ref = await addDoc(collection(db, "schools"), {
        name: name.value.trim(), active: true, expiry: Timestamp.fromDate(new Date(exp.value + "T23:59:59")),
        principalWhatsApp: "", year: defaultYear(), code, createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "schoolCodes", code), { schoolId: ref.id, active: true });
      toast("School created. Give the principal the activation code.");
      showAdmin();
    } catch (e) { toast(e.message); add.disabled = false; }
  };

  const list = schools.map((s) => {
    const expiry = toDate(s.expiry);
    const expired = expiry && expiry < new Date();
    const status = !s.active ? ["Switched off", "bad"] : expired ? ["Expired", "warn"] : ["Active", "ok"];
    const act = async (fn) => { try { await fn(); showAdmin(); } catch (e) { toast(e.message); } };
    return el("div", { class: "card" },
      el("h3", {}, s.name, " ", el("span", { class: `pill ${status[1]}` }, status[0])),
      el("p", { class: "muted" }, "Valid until ", fmtDate(expiry)),
      el("p", {}, "Activation code: ", el("span", { class: "code" }, s.code || "–")),
      el("div", { class: "row" },
        el("button", { class: "btn alt sm", onclick: () => act(async () => {
          const base = expiry && expiry > new Date() ? new Date(expiry) : new Date();
          base.setFullYear(base.getFullYear() + 1);
          await updateDoc(doc(db, "schools", s.id), { expiry: Timestamp.fromDate(base), active: true });
        }) }, "+1 year"),
        el("button", { class: "btn alt sm", onclick: () => act(() => updateDoc(doc(db, "schools", s.id), { active: !s.active })) }, s.active ? "Switch off" : "Switch on"),
        el("button", { class: "btn alt sm", onclick: () => act(async () => {
          const code = randomCode(8);
          if (s.code) await updateDoc(doc(db, "schoolCodes", s.code), { active: false });
          await setDoc(doc(db, "schoolCodes", code), { schoolId: s.id, active: true });
          await updateDoc(doc(db, "schools", s.id), { code });
        }) }, "New code")
      ));
  });

  mount(
    topBar("Admin", business.name, logoutBtn()),
    el("div", { class: "wrap" },
      el("div", { class: "card" }, el("h3", {}, "Add a school"), field("School name", name), field("Valid until", exp), el("div", { class: "row" }, add)),
      el("p", { class: "muted" }, `${schools.length} school${schools.length === 1 ? "" : "s"}. As admin you manage schools only; pupils' names and marks are private to each school.`),
      list.length ? list : el("p", { class: "muted" }, "No schools yet.")
    ),
    footer()
  );
}

/* ---------- PRINCIPAL ---------- */
async function bootPrincipal() {
  const u = await getDoc(doc(db, "users", auth.currentUser.uid));
  if (!u.exists()) return showLinkSchool();
  S.sid = u.data().schoolId;
  const s = await getDoc(doc(db, "schools", S.sid));
  if (!s.exists()) return showHome("Your school could not be found. Contact " + business.name + ".");
  S.school = { id: s.id, ...s.data() };
  S.role = "principal";
  S.fromPrincipal = false;
  await loadClasses();
  showPrincipal("classes");
}

async function loadClasses() {
  const snap = await getDocs(query(collection(db, "schools", S.sid, "classes"), orderBy("name")));
  S.classes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchClassData(sid, cid) {
  const base = ["schools", sid, "classes", cid];
  const [ps, ms] = await Promise.all([
    getDocs(query(collection(db, ...base, "pupils"), orderBy("name"))),
    getDocs(collection(db, ...base, "marks")),
  ]);
  const marks = {};
  ms.forEach((d) => (marks[d.id] = d.data().m || {}));
  return { pupils: ps.docs.map((d) => ({ id: d.id, name: d.data().name })), marks };
}

function showPrincipal(tab = "classes") {
  S.role = "principal";
  const content = el("div", { class: "wrap" });
  const tabs = [["classes", "Classes"], ["progress", "Progress"], ["best", "Best pupils"], ["weak", "Weak subjects"], ["fees", "Fees"], ["setup", "Setup"]];
  mount(
    topBar(S.school.name, "Principal", logoutBtn()),
    tabBar(tabs, tab, (k) => showPrincipal(k)),
    el("div", {}, schoolExpired() ? el("div", { class: "wrap" }, el("p", { class: "note" }, `Your yearly subscription ended on ${fmtDate(toDate(S.school.expiry))}. Contact ${business.name} on ${business.phone} to renew.`)) : null, content),
    footer()
  );
  ({ classes: principalClasses, progress: principalProgress, best: principalBest, weak: principalWeak, fees: principalFees, setup: principalSetup })[tab](content);
}

const DEFAULT_SUBJECTS = "English Language:5\nMathematics:5\nFrench:5\nScience and Technology:3\nSocial Studies:3\nCitizenship:2\nArt and Craft:2\nSport:2";

function principalClasses(box) {
  const name = el("input", { placeholder: "e.g. Class 2" });
  const section = select([{ value: "Anglophone", label: "Anglophone" }, { value: "Francophone", label: "Francophone" }], "Anglophone");
  const subj = el("textarea", {}, DEFAULT_SUBJECTS);
  const add = el("button", { class: "btn" }, "Add class");
  add.onclick = async () => {
    if (!name.value.trim()) return toast("Type the class name.");
    const subjects = parseSubjects(subj.value).map((s) => ({ ...s, id: randomCode(4) }));
    if (!subjects.length) return toast("Add at least one subject.");
    add.disabled = true;
    try {
      const code = await uniqueClassCode();
      const cref = doc(collection(db, "schools", S.sid, "classes"));
      const b = writeBatch(db);
      b.set(cref, {
        name: name.value.trim(), section: section.value, subjects, code, codeActive: true,
        schoolName: S.school.name, principalWhatsApp: S.school.principalWhatsApp || "", year: S.school.year || defaultYear(),
        stamp: S.school.stamp || "", signature: S.school.signature || "",
        createdAt: serverTimestamp(),
      });
      b.set(doc(db, "classCodes", code), { schoolId: S.sid, classId: cref.id, active: true });
      await b.commit();
      await loadClasses();
      showPrincipal("classes");
    } catch (e) { toast(e.message); add.disabled = false; }
  };

  const cards = S.classes.map((c) => {
    const act = async (fn) => { try { await fn(); await loadClasses(); showPrincipal("classes"); } catch (e) { toast(e.message); } };
    const subjBox = el("textarea", {}, (c.subjects || []).map((s) => `${s.name}:${s.coef}`).join("\n"));
    const subjSave = el("button", { class: "btn alt sm" }, "Save subjects");
    subjSave.onclick = () => act(async () => {
      const old = c.subjects || [];
      const next = parseSubjects(subjBox.value).map((s) => {
        const hit = old.find((o) => o.name.toLowerCase() === s.name.toLowerCase());
        return { ...s, id: hit ? hit.id : randomCode(4) };
      });
      if (!next.length) throw new Error("Add at least one subject.");
      await updateDoc(doc(db, "schools", S.sid, "classes", c.id), { subjects: next });
    });
    return el("div", { class: "card" },
      el("h3", {}, c.name, " ", el("span", { class: "pill" }, c.section || ""), " ", el("span", { class: `pill ${c.codeActive ? "ok" : "bad"}` }, c.codeActive ? "Teacher code on" : "Teacher code off")),
      el("p", {}, "Class code: ", el("span", { class: "code" }, c.code)),
      el("div", { class: "row" },
        el("button", { class: "btn sm", onclick: () => openClass(c) }, "Open class"),
        el("button", { class: "btn alt sm", onclick: () => act(async () => {
          const b = writeBatch(db);
          b.update(doc(db, "classCodes", c.code), { active: !c.codeActive });
          b.update(doc(db, "schools", S.sid, "classes", c.id), { codeActive: !c.codeActive });
          await b.commit();
        }) }, c.codeActive ? "Switch code off" : "Switch code on"),
        el("button", { class: "btn alt sm", onclick: () => act(async () => {
          if (!confirm("Issue a new code? The old code stops working immediately for the teacher.")) return;
          const code = await uniqueClassCode();
          const b = writeBatch(db);
          b.update(doc(db, "classCodes", c.code), { active: false });
          b.set(doc(db, "classCodes", code), { schoolId: S.sid, classId: c.id, active: true });
          b.update(doc(db, "schools", S.sid, "classes", c.id), { code, codeActive: true });
          await b.commit();
        }) }, "New code")),
      el("details", {}, el("summary", { class: "muted" }, `Subjects and coefficients (${(c.subjects || []).length})`), subjBox, el("div", { class: "row" }, subjSave)));
  });

  put(box, 
    el("div", { class: "card" }, el("h3", {}, "Add a class"),
      field("Class name", name), field("Section", section),
      field("Subjects (one per line, name:coefficient)", subj), el("div", { class: "row" }, add)),
    cards.length ? cards : el("p", { class: "muted" }, "No classes yet. Add your first class above, then give its code to the class teacher.")
  );
}

async function uniqueClassCode() {
  for (let i = 0; i < 8; i++) {
    const code = randomCode(6);
    const s = await getDoc(doc(db, "classCodes", code));
    if (!s.exists()) return code;
  }
  throw new Error("Could not make a unique code. Try again.");
}

async function openClass(c) {
  S.cid = c.id;
  S.cls = c;
  S.fromPrincipal = true;
  await loadClassData();
  showClass("marks");
}

async function loadSchoolData(force) {
  await Promise.all(S.classes.map(async (c) => {
    if (force || !S.cache[c.id]) S.cache[c.id] = await fetchClassData(S.sid, c.id);
  }));
}

function principalBest(box) {
  bestSchoolTab(box, { S, put, termOptions, TERM_NAMES, loadSchoolData }).catch((e) => put(box, el("p", { class: "note" }, e.message)));
}

function principalFees(box) {
  feesTab(box, {
    S, db, field, put, business, loadSchoolData, showPrincipal,
    fs: { doc, getDocs, setDoc, updateDoc, collection },
  }).catch((e) => put(box, el("p", { class: "note" }, e.message)));
}

async function principalProgress(box) {
  put(box, el("p", { class: "muted" }, "Loading…"));
  await loadSchoolData(false);
  const draw = () => {
    const rows = S.classes.map((c) => {
      const d = S.cache[c.id];
      return { c, ...completion({ pupils: d.pupils, marksByPupil: d.marks, subjects: c.subjects || [], term: S.term, seq: S.seq }) };
    });
    const done = rows.filter((r) => r.status === "done").length;
    const refresh = el("button", { class: "btn alt sm" }, "Refresh");
    refresh.onclick = async () => { refresh.disabled = true; await loadSchoolData(true); draw(); };
    put(box, 
      el("div", { class: "card" },
        el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; draw(); }), select(seqOptions, S.seq, (v) => { S.seq = +v; draw(); }), refresh),
        el("p", {}, el("b", {}, `${done} of ${rows.length} classes`), " have finished entering marks.")),
      rows.length ? rows.map((r) => el("div", { class: "card" },
        el("div", { class: "row" }, el("b", { style: "flex:1" }, r.c.name), el("span", { class: `pill ${r.status === "done" ? "ok" : r.status === "in progress" ? "warn" : "bad"}` }, r.status)),
        el("div", { class: `bar ${r.status === "done" ? "done" : ""}` }, el("i", { style: `width:${r.pct}%` })),
        el("p", { class: "muted" }, `${r.pupilsDone} of ${r.pupils} pupils complete · ${r.filled}/${r.total} marks entered (${r.pct}%)`),
        el("button", { class: "btn alt sm", onclick: () => openClass(r.c) }, "Open class")))
        : el("p", { class: "muted" }, "No classes yet.")
    );
  };
  draw();
}

async function principalWeak(box) {
  put(box, el("p", { class: "muted" }, "Loading…"));
  await loadSchoolData(false);
  const draw = () => {
    const parts = S.classes.map((c) => {
      const d = S.cache[c.id];
      const res = computeTerm({ pupils: d.pupils, marksByPupil: d.marks, subjects: c.subjects || [], term: S.term });
      const w = weakest(res.subjectAvgs, 3);
      return el("div", { class: "card" },
        el("h3", {}, c.name),
        w.length
          ? [el("p", {}, el("b", {}, `Weakest in ${w[0].name}`), `, average ${w[0].avg}/20`),
             el("table", { class: "grid" }, el("tr", {}, el("th", {}, "Weakest subjects"), el("th", {}, "Class average /20")),
               w.map((s) => el("tr", {}, el("td", {}, s.name), el("td", {}, el("span", { class: `pill ${s.avg < 10 ? "bad" : s.avg < 12 ? "warn" : "ok"}` }, String(s.avg))))))]
          : el("p", { class: "muted" }, "No marks entered yet for this term."));
    });
    put(box, 
      el("div", { class: "card" }, el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; draw(); }),
        el("button", { class: "btn alt sm", onclick: async () => { await loadSchoolData(true); draw(); } }, "Refresh")),
        el("p", { class: "muted" }, "Class average per subject for the whole term (Seq 1 and Seq 2 together). Lowest first.")),
      parts.length ? parts : el("p", { class: "muted" }, "No classes yet.")
    );
  };
  draw();
}

function principalSetup(box) {
  const wa = el("input", { type: "tel", placeholder: "e.g. 677098735", value: S.school.principalWhatsApp || "" });
  const year = el("input", { placeholder: "2026/2027", value: S.school.year || defaultYear() });
  const imgs = { stamp: S.school.stamp || "", signature: S.school.signature || "" };
  const imgPicker = (key, label, help) => {
    const prev = el("div", { class: "imgprev" });
    const draw = () => put(prev, imgs[key] ? el("img", { src: imgs[key], alt: label, style: "max-height:80px;max-width:200px;border:1px dashed #999;background:#fff" }) : el("span", { class: "muted" }, "None yet"));
    const file = el("input", { type: "file", accept: "image/*" });
    file.addEventListener("change", async () => {
      if (!file.files[0]) return;
      try { imgs[key] = await imageToDataUrl(file.files[0], key === "stamp" ? 300 : 360); draw(); toast("Picture ready. Tap Save below."); } catch (e) { toast(e.message); }
    });
    draw();
    return el("div", { class: "f" }, el("b", {}, label), el("p", { class: "muted" }, help), prev, file,
      el("button", { class: "btn alt sm", onclick: () => { imgs[key] = ""; draw(); } }, "Remove"));
  };
  const save = el("button", { class: "btn" }, "Save");
  save.onclick = async () => {
    save.disabled = true;
    try {
      const patch = { principalWhatsApp: wa.value.trim(), year: year.value.trim(), stamp: imgs.stamp, signature: imgs.signature };
      const b = writeBatch(db);
      b.update(doc(db, "schools", S.sid), patch);
      S.classes.forEach((c) => b.update(doc(db, "schools", S.sid, "classes", c.id), patch));
      await b.commit();
      Object.assign(S.school, patch);
      await loadClasses();
      toast("Saved.");
    } catch (e) { toast(e.message); }
    save.disabled = false;
  };
  put(box, 
    el("div", { class: "card" }, el("h3", {}, "School setup"),
      el("p", {}, "School name: ", el("b", {}, S.school.name), el("span", { class: "muted" }, " (fixed; printed on every card)")),
      field("Principal's WhatsApp number (teachers send finished report cards here)", wa),
      field("Academic year", year),
      imgPicker("stamp", "School stamp", "Take a photo of your stamp on white paper (or a scan). It prints on every report card and receipt."),
      imgPicker("signature", "Principal's signature", "Sign on white paper and take a photo. It prints above \"Principal\" on the cards."),
      el("div", { class: "row" }, save)),
    el("div", { class: "card" }, el("h3", {}, "Subscription"),
      el("p", {}, "Valid until ", el("b", {}, fmtDate(toDate(S.school.expiry))), schoolExpired() ? " (expired)" : ""),
      el("p", { class: "muted" }, `To renew, contact ${business.name} on ${business.phone}.`))
  );
}

/* ---------- TEACHER boot ---------- */
async function bootTeacher() {
  const saved = JSON.parse(localStorage.getItem("rc_class") || "null");
  if (!saved) return showTeacherCode();
  try {
    const cs = await getDoc(doc(db, "schools", saved.sid, "classes", saved.cid));
    if (!cs.exists()) throw new Error("gone");
    S.role = "teacher";
    S.sid = saved.sid;
    S.cid = saved.cid;
    S.cls = { id: cs.id, ...cs.data() };
    S.fromPrincipal = false;
    await loadClassData();
    showClass("marks");
  } catch (e) {
    localStorage.removeItem("rc_class");
    showTeacherCode("Your access has ended or the code was changed. Enter the current class code from your principal.");
  }
}

/* ---------- CLASS (teacher and principal) ---------- */
async function loadClassData() {
  const d = await fetchClassData(S.sid, S.cid);
  S.pupils = d.pupils;
  S.marks = d.marks;
}

const classRef = (...p) => doc(db, "schools", S.sid, "classes", S.cid, ...p);

function showClass(tab = "marks") {
  stopScan();
  const content = el("div", { class: "wrap" });
  const back = S.fromPrincipal
    ? el("button", { onclick: () => showPrincipal("classes") }, "Back")
    : logoutBtn();
  mount(
    topBar(S.cls.name, `${S.cls.schoolName || ""} · ${S.cls.year || ""}`, back),
    tabBar([["marks", "Broadsheet"], ["scan", "Smart scan"], ["cards", "Report cards"], ["best", "Best pupils"], ["pupils", "Pupils"]], tab, (k) => showClass(k)),
    content,
    footer()
  );
  ({ marks: broadsheetTab, scan: scanTab, cards: cardsTab, best: (b) => bestClassTab(b, { S, put, termOptions, TERM_NAMES }), pupils: pupilsTab })[tab](content);
}

async function saveMark(pid, key, val) {
  const m = S.marks[pid] || (S.marks[pid] = {});
  if (val == null) {
    delete m[key];
    await setDoc(classRef("marks", pid), { m: { [key]: deleteField() } }, { merge: true });
  } else {
    m[key] = val;
    await setDoc(classRef("marks", pid), { m: { [key]: val } }, { merge: true });
  }
}

function parseMark(text) {
  const t = String(text).trim().replace(",", ".");
  if (t === "") return { empty: true };
  const n = Number(t);
  if (Number.isNaN(n) || n < 0 || n > 20) return { error: true };
  return { value: Math.round(n * 100) / 100 };
}

function termSeqPickers(redraw) {
  return el("div", { class: "row" },
    select(termOptions, S.term, (v) => { S.term = +v; redraw(); }),
    select(seqOptions, S.seq, (v) => { S.seq = +v; if (S.bview !== "term") S.bview = S.seq; redraw(); }));
}

/* Broadsheet: the sheet that fills the report cards automatically */
let blankMode = false;

function printLandscape(after) {
  const st = el("style", {}, "@page{size:landscape;margin:8mm}");
  document.head.append(st);
  const done = () => { st.remove(); window.removeEventListener("afterprint", done); if (after) after(); };
  window.addEventListener("afterprint", done);
  window.print();
}

function broadsheetTab(box) {
  const subjects = S.cls.subjects || [];
  if (!S.pupils.length) {
    return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils first (Pupils tab)."), el("button", { class: "btn", onclick: () => showClass("pupils") }, "Go to Pupils")));
  }
  const isTerm = S.bview === "term";
  if (!isTerm) S.seq = S.bview;
  const seqs = isTerm ? [1, 2] : [S.bview];
  const calc = (sq) => computeTerm({ pupils: S.pupils, marksByPupil: S.marks, subjects, term: S.term, seqs: sq });
  const fmt = (n) => (n == null ? "" : String(Number(n.toFixed(2))));
  const nCols = subjects.length;
  const refs = { rows: {}, foot: {} };
  const grid = [];

  const head = el("tr", {}, el("th", {}, "#"), el("th", {}, "Pupil"),
    subjects.map((s) => el("th", {}, s.name, el("br"), el("small", {}, `coef ${s.coef}`))),
    el("th", {}, "Total"), el("th", {}, "Avg /20"), el("th", {}, "Rank"), isTerm ? el("th", {}, "Grade") : null);

  const body = S.pupils.map((p, r) => {
    const c = { subs: [], total: el("td", { class: "n" }), avg: el("td", { class: "n" }), rank: el("td", { class: "n" }), grade: el("td", { class: "n" }) };
    const tds = subjects.map((s, i) => {
      if (isTerm || blankMode) { const td = el("td", { class: "n" }); c.subs[i] = td; return td; }
      const mk = subjKey(S.term, S.bview, s, i);
      const cur = (S.marks[p.id] || {})[mk];
      const inp = el("input", { type: "text", inputmode: "decimal", value: cur == null ? "" : String(cur), "aria-label": `${p.name} ${s.name}` });
      (grid[r] = grid[r] || [])[i] = inp;
      inp.addEventListener("change", async () => {
        const v = parseMark(inp.value);
        const before = (S.marks[p.id] || {})[mk];
        if (v.error) { toast("Marks are numbers from 0 to 20."); inp.value = before == null ? "" : String(before); return; }
        try {
          await saveMark(p.id, mk, v.empty ? null : v.value);
          inp.classList.add("saved");
          setTimeout(() => inp.classList.remove("saved"), 600);
          refresh();
        } catch (e) { toast("Not saved: " + e.message); }
      });
      // Enter moves down to the next pupil in the same subject (fast entry down a column)
      inp.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const next = grid[r + 1] && grid[r + 1][i];
        if (next) { next.focus(); next.select(); } else inp.blur();
      });
      c.subs[i] = inp;
      return el("td", {}, inp);
    });
    refs.rows[p.id] = c;
    return el("tr", {}, el("td", {}, r + 1), el("td", { class: "n" }, p.name), tds, c.total, c.avg, c.rank, isTerm ? c.grade : null);
  });

  const footLabels = ["Class average", "Highest", "Lowest", "Pass % (10+)"];
  const foot = blankMode ? [] : footLabels.map((label) => {
    const cells = subjects.map(() => el("td", { class: "n" }));
    const overall = el("td", { class: "n", colspan: String(isTerm ? 4 : 3) });
    refs.foot[label] = { cells, overall };
    return el("tr", { class: "footrow" }, el("td", { colspan: "2" }, label), cells, overall);
  });

  const status = el("span", { class: "pill" });
  function refresh() {
    const res = calc(seqs);
    const both = calc([1, 2]);
    const st = classStats(res);
    res.rows.forEach((row, r) => {
      const c = refs.rows[row.pupilId];
      if (blankMode) return;
      c.total.textContent = fmt(row.total);
      c.avg.textContent = fmt(row.studentAvg);
      c.rank.textContent = row.rank == null ? "" : String(row.rank);
      if (isTerm) {
        c.grade.textContent = row.grade ? `${row.grade.letter} (${row.grade.short})` : "";
        row.subjects.forEach((s, i) => (c.subs[i].textContent = fmt(s.avg)));
      } else {
        row.subjects.forEach((s, i) => {
          const gap = seqGap(both.rows[r].subjects[i]);
          const td = c.subs[i].parentElement;
          if (td) td.classList.toggle("flag", gap);
          c.subs[i].title = gap ? "Sequence 1 and 2 are far apart. Check this mark." : "";
        });
      }
    });
    if (!blankMode) {
      const put2 = (label, perSubject, total) => {
        refs.foot[label].cells.forEach((td, i) => (td.textContent = perSubject(st.subjects[i])));
        refs.foot[label].overall.textContent = total;
      };
      put2("Class average", (s) => fmt(s.avg), fmt(res.classAvg));
      put2("Highest", (s) => fmt(s.high), fmt(st.high));
      put2("Lowest", (s) => fmt(s.low), fmt(st.low));
      put2("Pass % (10+)", (s) => (s.passPct == null ? "" : s.passPct + "%"), st.passPct == null ? "" : st.passPct + "%");
    }
    if (!isTerm) {
      const comp = completion({ pupils: S.pupils, marksByPupil: S.marks, subjects, term: S.term, seq: S.bview });
      status.textContent = `${comp.pupilsDone}/${comp.pupils} pupils complete`;
      status.className = `pill ${comp.status === "done" ? "ok" : "warn"}`;
    } else {
      status.textContent = `${res.ranked}/${S.pupils.length} pupils ranked`;
    }
  }

  const viewSel = select([{ value: "1", label: "Sequence 1" }, { value: "2", label: "Sequence 2" }, { value: "term", label: "Term summary" }], String(S.bview),
    (v) => { S.bview = v === "term" ? "term" : +v; broadsheetTab(box); });
  const termSel = select(termOptions, S.term, (v) => { S.term = +v; broadsheetTab(box); });
  const pasteBox = el("div", {});
  const pasteBtn = el("button", { class: "btn alt sm", onclick: () => pasteBox.replaceChildren(...(pasteBox.childNodes.length ? [] : [buildPaste()])) }, "Paste marks");

  function buildPaste() {
    const sub = select(subjects.map((s, i) => ({ value: i, label: s.name })), 0);
    const ta = el("textarea", { placeholder: "Ada Ngwa 15\nBola Tabe 12.5\n\nor one mark per line in class-list order:\n15\n12.5" });
    const out = el("div", {});
    const save = el("button", { class: "btn", disabled: true }, "Save matched marks");
    let parsed = [];
    const check = el("button", { class: "btn alt sm" }, "Check");
    check.onclick = () => {
      parsed = parsePasted(ta.value, S.pupils);
      const label = (x) => (x.status === "ok" ? String(x.mark) : x.status === "ambiguous" ? "which pupil?" : x.status === "nomatch" ? "no match" : "bad mark");
      out.replaceChildren(el("table", { class: "grid" }, parsed.map((x) =>
        el("tr", {}, el("td", {}, x.line), el("td", {}, x.status === "ok" ? "→ " + x.name : ""), el("td", {}, el("span", { class: `pill ${x.status === "ok" ? "ok" : "bad"}` }, label(x)))))));
      save.disabled = !parsed.some((x) => x.status === "ok");
    };
    save.onclick = async () => {
      const si = +sub.value;
      const mk = subjKey(S.term, S.bview, subjects[si], si);
      const ok = parsed.filter((x) => x.status === "ok");
      save.disabled = true;
      try {
        for (const x of ok) await saveMark(x.pupilId, mk, x.mark);
        toast(`${ok.length} marks saved for ${subjects[si].name}.`);
        broadsheetTab(box);
      } catch (e) { toast(e.message); save.disabled = false; }
    };
    return el("div", { class: "card noprint" }, el("h3", {}, `Paste marks (Sequence ${S.bview})`),
      el("p", { class: "muted" }, "Paste from WhatsApp or a list. Check shows who each mark goes to before anything is saved."),
      field("Subject", sub), ta, el("div", { class: "row" }, check, save), out);
  }

  const title = `Broadsheet · ${S.cls.name} · ${S.cls.schoolName || ""} · ${TERM_NAMES[S.term]} · ${isTerm ? "Term summary" : "Sequence " + S.bview}${blankMode ? " · marks sheet" : ""}`;
  put(box,
    el("div", { class: "card noprint" },
      el("div", { class: "row" }, termSel, viewSel),
      el("div", { class: "row" },
        isTerm ? el("button", { class: "btn sm", onclick: () => showClass("cards") }, "Make report cards") : pasteBtn,
        el("button", { class: "btn alt sm", onclick: () => printLandscape() }, "Print"),
        isTerm ? null : el("button", { class: "btn alt sm", onclick: () => { blankMode = true; broadsheetTab(box); printLandscape(() => { blankMode = false; broadsheetTab(box); }); } }, "Print blank marks sheet")),
      el("p", { class: "muted" }, isTerm ? "Read-only. Averages of Seq 1 and Seq 2 by coefficient. The report cards are made from this." : "Marks out of 20 save as you type. Press Enter to go to the next pupil. A yellow cell means Seq 1 and Seq 2 are far apart: check it. ", status)),
    pasteBox,
    el("div", { class: "card scroll printable" }, el("h2", { class: "printtitle" }, title),
      el("table", { class: "grid bs" }, el("thead", {}, head), el("tbody", {}, body), el("tfoot", {}, foot))));
  refresh();
}

function scanTab(box) {
  smartScanTab(box, { S, subjKey, saveMark, parseMark, termSeqPickers, field, put });
}

/* Pupils */
function pupilsTab(box) {
  const draw = () => {
    const names = el("textarea", { placeholder: "Type or paste pupils' names, one per line" });
    const add = el("button", { class: "btn" }, "Add pupils");
    add.onclick = async () => {
      const list = names.value.split("\n").map((n) => n.trim()).filter(Boolean);
      if (!list.length) return;
      add.disabled = true;
      try {
        const b = writeBatch(db);
        list.forEach((n) => b.set(doc(collection(db, "schools", S.sid, "classes", S.cid, "pupils")), { name: n, createdAt: serverTimestamp() }));
        await b.commit();
        await loadClassData();
        draw();
        toast(`${list.length} pupil${list.length === 1 ? "" : "s"} added.`);
      } catch (e) { toast(e.message); add.disabled = false; }
    };
    const rows = S.pupils.map((p, i) => el("tr", {}, el("td", {}, i + 1), el("td", {}, p.name),
      el("td", {}, el("button", { class: "btn bad sm", onclick: async () => {
        if (!confirm(`Remove ${p.name} and all their marks?`)) return;
        try { await deleteDoc(classRef("pupils", p.id)); await deleteDoc(classRef("marks", p.id)); delete S.marks[p.id]; await loadClassData(); draw(); } catch (e) { toast(e.message); }
      } }, "Remove"))));
    put(box, 
      el("div", { class: "card" }, el("h3", {}, `Pupils (${S.pupils.length})`), names, el("div", { class: "row" }, add,
        S.pupils.length ? el("button", { class: "btn alt", onclick: () => labelsView(box) }, "QR labels") : null)),
      S.pupils.length ? el("div", { class: "card scroll" }, el("table", { class: "grid" }, rows)) : null
    );
  };
  draw();
}

function labelsView(box) {
  const labs = el("div", { class: "labels" }, S.pupils.map((p) => {
    const q = el("div", {});
    q.innerHTML = qrSvg(qrPayload(S.cid, p.id), 96); // the markup holds only numbers
    return el("div", { class: "qrl" }, q, el("div", {}, el("b", {}, p.name), el("div", { class: "muted" }, `${S.cls.name} · ${S.cls.schoolName || ""}`)));
  }));
  put(box,
    el("div", { class: "card noprint" }, el("h3", {}, "QR labels"),
      el("p", { class: "muted" }, "Print, cut out, and stick one on each pupil's marks sheet or script. In Smart scan, point the camera at it to open that pupil."),
      el("div", { class: "row" }, el("button", { class: "btn", onclick: () => window.print() }, "Print labels"), el("button", { class: "btn alt", onclick: () => pupilsTab(box) }, "Back"))),
    labs);
}

/* Report cards */
function cardsTab(box) {
  const subjects = S.cls.subjects || [];
  const prefs = JSON.parse(localStorage.getItem("rc_cardprefs") || '{"w":190,"f":11}');
  const save = () => localStorage.setItem("rc_cardprefs", JSON.stringify(prefs));
  let only = "all";

  const draw = () => {
    if (!S.pupils.length) return put(box, el("div", { class: "card" }, el("p", {}, "Add your pupils and enter marks first.")));
    const seqs = [1, 2];
    const res = computeTerm({ pupils: S.pupils, marksByPupil: S.marks, subjects, term: S.term, seqs });
    const classSubjectAvgs = res.subjectAvgs.map((s) => s.avg);
    const rows = only === "all" ? res.rows : res.rows.filter((r) => r.pupilId === only);
    const lang = prefs.lang === "en" || prefs.lang === "fr" ? prefs.lang : (S.cls.section === "Francophone" ? "fr" : "en");
    const teacherSign = localStorage.getItem("rc_tsign_" + S.cid) || "";
    const area = el("div", { class: "cards-area", style: `--cw:${prefs.w}mm;--cf:${prefs.f}px` },
      rows.map((row) => renderCard({
        schoolName: S.cls.schoolName, className: S.cls.name, section: S.cls.section, year: S.cls.year, term: S.term,
        row, classAvg: res.classAvg, classSubjectAvgs, count: S.pupils.length, seqs, business, remark: prefs.remarks === false ? "" : autoRemark(row, lang),
        lang, stamp: S.cls.stamp, signature: S.cls.signature, teacherSign,
      })));

    const w = el("input", { type: "number", min: "90", max: "210", value: String(prefs.w) });
    const f = el("input", { type: "number", min: "7", max: "16", value: String(prefs.f) });
    const apply = () => { prefs.w = Math.max(90, Math.min(210, +w.value || 190)); prefs.f = Math.max(7, Math.min(16, +f.value || 11)); localStorage.setItem("rc_cardprefs", JSON.stringify(prefs)); area.style.setProperty("--cw", prefs.w + "mm"); area.style.setProperty("--cf", prefs.f + "px"); };
    const remarkBox = el("input", { type: "checkbox" });
    remarkBox.checked = prefs.remarks !== false;
    remarkBox.addEventListener("change", () => { prefs.remarks = remarkBox.checked; save(); draw(); });
    w.addEventListener("change", apply);
    f.addEventListener("change", apply);

    const langSel = select([{ value: "auto", label: "Language: automatic (by section)" }, { value: "en", label: "Language: English" }, { value: "fr", label: "Langue : Français" }], prefs.lang || "auto", (v) => { prefs.lang = v === "auto" ? undefined : v; save(); draw(); });
    const signFile = el("input", { type: "file", accept: "image/*" });
    signFile.addEventListener("change", async () => {
      if (!signFile.files[0]) return;
      try { localStorage.setItem("rc_tsign_" + S.cid, await imageToDataUrl(signFile.files[0], 360)); toast("Your signature is saved on this phone."); draw(); } catch (e) { toast(e.message); }
    });
    const fileName = () => `${S.cls.name}-${TERM_NAMES[S.term].toLowerCase().replace(/\s+/g, "-")}-report-cards.html`.replace(/\s+/g, "-");
    const html = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${S.cls.name} report cards</title><style>body{margin:0;padding:8px;background:#fff}${CARD_CSS}@media print{@page{margin:6mm}.rc{margin:0 auto}}</style></head><body style="--cw:${prefs.w}mm;--cf:${prefs.f}px">${area.innerHTML}</body></html>`;

    const sendWa = () => {
      const num = waNumber(S.cls.principalWhatsApp);
      if (!num) return toast("The principal's WhatsApp number is not set yet. Ask the principal to add it under Setup.");
      download(fileName(), html());
      const msg = encodeURIComponent(`${S.cls.schoolName}\n${S.cls.name} – ${TERM_NAMES[S.term]} report cards (file attached).`);
      window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
      toast("File saved. In WhatsApp tap the paperclip, choose Document, and pick the saved file.", 7000);
    };
    const share = async () => {
      const file = new File([html()], fileName(), { type: "text/html" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${S.cls.name} report cards` }); } catch (e) { /* cancelled */ }
      } else toast("Sharing files is not supported on this device. Use 'Send to principal'.");
    };

    put(box, 
      el("div", { class: "card noprint" },
        el("div", { class: "row" }, select(termOptions, S.term, (v) => { S.term = +v; draw(); }),
          select([{ value: "all", label: "All pupils" }, ...S.pupils.map((p) => ({ value: p.id, label: p.name }))], only, (v) => { only = v; draw(); })),
        el("div", { class: "row" }, el("button", { class: "btn", onclick: () => window.print() }, "Print / Save as PDF"),
          el("button", { class: "btn alt", onclick: sendWa }, "Send to principal (WhatsApp)"),
          el("button", { class: "btn alt", onclick: share }, "Share file…")),
        el("div", { class: "row" }, field("Card width (mm)", w), field("Text size (px)", f)),
        el("label", { class: "f" }, remarkBox, " Show an automatic class teacher's remark"),
        el("div", { class: "row" }, langSel),
        el("details", {}, el("summary", { class: "muted" }, teacherSign ? "Class teacher's signature (saved)" : "Add the class teacher's signature"), el("p", { class: "muted" }, "Sign on white paper, take a photo, choose it here. It stays on this phone and prints above \"Class teacher\"."), signFile,
          teacherSign ? el("button", { class: "btn alt sm", onclick: () => { localStorage.removeItem("rc_tsign_" + S.cid); draw(); } }, "Remove signature") : null),
        el("p", { class: "muted" }, `${res.ranked} of ${S.pupils.length} pupils have marks. Class average: ${res.classAvg ?? "–"}/20. Print one term at a time to glue into the booklet.`)),
      area
    );
  };
  draw();
}

start();
