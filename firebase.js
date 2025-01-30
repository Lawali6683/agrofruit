import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyBtwsxKGlpX-ofm-yE4o6_5FNYyKFy7X7w",
    authDomain: "fruit-wealth-farming.firebaseapp.com",
    databaseURL: "https://fruit-wealth-farming-default-rtdb.firebaseio.com",
    projectId: "fruit-wealth-farming",
    storageBucket: "fruit-wealth-farming.appspot.com",
    messagingSenderId: "417203511096",
    appId: "1:417203511096:web:1ecaca3d0a705a8c16ebcd",
    measurementId: "G-BZFLHB4KM2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export so other files can use them
export { app, analytics, firebaseConfig };
