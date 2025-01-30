import { app, analytics, firebaseConfig } from './firebase.js'; 
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const db = getDatabase(app);
const auth = getAuth(app);

 // Move focus to next input
        function addInputListeners(containerId) {
            const inputs = document.querySelectorAll(`#${containerId} input`);
            inputs.forEach((input, index) => {
                input.addEventListener('input', () => {
                    if (input.value.length === 1 && index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                });
            });
        }
    addInputListeners("enterPin");
       addInputListeners("confirmPin");
  

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("modal");
    const closeModal = document.querySelector(".close");    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const userRef = ref(db, `users/${user.uid}/transferP`);
            get(userRef).then((snapshot) => {
                if (snapshot.exists()) {
                    console.log("User already has a transfer PIN. Modal will not display.");
                    modal.style.display = "none"; // Kada a nuna modal
                } else {
                    console.log("User does not have a transfer PIN. Showing modal.");
                    modal.style.display = "flex"; 
                }
            }).catch((error) => {
                console.error("Error checking transfer PIN:", error);
                alert("Error checking transfer PIN. Please try again later.");
            });
        } else {
            alert("User not logged in.");
        }
    });    
    closeModal.addEventListener("click", () => {
        modal.style.display = "none";
    });    
    window.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });

    // Handle PIN submission
    document.getElementById("submitPin").addEventListener("click", () => {
        const pin = Array.from(document.querySelectorAll("#enterPin input")).map(input => input.value).join('');
        const confPin = Array.from(document.querySelectorAll("#confirmPin input")).map(input => input.value).join('');

        if (pin.length !== 5 || confPin.length !== 5) {
            alert("PIN must be exactly 5 digits Number.");
            return;
        }

        if (pin !== confPin) {
            alert("Transfer PIN and Confirm PIN do not match.");
            return;
        }

        onAuthStateChanged(auth, (user) => {
            if (user) {
                const userRef = ref(db, `users/${user.uid}/transferP`);
                set(userRef, pin).then(() => {
                    alert("Transfer PIN set successfully!");
                    modal.style.display = "none"; 
                }).catch((error) => {
                    console.error("Error saving PIN:", error);
                    alert("Error setting PIN. Please try again.");
                });
            } else {
                alert("User not logged in.");
            }
        });
    });
});
