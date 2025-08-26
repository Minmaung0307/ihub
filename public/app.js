import { APP_CONFIG } from "./firebase-config.js";

// Firebase v10 modular imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, // use this to enable long polling (fixes QUIC / WebChannel issues)
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(APP_CONFIG.FIREBASE_CONFIG);

// IMPORTANT: This avoids the QUIC/WebChannel spam you saw in console.
// It switches to long-polling automatically when needed.
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });

const auth = getAuth(app);

// ---------- DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const fmt = (t) => new Date(t?.seconds ? t.seconds * 1000 : t).toLocaleString();

// ---------- Global state ----------
let state = {
  user: null,
  role: "guest", // guest | student | admin
  courses: [],
  users: [],
  quizBank: {}, // courseId -> questions
};

// ---------- Router ----------
window.addEventListener("hashchange", route);
function route(){
  const r = (location.hash.replace(/^#\//,'') || "dashboard").split("/")[0];
  setActiveNav(r);
  showPage(r);
}
function setActiveNav(r){
  $$(".navlink").forEach(a => a.classList.toggle("active", a.dataset.route === r));
}
function showPage(r){
  $$(".page").forEach(p => p.classList.add("hidden"));
  switch(r){
    case "dashboard": $("#page-dashboard").classList.remove("hidden"); break;
    case "courses": $("#page-courses").classList.remove("hidden"); break;
    case "course":
      $("#page-course-detail").classList.remove("hidden"); break;
    case "profile": $("#page-profile").classList.remove("hidden"); break;
    case "admin":
      if (state.role === "admin") $("#page-admin").classList.remove("hidden");
      else location.hash = "#/dashboard";
      break;
    default: $("#page-dashboard").classList.remove("hidden");
  }
}

// ---------- Auth UI ----------
$("#btn-login").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  const pass = $("#auth-pass").value;
  if (!email || !pass) return alert("Enter email and password.");
  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){ alert(e.message); }
});
$("#btn-register").addEventListener("click", async () => {
  const email = $("#auth-email").value.trim();
  const pass = $("#auth-pass").value;
  if (!email || !pass) return alert("Enter email and password.");
  try{
    const { user } = await createUserWithEmailAndPassword(auth, email, pass);
    await ensureUserDoc(user);
  }catch(e){ alert(e.message); }
});
$("#btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  $("#btn-logout").classList.toggle("hidden", !user);
  if (!user) {
    $("#auth-state").textContent = "Not signed in";
    $("#page-auth").classList.remove("hidden");
    $("#page-dashboard").classList.add("hidden");
    $("#admin-block").classList.add("hidden");
    state.role = "guest";
    return;
  }

  $("#page-auth").classList.add("hidden");
  $("#auth-state").textContent = `${user.email}`;
  await ensureUserDoc(user);
  await refreshRoleAndSidebar(user);
  route(); // ensure correct page

  // initial loads
  loadAnnouncements();
  loadCourses();
  if (state.role === "admin") {
    loadUsersForAdmin();
    loadCoursesForAdmin();
  }
});

// create profile/role doc on first login
async function ensureUserDoc(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    const isAdmin = APP_CONFIG.ADMIN_EMAILS.includes((user.email||"").toLowerCase());
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split("@")[0],
      bio: "",
      url: "",
      role: isAdmin ? "admin" : "student",
      createdAt: serverTimestamp()
    });
    // set displayName so profile shows something nice
    if (!user.displayName) {
      try { await updateProfile(user, { displayName: user.email.split("@")[0] }); } catch {}
    }
  }
}

async function refreshRoleAndSidebar(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const role = snap.exists() ? snap.data().role : "student";
  state.role = role;
  $("#admin-block").classList.toggle("hidden", role !== "admin");
  // show "New Announcement" only for admin
  $("#btn-new-ann").classList.toggle("hidden", role !== "admin");
}

