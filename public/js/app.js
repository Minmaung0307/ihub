// ========== SIMPLE E-LEARNING (Static) ==========
// Uses: Firebase (Auth + Firestore), PayPal Checkout, EmailJS
// Replace the placeholders below and deploy to GitHub Pages or Firebase Hosting.

// ---------- CONFIG ----------
const ADMIN_EMAILS = [
  // Add admin emails here (they get Admin menu and edit/delete)
  "minmaung0307@gmail.com"
];

// Firebase (use your real project values)
const firebaseConfig = {
  apiKey: "AIzaSyBErU1LNPMJjlwXPIWZV9cf_Q324klAee4",
  authDomain: "ihub-mm.firebaseapp.com",
  projectId: "ihub-mm",
  storageBucket: "ihub-mm.firebasestorage.app",
  messagingSenderId: "791569078539",
  appId: "1:791569078539:web:36dd0e5b1c238a12a8aa0e",
  measurementId: "G-SL71LXSMZ8"
};

// EmailJS
const EMAILJS_PUBLIC_KEY = "WT0GOYrL9HnDKvLUf";
const EMAILJS_SERVICE_ID = "service_z9tkmvr";
const EMAILJS_TEMPLATE_ID = "template_q5q471f";

// ---------- INIT LIBS ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, getDoc, setDoc, doc,
  orderBy, query, serverTimestamp, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// EmailJS init (global from CDN)
if (window.emailjs && EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
  emailjs.init(EMAILJS_PUBLIC_KEY);
}

// ---------- DOM ----------
const sections = {
  courses: document.getElementById("section-courses"),
  profile: document.getElementById("section-profile"),
  contact: document.getElementById("section-contact"),
  adminCourses: document.getElementById("section-admin-courses"),
  adminNews: document.getElementById("section-admin-news"),
};

const menuButtons = document.querySelectorAll(".menu-item");
const adminGroup = document.getElementById("adminGroup");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userBadge = document.getElementById("userBadge");

const coursesGrid = document.getElementById("coursesGrid");
const refreshCoursesBtn = document.getElementById("refreshCoursesBtn");

const adminCoursesGrid = document.getElementById("adminCoursesGrid");
const newCourseBtn = document.getElementById("newCourseBtn");
const courseForm = document.getElementById("courseForm");
const cancelCourseBtn = document.getElementById("cancelCourseBtn");
const courseId = document.getElementById("courseId");
const courseTitle = document.getElementById("courseTitle");
const courseImage = document.getElementById("courseImage");
const courseDesc = document.getElementById("courseDesc");
const coursePrice = document.getElementById("coursePrice");

const newAnnouncementBtn = document.getElementById("newAnnouncementBtn");
const announcementForm = document.getElementById("announcementForm");
const cancelAnnouncementBtn = document.getElementById("cancelAnnouncementBtn");
const announcementId = document.getElementById("announcementId");
const announcementTitle = document.getElementById("announcementTitle");
const announcementBody = document.getElementById("announcementBody");
const announcementsList = document.getElementById("announcementsList");

const pfForm = document.getElementById("profileForm");
const pfDisplayName = document.getElementById("pfDisplayName");
const pfBio = document.getElementById("pfBio");
const pfWebsite = document.getElementById("pfWebsite");
const pfTwitter = document.getElementById("pfTwitter");
const pfGithub = document.getElementById("pfGithub");
const viewProfileCardBtn = document.getElementById("viewProfileCardBtn");
const profileCard = document.getElementById("profileCard");
const pcName = document.getElementById("pcName");
const pcBio = document.getElementById("pcBio");
const pcWebsite = document.getElementById("pcWebsite");
const pcTwitter = document.getElementById("pcTwitter");
const pcGithub = document.getElementById("pcGithub");

const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");

// Modal
const courseModal = document.getElementById("courseModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const mImg = document.getElementById("mImg");
const mTitle = document.getElementById("mTitle");
const mDesc = document.getElementById("mDesc");
const mPrice = document.getElementById("mPrice");
const mBuyBtn = document.getElementById("mBuyBtn");
const paypalButtons = document.getElementById("paypalButtons");

let CURRENT_USER = null;
let IS_ADMIN = false;
let MODAL_COURSE = null;

// ---------- NAV ----------
menuButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    menuButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    Object.values(sections).forEach(sec => sec.classList.remove("visible"));
    const target = btn.dataset.target;
    document.getElementById(target).classList.add("visible");
  });
});

