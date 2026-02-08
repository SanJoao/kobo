/**
 * Firebase Configuration for Koby
 * This file initializes the Firebase app and exports services for use across the application.
 * Uses SDK version 10.7.1 to match the newer pages.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Firebase configuration - same as firebase-init.js
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

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Emulator connection disabled - using production Firebase
// To enable emulators, uncomment the code below and run: firebase emulators:start
/*
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Firebase Config] Connecting to emulators...');

    try {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        console.log('[Firebase Config] Auth emulator connected');
    } catch (e) {
        console.log('[Firebase Config] Auth emulator already connected or unavailable');
    }

    try {
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
        console.log('[Firebase Config] Firestore emulator connected');
    } catch (e) {
        console.log('[Firebase Config] Firestore emulator already connected or unavailable');
    }

    try {
        connectStorageEmulator(storage, '127.0.0.1', 9199);
        console.log('[Firebase Config] Storage emulator connected');
    } catch (e) {
        console.log('[Firebase Config] Storage emulator already connected or unavailable');
    }

    try {
        connectFunctionsEmulator(functions, '127.0.0.1', 5001);
        console.log('[Firebase Config] Functions emulator connected');
    } catch (e) {
        console.log('[Firebase Config] Functions emulator already connected or unavailable');
    }
}
*/

console.log('[Firebase Config] Initialized with project:', firebaseConfig.projectId);

