// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyDyoAF8cAzrXVumwkfm-21Vzb9u16z_iZg",
    authDomain: "the-coin-carte-community.firebaseapp.com",
    projectId: "the-coin-carte-community",
    storageBucket: "the-coin-carte-community.firebasestorage.app",
    messagingSenderId: "904107919015",
    appId: "1:904107919015:web:c35b419a8021d32bd6fd82",
    measurementId: "G-EDYCM1R96R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app)


// // config/firebase.js
// import { initializeApp } from "firebase/app";
// import { getFirestore } from "firebase/firestore";

// const firebaseConfig = {
//     apiKey: "AIzaSyDyoAF8cAzrXVumwkfm-21Vzb9u16z_iZg",
//     authDomain: "the-coin-carte-community.firebaseapp.com",
//     projectId: "the-coin-carte-community",
//     storageBucket: "the-coin-carte-community.appspot.com",
//     messagingSenderId: "904107919015",
//     appId: "1:904107919015:web:c35b419a8021d32bd6fd82",
//     measurementId: "G-EDYCM1R96R",
// };

// const app = initializeApp(firebaseConfig);
// export const db = getFirestore(app);
