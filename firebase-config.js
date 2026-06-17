// ============================================================
// FEELSHARE - Firebase Configuration
// ============================================================
// INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project named "FeelShare"
// 3. Go to Project Settings > General > Your Apps > Add App (Web)
// 4. Copy your firebaseConfig values and paste them below
// 5. Enable Authentication: Email/Password AND Google sign-in
// 6. Enable Firestore Database (start in test mode)
// 7. Enable Storage (for profile pictures)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// 🔴 PALITAN MO ITO NG IYONG OWN FIREBASE CONFIG:
const firebaseConfig = {
  
  apiKey: "AIzaSyCNRi1N_W2aiim-ICoypOFJvvz6GA5p270",
  authDomain: "feelshare-a9e1c.firebaseapp.com",
  databaseURL: "https://feelshare-a9e1c-default-rtdb.firebaseio.com",
  projectId: "feelshare-a9e1c",
  storageBucket: "feelshare-a9e1c.firebasestorage.app",
  messagingSenderId: "731314506469",
  appId: "1:731314506469:web:abe51d73c90832d2cf220c",
  measurementId: "G-WKZDHMKWM7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();