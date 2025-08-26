// Fill these with YOUR Firebase project (Project settings → General → Your apps → Web app)
export const APP_CONFIG = {
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyBErU1LNPMJjlwXPIWZV9cf_Q324klAee4",
  authDomain: "ihub-mm.firebaseapp.com",
  projectId: "ihub-mm",
  storageBucket: "ihub-mm.firebasestorage.app",
  messagingSenderId: "791569078539",
  appId: "1:791569078539:web:36dd0e5b1c238a12a8aa0e",
  measurementId: "G-SL71LXSMZ8"
  },

  // For demo only. Anyone whose email is listed here will be auto-promoted to admin on first login.
  // (In production, prefer server-side custom claims.)
  ADMIN_EMAILS: ["admin@ihub.com"],

  // Payments (PayPal). Put your sandbox or live client id.
  PAYPAL_CLIENT_ID: "AVpfmQ8DyyatFaAGQ3Jg58XtUt_2cJDr1leqcc_JI8LvKIR2N5WB_yljqCOTTCtvK1hFJ7Q9X0ojXsEC", // e.g. "Abc123…"
  PAYPAL_CURRENCY: "USD",

  // Quizzes / Exams defaults
  PASSING_SCORE: 70, // %
};