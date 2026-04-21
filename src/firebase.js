import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDiiMcE6qT3OSe-ztUgcxtS23JtDQWnl_Q",
  authDomain: "beerhawk-9a066.firebaseapp.com",
  projectId: "beerhawk-9a066",
  storageBucket: "beerhawk-9a066.firebasestorage.app",
  messagingSenderId: "109718844846",
  appId: "1:109718844846:web:563bed10b2b0f1bf83043f",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);