// ---------- AUTH ----------
loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  CURRENT_USER = user || null;
  IS_ADMIN = !!(user && ADMIN_EMAILS.includes(user.email));

  if (user) {
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    userBadge.classList.remove("hidden");
    userBadge.textContent = `${user.displayName || user.email}`;
    if (IS_ADMIN) adminGroup.classList.remove("hidden"); else adminGroup.classList.add("hidden");
    await loadProfile();
  } else {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    userBadge.classList.add("hidden");
    adminGroup.classList.add("hidden");
    profileCard.classList.add("hidden");
  }

  // always load public data
  await Promise.all([loadCourses(), loadAdminCourses(), loadAnnouncements()]);
});

// ---------- FIRESTORE HELPERS ----------
const coll = (name) => collection(db, name);

async function loadCourses() {
  const q = query(coll("courses"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  coursesGrid.innerHTML = "";
  snap.forEach(d => {
    const c = { id: d.id, ...d.data() };
    coursesGrid.insertAdjacentHTML("beforeend", courseCardHTML(c, false));
  });
}

async function loadAdminCourses() {
  const q = query(coll("courses"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  adminCoursesGrid.innerHTML = "";
  snap.forEach(d => {
    const c = { id: d.id, ...d.data() };
    adminCoursesGrid.insertAdjacentHTML("beforeend", courseCardHTML(c, true));
  });
}

async function loadAnnouncements() {
  const q = query(coll("announcements"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  announcementsList.innerHTML = "";
  snap.forEach(d => {
    const a = { id: d.id, ...d.data() };
    announcementsList.insertAdjacentHTML("beforeend", announcementItemHTML(a));
  });
}

function toMoney(v) {
  const n = Number(v || 0);
  return `$${n.toFixed(2)}`;
}

// ---------- RENDERERS ----------
function courseCardHTML(c, adminMode) {
  const imgSrc = c.imageUrl || "https://dummyimage.com/640x360/0c1330/ffffff&text=Course";
  const adminBtns = `
    <button class="btn btn-outline js-edit" data-id="${c.id}">Edit</button>
    <button class="btn btn-outline js-delete" data-id="${c.id}">Delete</button>
  `;
  return `
  <div class="card" data-id="${c.id}">
    <div class="card-img"><img src="${imgSrc}" alt="${escapeHTML(c.title)}" onerror="this.src='https://dummyimage.com/640x360/0c1330/ffffff&text=Course'" /></div>
    <div class="card-body">
      <h3 class="card-title">${escapeHTML(c.title || "Untitled")}</h3>
      <p class="card-desc line-clamp-2" title="${escapeHTML(c.description || "")}">${escapeHTML(c.description || "")}</p>
      <div class="spread">
        <div class="price">${toMoney(c.price || 0)}</div>
        <div class="card-actions">
          <button class="btn js-details" data-id="${c.id}">Details</button>
          ${adminMode && IS_ADMIN ? adminBtns : ""}
        </div>
      </div>
    </div>
  </div>`;
}

function announcementItemHTML(a) {
  const canEdit = IS_ADMIN ? `
    <div class="actions">
      <button class="btn btn-outline js-edit-ann" data-id="${a.id}">Edit</button>
      <button class="btn btn-outline js-del-ann" data-id="${a.id}">Delete</button>
    </div>` : "";
  return `
  <div class="list-item" data-id="${a.id}">
    <div class="spread">
      <strong>${escapeHTML(a.title || "Announcement")}</strong>
      <span class="muted">${a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : ""}</span>
    </div>
    <div>${escapeHTML(a.body || "")}</div>
    ${canEdit}
  </div>`;
}

function escapeHTML(s="") {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---------- PUBLIC COURSES EVENTS ----------
refreshCoursesBtn.addEventListener("click", () => {
  loadCourses();
});

coursesGrid.addEventListener("click", async (e) => {
  const id = e.target.dataset.id;
  const card = e.target.closest(".card");
  if (!id || !card) return;

  if (e.target.classList.contains("js-details")) {
    const docRef = doc(db, "courses", id);
    const d = await getDoc(docRef);
    if (!d.exists()) return;
    const c = { id, ...d.data() };
    openCourseModal(c);
  }
});

// ---------- ADMIN COURSES ----------
newCourseBtn.addEventListener("click", () => {
  if (!IS_ADMIN) return alert("Admins only.");
  courseForm.classList.remove("hidden");
  courseId.value = "";
  courseTitle.value = "";
  courseImage.value = "";
  courseDesc.value = "";
  coursePrice.value = "19.99";
});
cancelCourseBtn.addEventListener("click", () => {
  courseForm.classList.add("hidden");
});

courseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!IS_ADMIN) return alert("Admins only.");
  const payload = {
    title: courseTitle.value.trim(),
    imageUrl: courseImage.value.trim(),
    description: courseDesc.value.trim(),
    price: Number(coursePrice.value || 0),
    createdAt: serverTimestamp(),
  };
  if (courseId.value) {
    await updateDoc(doc(db, "courses", courseId.value), payload);
  } else {
    await addDoc(coll("courses"), payload);
  }
  courseForm.classList.add("hidden");
  await Promise.all([loadCourses(), loadAdminCourses()]);
});

adminCoursesGrid.addEventListener("click", async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains("js-edit")) {
    if (!IS_ADMIN) return alert("Admins only.");
    const d = await getDoc(doc(db, "courses", id));
    if (!d.exists()) return;
    const c = d.data();
    courseId.value = id;
    courseTitle.value = c.title || "";
    courseImage.value = c.imageUrl || "";
    courseDesc.value = c.description || "";
    coursePrice.value = Number(c.price || 0);
    courseForm.classList.remove("hidden");
  } else if (e.target.classList.contains("js-delete")) {
    if (!confirm("Delete this course?")) return;
    await deleteDoc(doc(db, "courses", id));
    await Promise.all([loadCourses(), loadAdminCourses()]);
  } else if (e.target.classList.contains("js-details")) {
    // Allow details from admin grid too
    const d = await getDoc(doc(db, "courses", id));
    if (d.exists()) openCourseModal({ id, ...d.data() });
  }
});

// ---------- ANNOUNCEMENTS ----------
newAnnouncementBtn.addEventListener("click", () => {
  if (!IS_ADMIN) return alert("Admins only.");
  announcementForm.classList.remove("hidden");
  announcementId.value = "";
  announcementTitle.value = "";
  announcementBody.value = "";
});
cancelAnnouncementBtn.addEventListener("click", () => {
  announcementForm.classList.add("hidden");
});

announcementForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!IS_ADMIN) return alert("Admins only.");
  const payload = {
    title: announcementTitle.value.trim(),
    body: announcementBody.value.trim(),
    createdAt: serverTimestamp(),
  };
  if (announcementId.value) {
    await updateDoc(doc(db, "announcements", announcementId.value), payload);
  } else {
    await addDoc(coll("announcements"), payload);
  }
  announcementForm.classList.add("hidden");
  await loadAnnouncements();
});

