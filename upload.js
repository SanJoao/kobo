import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { auth, storage, db } from "./firebase-init.js";

document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('upload-button');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');

    let currentUser = null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (!user) {
            uploadButton.textContent = 'Please Sign In to Upload';
            uploadButton.disabled = true;
        } else {
            uploadButton.textContent = 'Select KoboReader.sqlite File';
            uploadButton.disabled = false;
        }
    });

    uploadButton.addEventListener('click', () => {
        if (currentUser) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name !== 'KoboReader.sqlite') {
            uploadStatus.textContent = 'Error: Please select the KoboReader.sqlite file.';
            uploadStatus.style.color = 'red';
            return;
        }

        uploadFile(file);
    });

    function uploadFile(file) {
        if (!currentUser) {
            uploadStatus.textContent = 'You must be logged in to upload a file.';
            return;
        }

        const storageRef = ref(storage, `uploads/${currentUser.uid}/KoboReader.sqlite`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                uploadStatus.textContent = `Upload is ${progress.toFixed(2)}% done`;
                uploadStatus.style.color = 'inherit';
            }, 
            (error) => {
                console.error("Upload failed:", error);
                uploadStatus.textContent = 'Upload failed. Please try again.';
                uploadStatus.style.color = 'red';
            }, 
            () => {
                uploadStatus.innerHTML = ''; // Clear previous status messages
                uploadStatus.style.color = 'green';
                
                const message = document.createElement('p');
                message.textContent = 'Upload complete! Processing your highlights...';
                uploadStatus.appendChild(message);

                // Listen for processing status updates
                listenForProcessingStatus(currentUser.uid);
            }
        );
    }

    function listenForProcessingStatus(userId) {
        const statusRef = doc(db, "processingStatus", userId);

        onSnapshot(statusRef, (doc) => {
            if (doc.exists()) {
                const statusData = doc.data();
                uploadStatus.innerHTML = ''; // Clear previous messages

                const message = document.createElement('p');
                if (statusData.status === 'success') {
                    message.textContent = `Successfully processed ${statusData.bookCount} books and ${statusData.highlightCount} highlights.`;
                    message.style.color = 'green';
                    
                    const profileButton = document.createElement('button');
                    profileButton.textContent = 'Go to Your Profile';
                    profileButton.id = 'go-to-profile';
                    profileButton.onclick = () => {
                        window.location.href = `/user/${userId}`;
                    };
                    uploadStatus.appendChild(profileButton);

                } else if (statusData.status === 'no_highlights') {
                    message.textContent = 'Processing complete. No new highlights were found.';
                    message.style.color = 'orange';
                } else if (statusData.status === 'error') {
                    message.textContent = `An error occurred: ${statusData.error}`;
                    message.style.color = 'red';
                }
                uploadStatus.appendChild(message);
            }
        });
    }
});
