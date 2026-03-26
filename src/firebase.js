// src/firebase.js
// ─────────────────────────────────────────────────────────────
// Firebase initialisation for the "51" card game.
// ▸ Replace the firebaseConfig values with your own project's
//   credentials from the Firebase Console.
// ─────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Your web app's Firebase configuration.
 * TODO: Replace with your actual Firebase project config.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDudLucZMBV4YJQoS3TBNvYEfgMc03Txh8",
  authDomain: "hillyia.firebaseapp.com",
  projectId: "hillyia",
  storageBucket: "hillyia.firebasestorage.app",
  messagingSenderId: "719338396604",
  appId: "1:719338396604:web:7821423ea9840a5c9a29b9",
  measurementId: "G-JHNDNNNW6K"
};

// Initialise the Firebase app (singleton)
const app = initializeApp(firebaseConfig);

// Firebase Authentication (Anonymous sign-in for guest players)
export const auth = getAuth(app);

// Cloud Firestore (main database)
export const db = getFirestore(app);

export default app;
