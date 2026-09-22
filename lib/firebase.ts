import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCQygI0I-yyoiooquotLa7cyj6--nCQOK4",
  authDomain: "noc-dashboard-80cc3.firebaseapp.com",
  projectId: "noc-dashboard-80cc3",
  storageBucket: "noc-dashboard-80cc3.firebasestorage.app",
  messagingSenderId: "715842092599",
  appId: "1:715842092599:web:8bf737c0d030bdf01b89b2",
  measurementId: "G-NXP6EJC8PY"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);