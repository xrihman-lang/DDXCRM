import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBGLw9VXS8--1KFBdfJyshCHHMdnB9ILLc",
  authDomain: "gdxcrm-98156.firebaseapp.com",
  projectId: "gdxcrm-98156",
  storageBucket: "gdxcrm-98156.firebasestorage.app",
  messagingSenderId: "653776295348",
  appId: "1:653776295348:web:36527671a7082319c98ee1"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
