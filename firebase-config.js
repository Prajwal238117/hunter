// Firebase modular v12 shared config and service exports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyABhXlczK3kcDTDqV1M5CO-u4JNVbtFRcI",
  authDomain: "cgaph-by-psp.firebaseapp.com",
  projectId: "cgaph-by-psp",
  storageBucket: "cgaph-by-psp.firebasestorage.app",
  messagingSenderId: "728580350307",
  appId: "1:728580350307:web:206fcdbfb6e57ef29db356",
  measurementId: "G-0DE3BBFV75"
};

export const app = initializeApp(firebaseConfig);
// Make analytics optional (throws on non-HTTPS or unsupported environments)
let analyticsInstance = null;
try { analyticsInstance = getAnalytics(app); } catch (e) { /* no-op */ }
export const analytics = analyticsInstance;
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);


