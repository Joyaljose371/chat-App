import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBtwNjwmynm6yYOUWIcMAvVGQr-rboVtrA",
  authDomain: "private-chat-99add.firebaseapp.com",
  projectId: "private-chat-99add",
  storageBucket: "private-chat-99add.firebasestorage.app",
  messagingSenderId: "729345046498",
  appId: "1:729345046498:web:1c980e347d4971f4d3abbb",
  measurementId: "G-KLDSHZW4SN"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);