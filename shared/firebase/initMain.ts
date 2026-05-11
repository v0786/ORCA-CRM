/**
 * Main application (ICS) Firebase initialization (separate Analytics tracking).
 *
 * Firebase SDK docs (available libraries):
 * https://firebase.google.com/docs/web/setup#available-libraries
 * https://firebase.google.com/docs/web/setup#available-libraries
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, logEvent, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBBYnbgfxds6H2rQbkejJBghm_23DgKW_k",
  authDomain: "pizza-express-fdad7.firebaseapp.com",
  projectId: "pizza-express-fdad7",
  storageBucket: "pizza-express-fdad7.firebasestorage.app",
  messagingSenderId: "343178713223",
  appId: "1:343178713223:web:430845b40a5f1144e08022",
  measurementId: "G-7Z9LTKWGKH",
};

const APP_NAME = "orca-main";

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;

export function initMainFirebase(): { app: FirebaseApp; analytics: Analytics | null } {
  if (!app) {
    const existing = getApps().find((a) => a.name === APP_NAME);
    app = existing ?? initializeApp(firebaseConfig, APP_NAME);
  }

  if (analytics === null) {
    try {
      analytics = typeof window === "undefined" ? null : getAnalytics(app);
    } catch {
      analytics = null;
    }
  }

  return { app, analytics };
}

export function testMainAnalyticsEvent(eventName = "orca_main_analytics_test") {
  const { analytics } = initMainFirebase();
  if (!analytics) return false;
  try {
    logEvent(analytics, eventName);
    return true;
  } catch {
    return false;
  }
}

