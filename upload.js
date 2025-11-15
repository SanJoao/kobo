import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { auth, storage, db, analytics } from "./firebase-init.js";
import { logEvent } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics.js";

document.addEventListener('DOMContentLoaded', () => {
    const modeSelection = document.getElementById('mode-selection');
    const fileUploadSection = document.getElementById('file-upload-section');
    const continueButton = document.getElementById('continue-to-upload');
    const backButton = document.getElementById('back-to-mode');
    const uploadButton = document.getElementById('upload-button');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');
    const processingProgress = document.getElementById('processing-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    let currentUser = null;
    let selectedMode = 'offline';

    // Auth state listener
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateUploadButtonState();
    });

    // Update upload button based on mode and auth state
    function updateUploadButtonState() {
        const mode = document.querySelector('input[name="upload-mode"]:checked').value;

        if (mode === 'offline') {
            // Offline mode doesn't require auth
            uploadButton.textContent = 'Select KoboReader.sqlite File';
            uploadButton.disabled = false;
        } else {
            // Cloud modes require auth
            if (!currentUser) {
                uploadButton.textContent = 'Please Sign In to Upload';
                uploadButton.disabled = true;
            } else {
                uploadButton.textContent = 'Select KoboReader.sqlite File';
                uploadButton.disabled = false;
            }
        }
    }

    // Continue button - show upload section
    continueButton.addEventListener('click', () => {
        selectedMode = document.querySelector('input[name="upload-mode"]:checked').value;
        modeSelection.style.display = 'none';
        fileUploadSection.style.display = 'block';
        updateUploadButtonState();
    });

    // Back button - return to mode selection
    backButton.addEventListener('click', () => {
        fileUploadSection.style.display = 'none';
        modeSelection.style.display = 'block';
        resetUploadUI();
    });

    // Upload button - trigger file select
    uploadButton.addEventListener('click', () => {
        const mode = document.querySelector('input[name="upload-mode"]:checked').value;

        if (mode !== 'offline' && !currentUser) {
            uploadStatus.textContent = 'Please sign in to use cloud features.';
            uploadStatus.style.color = 'red';
            return;
        }

        fileInput.click();
    });

    // File input change - process file based on mode
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.name !== 'KoboReader.sqlite') {
            uploadStatus.textContent = 'Error: Please select the KoboReader.sqlite file.';
            uploadStatus.style.color = 'red';
            return;
        }

        const mode = document.querySelector('input[name="upload-mode"]:checked').value;

        if (mode === 'offline') {
            await processOffline(file);
        } else {
            await uploadToCloud(file);
        }
    });

    /**
     * Process file offline using sql.js
     */
    async function processOffline(file) {
        try {
            uploadStatus.textContent = '';
            processingProgress.style.display = 'block';
            uploadButton.disabled = true;

            const processor = window.offlineProcessor;

            const result = await processor.processFile(file, (progress) => {
                // Update progress UI
                const percent = progress.progress;
                progressBar.style.width = `${percent}%`;

                switch (progress.stage) {
                    case 'reading':
                        progressText.textContent = 'Reading database file...';
                        break;
                    case 'extracting':
                        progressText.textContent = 'Extracting highlights and books...';
                        break;
                    case 'saving':
                        progressText.textContent = 'Saving to local storage...';
                        break;
                    case 'complete':
                        progressText.textContent = 'Complete!';
                        break;
                }
            });

            if (result.success) {
                processingProgress.style.display = 'none';
                uploadStatus.innerHTML = '';

                const message = document.createElement('p');
                message.textContent = `Successfully processed ${result.stats.bookCount} books, ${result.stats.highlightCount} highlights, and ${result.stats.wordCount} words.`;
                message.style.color = 'green';
                message.style.fontWeight = 'bold';
                uploadStatus.appendChild(message);

                const note = document.createElement('p');
                note.textContent = '✅ Your data has been processed locally and is ready to use!';
                note.style.color = '#4CAF50';
                uploadStatus.appendChild(note);

                const viewButton = document.createElement('button');
                viewButton.textContent = 'View Your Highlights';
                viewButton.className = 'btn-primary';
                viewButton.style.marginTop = '20px';
                viewButton.onclick = () => {
                    // Store offline mode flag and data
                    sessionStorage.setItem('offlineMode', 'true');
                    sessionStorage.setItem('offlineData', JSON.stringify(result.data));
                    window.location.href = '/offline-dashboard.html';
                };
                uploadStatus.appendChild(viewButton);

                const exportNote = document.createElement('p');
                exportNote.textContent = 'You can export your highlights to Obsidian, Notion, or flashcards anytime!';
                exportNote.style.fontSize = '14px';
                exportNote.style.color = '#666';
                exportNote.style.marginTop = '10px';
                uploadStatus.appendChild(exportNote);

                // Track analytics
                if (analytics) {
                    logEvent(analytics, 'upload_offline', {
                        book_count: result.stats.bookCount,
                        highlight_count: result.stats.highlightCount
                    });
                }
            }
        } catch (error) {
            console.error('[Upload] Offline processing error:', error);
            processingProgress.style.display = 'none';
            uploadStatus.textContent = `Error: ${error.message}. Please refresh the page and try again.`;
            uploadStatus.style.color = 'red';
        } finally {
            uploadButton.disabled = false;
        }
    }

    /**
     * Upload file to cloud (existing functionality)
     */
    async function uploadToCloud(file) {
        if (!currentUser) {
            uploadStatus.textContent = 'You must be logged in to upload to the cloud.';
            uploadStatus.style.color = 'red';
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
                uploadStatus.innerHTML = '';
                uploadStatus.style.color = 'green';

                const message = document.createElement('p');
                message.textContent = 'Upload complete! Processing your highlights...';
                uploadStatus.appendChild(message);

                // Listen for processing status updates
                listenForProcessingStatus(currentUser.uid);
                logEvent(analytics, 'upload_highlights');
            }
        );
    }

    /**
     * Listen for cloud processing status
     */
    function listenForProcessingStatus(userId) {
        const statusRef = doc(db, "processingStatus", userId);

        onSnapshot(statusRef, (doc) => {
            if (doc.exists()) {
                const statusData = doc.data();
                uploadStatus.innerHTML = '';

                const message = document.createElement('p');
                if (statusData.status === 'success') {
                    message.textContent = `Successfully processed ${statusData.bookCount} books, ${statusData.highlightCount} highlights and ${statusData.wordCount} words.`;
                    message.style.color = 'green';

                    const profileButton = document.createElement('button');
                    profileButton.textContent = 'Go to Your Profile';
                    profileButton.id = 'go-to-profile';
                    profileButton.className = 'btn-primary';
                    profileButton.style.marginTop = '20px';
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

    /**
     * Reset upload UI
     */
    function resetUploadUI() {
        uploadStatus.innerHTML = '';
        processingProgress.style.display = 'none';
        progressBar.style.width = '0%';
        fileInput.value = '';
    }
});