// ---------- Dashboard (Announcements) ----------
$("#btn-new-ann").addEventListener("click", async () => {
  const title = prompt("Announcement title:");
  if (!title) return;
  await addDoc(collection(db, "announcements"), {
    title, author: state.user.email, createdAt: serverTimestamp()
  });
});
function loadAnnouncements(){
  const qy = query(collection(db,"announcements"), orderBy("createdAt","desc"), limit(25));
  onSnapshot(qy, (snap)=>{
    const box = $("#ann-list"); box.innerHTML = "";
    if (snap.empty) { box.append(el("div","muted","No announcements yet.")); return;}
    snap.forEach(docu=>{
      const a = docu.data();
      const row = el("div","ann-item");
      row.append(
        el("div","", `<div class="ann-title">${escapeHtml(a.title)}</div><div class="ann-meta">${escapeHtml(a.author||"")} • ${a.createdAt?fmt(a.createdAt):""}</div>`)
      );
      if (state.role === "admin"){
        const rm = el("button","btn btn-outline btn-danger","Delete");
        rm.addEventListener("click", ()=> deleteDoc(doc(db,"announcements",docu.id)));
        const right = el("div","row"); right.append(rm); row.append(right);
      }
      box.append(row);
    });
  });
}

// ---------- Courses (grid) ----------
async function loadCourses(){
  const qy = query(collection(db,"courses"), orderBy("title","asc"));
  onSnapshot(qy, async (snap)=>{
    state.courses = snap.docs.map(d=>({id:d.id, ...d.data()}));
    $("#course-count").textContent = `${state.courses.length} course${state.courses.length===1?"":"s"}`;
    renderCourseGrid();
    if (state.courses.length === 0 && state.role === "admin"){
      // Seed demo data (Cat course) so you can see everything immediately
      await seedDemoCourse();
    }
  });
}
function renderCourseGrid(){
  const grid = $("#course-grid"); grid.className = "grid grid-cards"; grid.innerHTML = "";
  state.courses.forEach(c=>{
    const card = el("div","course-card");
    // fixed media area, full image visible (object-fit: contain)
    const media = el("div","card-media");
    const img = new Image(); img.src = c.image || "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1200&q=80";
    img.alt = c.title||"";
    media.append(img);
    const body = el("div","card-body");
    const desc = c.desc || "";
    body.innerHTML = `
      <div class="card-title">${escapeHtml(c.title||"Untitled")}</div>
      <div class="card-desc clamp-2">${escapeHtml(desc)}</div>
      <div class="row">
        <span class="badge">${c.price>0 ? `$${Number(c.price).toFixed(2)}` : "Free"}</span>
        <span class="badge">${Number(c.credits||0)} credit(s)</span>
      </div>
    `;
    const actions = el("div","card-actions");
    const btnDetail = el("button","btn btn-light","Details");
    btnDetail.addEventListener("click", ()=> openCourseDetail(c.id));
    actions.append(btnDetail);

    if (state.role === "admin"){
      const btnEdit = el("button","btn btn-outline","Edit");
      const btnDel  = el("button","btn btn-outline btn-danger","Delete");
      btnEdit.addEventListener("click", ()=> prefillCourseForm(c));
      btnDel.addEventListener("click", async ()=>{
        if (confirm("Delete this course?")) await deleteDoc(doc(db,"courses",c.id));
      });
      actions.append(btnEdit, btnDel);
    }
    body.append(actions);
    card.append(media, body);
    grid.append(card);
  });
}

