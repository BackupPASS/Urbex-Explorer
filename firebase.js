// ==========================================
// PlingifyPlug Urbex Explorer - Firebase
// ==========================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// ==========================================
// FIREBASE CONFIG
// ==========================================

const firebaseConfig = {

    apiKey:
        "AIzaSyDV3XyNalR0qkiTcQR3H2QJehxq9W44cQk",

    authDomain:
        "plingifyplug-explorer.firebaseapp.com",

    projectId:
        "plingifyplug-explorer",

    storageBucket:
        "plingifyplug-explorer.firebasestorage.app",

    messagingSenderId:
        "126002610644",

    appId:
        "1:126002610644:web:7e0bec93cd26da4ef89641",

    measurementId:
        "G-7DGG29EZ0R"
};


// ==========================================
// INITIALISE FIREBASE
// ==========================================

const app =
    initializeApp(firebaseConfig);


// ==========================================
// SERVICES
// ==========================================

export const auth =
    getAuth(app);

export const db =
    getFirestore(app);


// ==========================================
// ADMIN UID
// ==========================================

export const ADMIN_UID =
    "nq3mzl5e3tVTW6l0jI7XQHI8Tnf1";