announcementsList.addEventListener("click", async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  if (e.target.classList.contains("js-edit-ann")) {
    const d = await getDoc(doc(db, "announcements", id));
    if (!d.exists()) return;
    const a = d.data();
    announcementId.value = id;
    announcementTitle.value = a.title || "";
    announcementBody.value = a.body || "";
    announcementForm.classList.remove("hidden");
  } else if (e.target.classList.contains("js-del-ann")) {
    if (!confirm("Delete this announcement?")) return;
    await deleteDoc(doc(db, "announcements", id));
    await loadAnnouncements();
  }
});

// ---------- PROFILE ----------
async function loadProfile() {
  if (!CURRENT_USER) return;
  const ref = doc(db, "profiles", CURRENT_USER.uid);
  const d = await getDoc(ref);
  if (d.exists()) {
    const p = d.data();
    pfDisplayName.value = p.name || (CURRENT_USER.displayName || "");
    pfBio.value = p.bio || "";
    pfWebsite.value = p.website || "";
    pfTwitter.value = p.twitter || "";
    pfGithub.value = p.github || "";
  } else {
    pfDisplayName.value = CURRENT_USER.displayName || "";
  }
}

pfForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!CURRENT_USER) return alert("Please sign in first.");
  const ref = doc(db, "profiles", CURRENT_USER.uid);
  await setDoc(ref, {
    name: pfDisplayName.value.trim(),
    bio: pfBio.value.trim(),
    website: pfWebsite.value.trim(),
    twitter: pfTwitter.value.trim(),
    github: pfGithub.value.trim(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  alert("Profile saved.");
});

viewProfileCardBtn.addEventListener("click", () => {
  if (!CURRENT_USER) return alert("Please sign in first.");
  pcName.textContent = pfDisplayName.value || CURRENT_USER.displayName || CURRENT_USER.email;
  pcBio.textContent = pfBio.value || "—";

  toggleLink(pcWebsite, pfWebsite.value);
  toggleLink(pcTwitter, pfTwitter.value);
  toggleLink(pcGithub, pfGithub.value);

  profileCard.classList.remove("hidden");
});

function toggleLink(anchor, value) {
  if (value && /^https?:\/\//i.test(value)) {
    anchor.href = value;
    anchor.classList.remove("hidden");
  } else {
    anchor.classList.add("hidden");
  }
}

// ---------- CONTACT (EmailJS) ----------
contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (!window.emailjs || EMAILJS_PUBLIC_KEY === "YOUR_EMAILJS_PUBLIC_KEY") {
      return alert("Configure EmailJS keys first.");
    }
    contactStatus.textContent = "Sending…";
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      from_name: document.getElementById("ctName").value,
      reply_to: document.getElementById("ctEmail").value,
      message: document.getElementById("ctMessage").value,
    });
    contactStatus.textContent = "Sent ✓";
    contactForm.reset();
  } catch (err) {
    console.error(err);
    contactStatus.textContent = "Failed. Check EmailJS config in app.js";
  }
});

