// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { getPerformance } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-performance.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAf6QRXDT9Hc9epK0fWmbV6WeJDGIWaoLw",
  authDomain: "kobo-66199.firebaseapp.com",
  projectId: "kobo-66199",
  storageBucket: "kobo-66199.firebasestorage.app",
  messagingSenderId: "48339964439",
  appId: "1:48339964439:web:bd7d82a5ba089078300252",
  measurementId: "G-PFBK9S498V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const perf = getPerformance(app);

// Export the necessary Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
