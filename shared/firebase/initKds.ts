/**
 * KDS (Kitchen Display System) Firebase initialization (separate Analytics tracking).
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
  appId: "1:343178713223:web:b8bf082f1f94a2bce08022",
  measurementId: "G-6L9FG6PSR4",
};

const APP_NAME = "orca-kds";

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;

export function initKdsFirebase(): { app: FirebaseApp; analytics: Analytics | null } {
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

export function testKdsAnalyticsEvent(eventName = "orca_kds_analytics_test") {
  const { analytics } = initKdsFirebase();
  if (!analytics) return false;
  try {
    logEvent(analytics, eventName);
    return true;
  } catch {
    return false;
  }
}