// ---------- MODAL + PAYPAL ----------
function openCourseModal(course) {
  MODAL_COURSE = course;
  const img = course.imageUrl || "https://dummyimage.com/640x360/0c1330/ffffff&text=Course";
  mImg.src = img;
  mTitle.textContent = course.title || "Course";
  mDesc.textContent = course.description || "";
  mPrice.textContent = toMoney(course.price || 0);

  paypalButtons.innerHTML = "";
  paypalButtons.classList.add("hidden");
  mBuyBtn.classList.remove("hidden");

  courseModal.classList.remove("hidden");
}

closeModalBtn.addEventListener("click", () => {
  courseModal.classList.add("hidden");
});

mBuyBtn.addEventListener("click", () => {
  if (!window.paypal) return alert("PayPal SDK not loaded. Check client-id in index.html");
  if (!CURRENT_USER) return alert("Please sign in to purchase.");

  // Render PayPal Buttons only when needed
  paypalButtons.classList.remove("hidden");
  mBuyBtn.classList.add("hidden");

  const price = Number(MODAL_COURSE?.price || 0).toFixed(2);
  paypal.Buttons({
    style: { layout: "vertical" },
    createOrder: (_, actions) => {
      return actions.order.create({
        purchase_units: [{
          amount: { value: price },
          description: `Course: ${MODAL_COURSE.title}`
        }]
      });
    },
    onApprove: async (_, actions) => {
      const order = await actions.order.capture();
      // Save purchase
      await addDoc(coll("purchases"), {
        userId: CURRENT_USER.uid,
        userEmail: CURRENT_USER.email,
        courseId: MODAL_COURSE.id,
        courseTitle: MODAL_COURSE.title,
        amount: Number(price),
        orderId: order.id,
        provider: "paypal",
        createdAt: serverTimestamp(),
      });
      alert("Payment complete. You now own this course.");
      courseModal.classList.add("hidden");
    },
    onError: (err) => {
      console.error(err);
      alert("PayPal error. See console.");
      paypalButtons.classList.add("hidden");
      mBuyBtn.classList.remove("hidden");
    }
  }).render("#paypalButtons");
});

// ---------- UTIL ----------
function ensureAuthAdmin() {
  if (!CURRENT_USER) throw new Error("Auth required");
  if (!IS_ADMIN) throw new Error("Admin only");
}

// Avoid background listeners to keep it simple & prevent WebChannel spam.
// We use on-demand getDocs() calls (no onSnapshot()).

// ---------- SAFE DEFAULT DATA (optional) ----------
// Uncomment to seed example course once (run from console)
// ;(async () => {
//   await addDoc(coll("courses"), {
//     title: "Intro to Web Dev",
//     description: "HTML, CSS, JS fundamentals in a compact, practical course.",
//     imageUrl: "https://dummyimage.com/640x360/202b59/ffffff&text=Web+Dev",
//     price: 19.99,
//     createdAt: serverTimestamp(),
//   });
// })();