// open detail page
async function openCourseDetail(courseId){
  location.hash = "#/course/"+courseId;
  const dwrap = $("#course-detail"); dwrap.innerHTML = "Loading…";
  const ref = doc(db,"courses",courseId); const snap = await getDoc(ref);
  if (!snap.exists()){ dwrap.textContent="Course not found."; return; }
  const c = { id: snap.id, ...snap.data() };

  const hero = el("div","detail-hero");
  const left = el("div","hero-img"); const img = new Image();
  img.src = c.image; img.alt = c.title; img.loading = "lazy"; left.append(img);
  const right = el("div","card");
  right.innerHTML = `
    <h2>${escapeHtml(c.title)}</h2>
    <div class="muted">${Number(c.credits||0)} credit(s) • ${c.price>0?`$${Number(c.price).toFixed(2)}`:"Free"}</div>
    <p style="white-space:pre-wrap">${escapeHtml(c.desc||"")}</p>
  `;
  const actions = el("div","row");
  const startBtn = el("button","btn btn-ok", c.price>0 ? "Enroll & Pay" : "Enroll");
  startBtn.addEventListener("click", ()=> enrollFlow(c));
  actions.append(startBtn);

  // Quiz & Certificate controls (always visible; will enforce payment/enrollment inside handlers)
  const quizBtn = el("button","btn btn-outline","Take Quiz");
  quizBtn.addEventListener("click", ()=> startQuiz(c));
  const certBtn = el("button","btn btn-outline","Get Certificate");
  certBtn.addEventListener("click", ()=> generateCertificate(c));
  actions.append(quizBtn, certBtn);

  if (state.role === "admin"){
    const editBtn = el("button","btn btn-outline","Edit");
    editBtn.addEventListener("click", ()=> prefillCourseForm(c));
    actions.append(editBtn);
  }
  right.append(actions);

  hero.append(left,right);
  dwrap.innerHTML = "";
  dwrap.append(hero);
}

