import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyCQBiazeXThblSXEyP8tlOxjpu-mfGq76o",
  authDomain: "agenda-tock.firebaseapp.com",
  projectId: "agenda-tock",
  storageBucket: "agenda-tock.firebasestorage.app",
  messagingSenderId: "282314346925",
  appId: "1:282314346925:web:b4207fbae88f098bfe1124",
  measurementId: "G-X3GPCEJHYQ",
};

const app = initializeApp(firebaseConfig);

export default app;