// ---------- Payments (PayPal quick stub) ----------
async function enrollFlow(course){
  // If free: enroll immediately
  if (!(course.price>0)) { await recordEnrollment(course, "free"); alert("Enrolled!"); return; }

  // paid: show PayPal smart button
  const wrap = el("div","card mt");
  wrap.innerHTML = `<h3>Checkout</h3><div id="paypal-container"></div>`;
  $("#course-detail").append(wrap);

  // load SDK once
  if (!window.paypal){
    await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(APP_CONFIG.PAYPAL_CLIENT_ID)}&currency=${APP_CONFIG.PAYPAL_CURRENCY}`);
  }
  if (!window.paypal) { alert("PayPal SDK failed to load."); return; }

  window.paypal.Buttons({
    createOrder: (data, actions) => actions.order.create({
      purchase_units: [{ amount: { value: String(Number(course.price).toFixed(2)) }, description: course.title }]
    }),
    onApprove: async (data, actions) => {
      await actions.order.capture();
      await recordEnrollment(course, "paypal");
      alert("Payment success! You are enrolled.");
    },
    onError: (err) => alert("Payment error: " + err?.message)
  }).render("#paypal-container");
}
async function recordEnrollment(course, method){
  if (!state.user) return alert("Sign in first.");
  await setDoc(doc(db,"enrollments", `${state.user.uid}_${course.id}`), {
    uid: state.user.uid, courseId: course.id, method, paid: method!=="free",
    price: Number(course.price||0), createdAt: serverTimestamp()
  });
}

// ---------- Quizzes / Exams (simple scaffold) ----------
async function startQuiz(course){
  if (!state.user) return alert("Sign in first.");
  // optional: ensure enrolled if course is paid
  if (course.price>0){
    const enrId = `${state.user.uid}_${course.id}`;
    const enrSnap = await getDoc(doc(db,"enrollments",enrId));
    if (!enrSnap.exists()) return alert("Please enroll first.");
  }
  const questions = await getSampleQuestions(course.id);
  let score = 0;
  for (const q of questions){
    const ans = prompt(`${q.q}\n${q.choices.map((c,i)=>`${i+1}. ${c}`).join("\n")}\n\nEnter number:`);
    if (!ans) continue;
    if (q.correctIndex === (parseInt(ans,10)-1)) score++;
  }
  const pct = Math.round((score / questions.length) * 100);
  await addDoc(collection(db,"results"), {
    uid: state.user.uid, courseId: course.id, score: pct, createdAt: serverTimestamp()
  });
  alert(`Your score: ${pct}% (${score}/${questions.length}) — ${pct>=APP_CONFIG.PASSING_SCORE?"PASS ✅":"FAIL ❌"}`);
}
async function getSampleQuestions(courseId){
  if (!state.quizBank[courseId]){
    state.quizBank[courseId] = [
      { q: "Cats are:", choices:["Reptiles","Mammals","Birds","Fish"], correctIndex: 1 },
      { q: "object-fit to show full image:", choices:["cover","contain","fill","none"], correctIndex: 1 },
      { q: "Credits represent:", choices:["Price","Difficulty","Academic value","Image size"], correctIndex: 2 },
    ];
  }
  return state.quizBank[courseId];
}

// ---------- Certificates (PDF quick stub) ----------
async function generateCertificate(course){
  if (!state.user) return alert("Sign in first.");
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF({ orientation:"landscape" });
  docPdf.setFillColor(240, 244, 255); docPdf.rect(0,0,297,210,"F");
  docPdf.setTextColor(20,20,40);
  docPdf.setFontSize(28); docPdf.text("Certificate of Completion", 148, 50, { align:"center" });
  docPdf.setFontSize(16); docPdf.text(`This certifies that`, 148, 70, { align:"center" });
  docPdf.setFontSize(22); docPdf.text(state.user.email || "", 148, 85, { align:"center" });
  docPdf.setFontSize(16); docPdf.text(`has successfully completed`, 148, 100, { align:"center" });
  docPdf.setFontSize(20); docPdf.text(`${course.title}`, 148, 115, { align:"center" });
  docPdf.setFontSize(14); docPdf.text(`Credits: ${Number(course.credits||0)} • Date: ${new Date().toLocaleDateString()}`, 148, 130, { align:"center" });
  docPdf.save(`Certificate-${slug(course.title)}.pdf`);
}

// ---------- Profile ----------
$("#btn-save-profile").addEventListener("click", async ()=>{
  if (!state.user) return;
  const ref = doc(db,"users",state.user.uid);
  await updateDoc(ref, {
    displayName: $("#prof-name").value.trim(),
    bio: $("#prof-bio").value,
    url: $("#prof-url").value.trim()
  });
  alert("Profile saved.");
  loadProfile();
});
$("#btn-view-card").addEventListener("click", async ()=>{
  if (!state.user) return;
  const ref = doc(db,"users",state.user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const u = snap.data();
  const card = el("div","course-card");
  const media = el("div","card-media");
  const img = new Image();
  img.src = "https://images.unsplash.com/photo-1520975682031-a1e9c00c6022?w=1200&q=80";
  img.alt = "Profile card"; media.append(img);
  const body = el("div","card-body");
  body.innerHTML = `
    <div class="card-title">${escapeHtml(u.displayName||"")}</div>
    <div style="white-space:pre-wrap">${escapeHtml(u.bio||"")}</div>
  `;
  const actions = el("div","card-actions");
  if (u.url){
    const a = el("a","btn btn-light","Open Link");
    a.href = u.url; a.target = "_blank"; a.rel = "noopener";
    actions.append(a);
  }
  body.append(actions);
  card.append(media, body);
  const box = $("#profile-card-preview"); box.innerHTML = ""; box.append(card);
});
async function loadProfile(){
  if (!state.user) return;
  const ref = doc(db,"users",state.user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const u = snap.data();
  $("#profile-info").innerHTML = `
    <div><b>Email:</b> ${escapeHtml(u.email||"")}</div>
    <div><b>Role:</b> ${escapeHtml(u.role||"student")}</div>
    <div><b>Joined:</b> ${u.createdAt?fmt(u.createdAt):""}</div>
  `;
  $("#prof-name").value = u.displayName||"";
  $("#prof-bio").value = u.bio||"";
  $("#prof-url").value = u.url||"";
}

// ---------- Admin: Users & Courses ----------
async function loadUsersForAdmin(){
  const qy = query(collection(db,"users"), orderBy("createdAt","desc"));
  onSnapshot(qy, (snap)=>{
    const box = $("#admin-users"); box.innerHTML = "";
    snap.forEach(d=>{
      const u = d.data();
      const row = el("div","ann-item");
      row.append(el("div","", `<div><b>${escapeHtml(u.displayName||u.email)}</b></div><div class="ann-meta">${escapeHtml(u.email)}</div>`));
      const sel = el("select",""); ["student","admin"].forEach(r=>{
        const op = el("option","",r); op.value=r; if ((u.role||"student")===r) op.selected=true; sel.append(op);
      });
      sel.addEventListener("change", async ()=>{
        await updateDoc(doc(db,"users",u.uid), { role: sel.value });
        if (u.uid === state.user?.uid) { // if you changed your own role, update sidebar
          await refreshRoleAndSidebar(state.user);
          route();
        }
      });
      row.append(sel);
      box.append(row);
    });
  });
}
function prefillCourseForm(c){
  $("#c-title").value = c.title||"";
  $("#c-image").value = c.image||"";
  $("#c-desc").value  = c.desc||"";
  $("#c-price").value = Number(c.price||0);
  $("#c-credits").value = Number(c.credits||0);
  $("#btn-save-course").dataset.editId = c.id;
  window.scrollTo({top:0,behavior:"smooth"});
}
$("#btn-save-course").addEventListener("click", async ()=>{
  if (state.role!=="admin") return alert("Admins only.");
  const payload = {
    title: $("#c-title").value.trim(),
    image: $("#c-image").value.trim(),
    desc:  $("#c-desc").value.trim(),
    price: Number($("#c-price").value||0),
    credits: Number($("#c-credits").value||0),
    updatedAt: serverTimestamp()
  };
  if (!payload.title) return alert("Title is required.");
  const editId = $("#btn-save-course").dataset.editId;
  if (editId){
    await updateDoc(doc(db,"courses",editId), payload);
    $("#btn-save-course").dataset.editId = "";
  }else{
    payload.createdAt = serverTimestamp();
    await addDoc(collection(db,"courses"), payload);
  }
  clearCourseForm();
});
function clearCourseForm(){
  $("#c-title").value = $("#c-image").value = $("#c-desc").value = "";
  $("#c-price").value = 0; $("#c-credits").value = 0;
}
function loadCoursesForAdmin(){
  const qy = query(collection(db,"courses"), orderBy("title","asc"));
  onSnapshot(qy, (snap)=>{
    const box = $("#admin-courses"); box.innerHTML = "";
    snap.forEach(d=>{
      const c = {id:d.id, ...d.data()};
      const row = el("div","ann-item");
      row.append(el("div","", `<div><b>${escapeHtml(c.title)}</b></div><div class="ann-meta">${c.price>0?`$${Number(c.price).toFixed(2)}`:"Free"} • ${Number(c.credits||0)} credit(s)</div>`));
      const actions = el("div","row");
      const ed = el("button","btn btn-outline","Edit"); ed.onclick=()=>prefillCourseForm(c);
      const rm = el("button","btn btn-outline btn-danger","Delete");
      rm.onclick=async()=>{ if (confirm("Delete course?")) await deleteDoc(doc(db,"courses",c.id)); };
      actions.append(ed,rm); row.append(actions); box.append(row);
    });
  });
}

// ---------- Seeder (demo course so you can confirm cards/buttons/UI) ----------
async function seedDemoCourse(){
  await addDoc(collection(db,"courses"), {
    title: "The Cat Course: Fundamentals",
    image: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=1200&q=80", // full visible within fixed area
    desc: "Learn core cat facts with perfect card rendering. This description is intentionally long to test line-clamp and equal card heights across the grid...",
    price: 12,
    credits: 3,
    createdAt: serverTimestamp()
  });
}

// ---------- Utilities ----------
function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
function slug(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""); }
function loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src=src; s.onload=()=>res(); s.onerror=()=>rej();
    document.head.appendChild(s);
  });
}

// ---------- Init ----------
function init(){
  // sidebar links
  $$("#sidebar a.navlink").forEach(a=>a.addEventListener("click", ()=> route()));
  // initial view
  route();
  // profile
  loadProfile();
}
init();