import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { doc, onSnapshot, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
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

    // Book management elements
    const bookManagementSection = document.getElementById('book-management-section');
    const bookListContainer = document.getElementById('book-list');
    const saveVisibilityBtn = document.getElementById('save-visibility-btn');
    const bulkActionsContainer = document.getElementById('bulk-actions');
    const selectAllPrivate = document.getElementById('select-all-private');
    const selectAllExclude = document.getElementById('select-all-exclude');
    const visibilityModeMessage = document.getElementById('visibility-mode-message');

    let currentUser = null;
    let selectedMode = 'offline';
    let userBooks = [];
    let visibilityChanges = {}; // Track changes before saving
    let hasChanges = false;

    // Two-phase upload state
    let pendingFile = null;  // File waiting for visibility confirmation
    let extractedBooks = []; // Books extracted from pending file
    let isPreviewMode = false; // Whether we're showing pre-upload confirmation


    // Auth state listener
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateUploadButtonState();

        // Load book list when user is authenticated
        if (user && bookManagementSection) {
            loadUserBooks(user.uid);
        } else if (bookManagementSection) {
            bookListContainer.innerHTML = '<div class="no-books-message">Please sign in to manage your books.</div>';
        }
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

        // Load books when section becomes visible (auth may have already fired)
        if (currentUser && bookListContainer) {
            console.log('[Upload] Loading books for user:', currentUser.uid);
            loadUserBooks(currentUser.uid);
        }
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

    // Drag and drop handlers
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Highlight drop zone when file is dragged over
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            }, false);
        });

        // Handle dropped files
        dropZone.addEventListener('drop', async (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                await processDroppedFile(file);
            }
        });

        // Click on drop zone triggers file input
        dropZone.addEventListener('click', (e) => {
            if (e.target.id !== 'upload-button') {
                // Avoid double-trigger if clicking the button itself
                fileInput.click();
            }
        });
    }

    /**
     * Process a file dropped or selected
     */
    async function processDroppedFile(file) {
        if (file.name !== 'KoboReader.sqlite') {
            uploadStatus.textContent = 'Error: Please select the KoboReader.sqlite file.';
            uploadStatus.style.color = 'red';
            return;
        }

        const mode = document.querySelector('input[name="upload-mode"]:checked').value;

        if (mode !== 'offline' && !currentUser) {
            uploadStatus.textContent = 'Please sign in to use cloud features.';
            uploadStatus.style.color = 'red';
            return;
        }

        if (mode === 'offline') {
            await processOffline(file);
        } else {
            await parseAndShowConfirmation(file, mode);
        }
    }

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
            // TWO-PHASE UPLOAD: Parse file locally first to get book list
            // User must confirm visibility settings before upload
            await parseAndShowConfirmation(file, mode);
        }
    });

    /**
     * Parse file locally and show visibility confirmation before cloud upload
     * This is the first phase of the two-phase upload flow
     */
    async function parseAndShowConfirmation(file, mode) {
        try {
            uploadStatus.textContent = '';
            processingProgress.style.display = 'block';
            uploadButton.disabled = true;
            progressText.textContent = 'Analyzing your library...';
            progressBar.style.width = '10%';

            const processor = window.offlineProcessor;
            await processor.init();

            // Read file and parse locally
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            processor.db = new processor.SQL.Database(uint8Array);

            progressBar.style.width = '30%';
            progressText.textContent = 'Extracting books...';

            // Extract just books for preview (not full processing)
            await processor.extractBooks(() => { });

            // Get highlight counts per book
            progressBar.style.width = '50%';
            progressText.textContent = 'Counting highlights...';

            const highlightQuery = `
                SELECT VolumeID AS book_id, COUNT(*) as count
                FROM Bookmark
                WHERE Type = 'highlight' OR Type = 'note'
                GROUP BY VolumeID
            `;
            const highlightResult = processor.db.exec(highlightQuery);
            const highlightCounts = {};
            if (highlightResult.length > 0) {
                highlightResult[0].values.forEach(row => {
                    const bookId = row[0]?.replace(/\//g, '__');
                    highlightCounts[bookId] = row[1];
                });
            }

            // Close the database
            processor.db.close();
            processor.db = null;

            progressBar.style.width = '70%';
            progressText.textContent = 'Preparing confirmation...';

            // Store extracted books for rendering
            extractedBooks = processor.data.books.map(book => ({
                id: book.doc_id,
                title: book.title || 'Untitled',
                timeSpent: book.time_spent_reading || 0,
                percentRead: book.percent_read || 0,
                highlightCount: highlightCounts[book.doc_id] || 0,
                dateLastRead: book.date_last_read
            }));

            // Sort by date last read (most recent first)
            extractedBooks.sort((a, b) => {
                if (!a.dateLastRead) return 1;
                if (!b.dateLastRead) return -1;
                return new Date(b.dateLastRead) - new Date(a.dateLastRead);
            });

            // Store the file for later upload after confirmation
            pendingFile = file;
            isPreviewMode = true;

            progressBar.style.width = '100%';
            processingProgress.style.display = 'none';

            // Show confirmation UI
            showPreUploadConfirmation(mode);

        } catch (error) {
            console.error('[Upload] Error parsing file for preview:', error);
            processingProgress.style.display = 'none';
            uploadStatus.textContent = `Error analyzing file: ${error.message}. Please try again.`;
            uploadStatus.style.color = 'red';
            uploadButton.disabled = false;
        }
    }

    /**
     * Show pre-upload confirmation with book visibility settings
     */
    function showPreUploadConfirmation(mode) {
        // Update UI to show confirmation state
        uploadStatus.innerHTML = '';

        const confirmationMessage = document.createElement('div');
        confirmationMessage.className = 'confirmation-message';
        confirmationMessage.innerHTML = `
            <div style="background: #e8f5e9; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
                <h3 style="margin: 0 0 8px 0; color: #2e7d32;">📚 Found ${extractedBooks.length} books with highlights</h3>
                <p style="margin: 0; color: #666;">Review and set visibility for each book below before uploading.</p>
            </div>
        `;
        uploadStatus.appendChild(confirmationMessage);

        // Use the extracted books as userBooks for rendering
        userBooks = extractedBooks;

        // For private mode, auto-select all books as private
        const autoPrivate = mode === 'private';

        // Render the book list with visibility toggles
        renderBookList(autoPrivate);

        // Show the book management section
        if (bookManagementSection) {
            bookManagementSection.style.display = 'block';
        }

        // Update save button to be the "Confirm & Upload" button
        if (saveVisibilityBtn) {
            saveVisibilityBtn.textContent = '🚀 Confirm & Upload';
            saveVisibilityBtn.disabled = false;
            saveVisibilityBtn.onclick = confirmAndUpload;
        }

        uploadButton.style.display = 'none';
    }

    /**
     * Confirm visibility settings and proceed with cloud upload
     */
    async function confirmAndUpload() {
        if (!pendingFile || !currentUser) {
            uploadStatus.textContent = 'Error: No file pending or not logged in.';
            uploadStatus.style.color = 'red';
            return;
        }

        try {
            saveVisibilityBtn.disabled = true;
            saveVisibilityBtn.textContent = 'Uploading...';

            // First, save visibility settings to Firestore BEFORE upload
            // This way the cloud function can read them when processing
            const visibilityToSave = {};
            extractedBooks.forEach(book => {
                // Check if there's a pending change, otherwise default based on mode
                if (visibilityChanges[book.id]) {
                    visibilityToSave[book.id] = visibilityChanges[book.id];
                } else if (selectedMode === 'private') {
                    visibilityToSave[book.id] = 'private';
                } else {
                    visibilityToSave[book.id] = 'normal';
                }
            });

            // Save visibility settings to Firestore
            if (window.bookVisibilityManager) {
                await window.bookVisibilityManager.bulkSetVisibility(currentUser.uid, visibilityToSave);
                console.log('[Upload] Visibility settings saved before upload:', visibilityToSave);
            }

            // Now proceed with the actual upload
            isPreviewMode = false;
            await uploadToCloud(pendingFile);

            // Reset state
            pendingFile = null;
            extractedBooks = [];
            visibilityChanges = {};

        } catch (error) {
            console.error('[Upload] Error during confirm and upload:', error);
            saveVisibilityBtn.disabled = false;
            saveVisibilityBtn.textContent = 'Error - Try Again';
            uploadStatus.textContent = `Error: ${error.message}`;
            uploadStatus.style.color = 'red';
        }
    }


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

        onSnapshot(statusRef, async (docSnap) => {
            if (docSnap.exists()) {
                const statusData = docSnap.data();
                uploadStatus.innerHTML = '';

                const message = document.createElement('p');
                if (statusData.status === 'success') {
                    message.textContent = `Successfully processed ${statusData.bookCount} books, ${statusData.highlightCount} highlights and ${statusData.wordCount} words.`;
                    message.style.color = 'green';
                    message.style.fontWeight = 'bold';
                    uploadStatus.appendChild(message);

                    // Add review prompt
                    const reviewNote = document.createElement('p');
                    reviewNote.innerHTML = '👇 <strong>Review your books below</strong> and set visibility before going to your profile.';
                    reviewNote.style.color = '#666';
                    reviewNote.style.marginTop = '10px';
                    uploadStatus.appendChild(reviewNote);

                    // Reload book list to show newly processed books
                    await loadUserBooks(userId);

                    // Add "Go to Profile" button AFTER the book management section
                    const existingProfileBtn = document.getElementById('go-to-profile');
                    if (!existingProfileBtn) {
                        const profileButton = document.createElement('button');
                        profileButton.textContent = 'Done - Go to Your Profile';
                        profileButton.id = 'go-to-profile';
                        profileButton.className = 'btn-primary';
                        profileButton.style.marginTop = '20px';
                        profileButton.style.display = 'block';
                        profileButton.style.width = '100%';
                        profileButton.style.maxWidth = '300px';
                        profileButton.style.marginLeft = 'auto';
                        profileButton.style.marginRight = 'auto';
                        profileButton.onclick = () => {
                            window.location.href = `/user/${userId}`;
                        };
                        // Add button after save visibility button
                        bookManagementSection.appendChild(profileButton);
                    }

                } else if (statusData.status === 'no_highlights') {
                    message.textContent = 'Processing complete. No new highlights were found.';
                    message.style.color = 'orange';
                    uploadStatus.appendChild(message);
                } else if (statusData.status === 'error') {
                    message.textContent = `An error occurred: ${statusData.error}`;
                    message.style.color = 'red';
                    uploadStatus.appendChild(message);
                }
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

    // ==================== Book Visibility Management ====================

    /**
     * Load user's books from Firestore
     */
    async function loadUserBooks(userId) {
        try {
            console.log('[Upload] loadUserBooks called for userId:', userId);
            bookListContainer.innerHTML = '<div class="loading-books"><i class="fas fa-spinner fa-spin"></i> Loading your books...</div>';

            // Get books from Firestore
            console.log('[Upload] Fetching books from Firestore...');
            const booksQuery = query(collection(db, "users", userId, "books"));
            const booksSnapshot = await getDocs(booksQuery);
            console.log('[Upload] Found', booksSnapshot.docs.length, 'books');

            // Get highlight counts per book
            console.log('[Upload] Fetching highlights...');
            const highlightsQuery = query(collection(db, "users", userId, "highlights"));
            const highlightsSnapshot = await getDocs(highlightsQuery);
            console.log('[Upload] Found', highlightsSnapshot.docs.length, 'highlights');

            const highlightCounts = {};
            highlightsSnapshot.forEach(doc => {
                const data = doc.data();
                const bookId = data.book_id;
                highlightCounts[bookId] = (highlightCounts[bookId] || 0) + 1;
            });

            // Build book list
            userBooks = [];
            booksSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                userBooks.push({
                    id: docSnap.id,
                    title: data.title || 'Untitled',
                    timeSpent: data.time_spent_reading || 0,
                    percentRead: data.percent_read || 0,
                    highlightCount: highlightCounts[docSnap.id] || 0,
                    dateLastRead: data.date_last_read
                });
            });

            // Sort by date last read (most recent first)
            userBooks.sort((a, b) => {
                if (!a.dateLastRead) return 1;
                if (!b.dateLastRead) return -1;
                return new Date(b.dateLastRead) - new Date(a.dateLastRead);
            });

            // Load current visibility settings
            if (window.bookVisibilityManager) {
                await window.bookVisibilityManager.getBookVisibility(userId);
            }

            // If private mode, auto-select all books as private
            const autoPrivate = selectedMode === 'private';
            renderBookList(autoPrivate);

        } catch (error) {
            console.error('[Upload] Error loading books:', error);
            bookListContainer.innerHTML = '<div class="no-books-message">Error loading books. Please try again.</div>';
        }
    }

    /**
     * Render the book list with visibility toggles
     * @param {boolean} autoPrivate - If true, auto-select all books as private (for private mode)
     */
    function renderBookList(autoPrivate = false) {
        if (userBooks.length === 0) {
            bookListContainer.innerHTML = '<div class="no-books-message">No books found. Upload a file to get started!</div>';
            if (bulkActionsContainer) bulkActionsContainer.style.display = 'none';
            return;
        }

        // Show bulk actions when there are books
        if (bulkActionsContainer) {
            bulkActionsContainer.style.display = 'block';
        }

        // Update mode message
        if (visibilityModeMessage) {
            if (selectedMode === 'private') {
                visibilityModeMessage.innerHTML = '🔐 <strong>Private Mode</strong> - All books are marked private by default. Review and adjust if needed.';
                visibilityModeMessage.className = 'mode-message-private';
            } else if (selectedMode === 'public') {
                visibilityModeMessage.innerHTML = '🌍 <strong>Public Mode</strong> - Choose which books to keep private or exclude.';
                visibilityModeMessage.className = 'mode-message-public';
            } else {
                visibilityModeMessage.textContent = 'Control which books and their highlights are visible';
                visibilityModeMessage.className = '';
            }
        }

        bookListContainer.innerHTML = '';

        userBooks.forEach(book => {
            // For private mode with autoPrivate, default all to private
            let currentStatus = window.bookVisibilityManager?.getStatus(book.id) || 'normal';

            // If autoPrivate is true and no existing status, set to private
            if (autoPrivate && currentStatus === 'normal') {
                currentStatus = 'private';
                visibilityChanges[book.id] = 'private';
            }

            const isPrivate = currentStatus === 'private';
            const isExcluded = currentStatus === 'excluded';

            const bookItem = document.createElement('div');
            bookItem.className = 'book-item';
            bookItem.dataset.bookId = book.id;

            // Format time spent
            const hours = Math.floor(book.timeSpent / 3600);
            const minutes = Math.floor((book.timeSpent % 3600) / 60);
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

            bookItem.innerHTML = `
                <div class="book-info">
                    <div class="book-title" title="${book.title}">${book.title}</div>
                    <div class="book-stats">
                        ${book.highlightCount} highlights • ${timeStr} reading time • ${Math.round(book.percentRead)}% read
                    </div>
                </div>
                <div class="visibility-toggles">
                    <label class="toggle-group">
                        <input type="checkbox" class="private-toggle" data-book-id="${book.id}" ${isPrivate ? 'checked' : ''}>
                        <span>Private</span>
                    </label>
                    <label class="toggle-group">
                        <input type="checkbox" class="exclude-toggle" data-book-id="${book.id}" ${isExcluded ? 'checked' : ''}>
                        <span>Exclude</span>
                    </label>
                </div>
            `;

            bookListContainer.appendChild(bookItem);
        });

        // Add event listeners for toggles
        bookListContainer.querySelectorAll('.private-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => handleVisibilityToggle(e, 'private'));
        });

        bookListContainer.querySelectorAll('.exclude-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => handleVisibilityToggle(e, 'excluded'));
        });

        // If autoPrivate was triggered, enable save button
        if (autoPrivate && Object.keys(visibilityChanges).length > 0) {
            hasChanges = true;
            saveVisibilityBtn.disabled = false;
            if (selectAllPrivate) selectAllPrivate.checked = true;
        }

        // Update bulk selection checkboxes state
        updateBulkCheckboxState();
    }

    /**
     * Update the bulk selection checkboxes based on current toggles state
     */
    function updateBulkCheckboxState() {
        if (!selectAllPrivate || !selectAllExclude) return;

        const allPrivateToggles = document.querySelectorAll('.private-toggle');
        const allExcludeToggles = document.querySelectorAll('.exclude-toggle');

        const allPrivateChecked = allPrivateToggles.length > 0 &&
            Array.from(allPrivateToggles).every(t => t.checked);
        const allExcludeChecked = allExcludeToggles.length > 0 &&
            Array.from(allExcludeToggles).every(t => t.checked);

        selectAllPrivate.checked = allPrivateChecked;
        selectAllExclude.checked = allExcludeChecked;
    }

    /**
     * Handle bulk selection toggle
     */
    function handleBulkToggle(type, isChecked) {
        const privateToggles = document.querySelectorAll('.private-toggle');
        const excludeToggles = document.querySelectorAll('.exclude-toggle');

        if (type === 'private') {
            privateToggles.forEach(toggle => {
                toggle.checked = isChecked;
                visibilityChanges[toggle.dataset.bookId] = isChecked ? 'private' : 'normal';
            });
            // If checking private, uncheck all exclude
            if (isChecked) {
                excludeToggles.forEach(toggle => toggle.checked = false);
                if (selectAllExclude) selectAllExclude.checked = false;
            }
        } else if (type === 'excluded') {
            excludeToggles.forEach(toggle => {
                toggle.checked = isChecked;
                visibilityChanges[toggle.dataset.bookId] = isChecked ? 'excluded' : 'normal';
            });
            // If checking exclude, uncheck all private
            if (isChecked) {
                privateToggles.forEach(toggle => toggle.checked = false);
                if (selectAllPrivate) selectAllPrivate.checked = false;
            }
        }

        hasChanges = true;
        saveVisibilityBtn.disabled = false;
        saveVisibilityBtn.textContent = 'Save Changes';
    }

    // Bulk selection event listeners
    if (selectAllPrivate) {
        selectAllPrivate.addEventListener('change', (e) => handleBulkToggle('private', e.target.checked));
    }
    if (selectAllExclude) {
        selectAllExclude.addEventListener('change', (e) => handleBulkToggle('excluded', e.target.checked));
    }

    /**
     * Handle visibility toggle change
     */
    function handleVisibilityToggle(event, type) {
        const bookId = event.target.dataset.bookId;
        const isChecked = event.target.checked;
        const bookItem = event.target.closest('.book-item');

        // If checking this toggle, uncheck the other
        if (isChecked) {
            const otherToggle = bookItem.querySelector(
                type === 'private' ? '.exclude-toggle' : '.private-toggle'
            );
            if (otherToggle) {
                otherToggle.checked = false;
            }
            visibilityChanges[bookId] = type;
        } else {
            visibilityChanges[bookId] = 'normal';
        }

        // Enable save button
        hasChanges = true;
        saveVisibilityBtn.disabled = false;
        saveVisibilityBtn.textContent = 'Save Changes';

        // Update bulk checkbox state
        updateBulkCheckboxState();
    }

    /**
     * Save visibility changes to Firestore
     */
    async function saveVisibilityChanges() {
        if (!currentUser || !hasChanges) return;

        try {
            saveVisibilityBtn.disabled = true;
            saveVisibilityBtn.textContent = 'Saving...';

            // Get current visibility and merge with changes
            const currentVisibility = await window.bookVisibilityManager.getBookVisibility(currentUser.uid);
            const mergedVisibility = { ...currentVisibility, ...visibilityChanges };

            // Save to Firestore
            await window.bookVisibilityManager.bulkSetVisibility(currentUser.uid, mergedVisibility);

            // Reset state
            visibilityChanges = {};
            hasChanges = false;
            saveVisibilityBtn.textContent = '✓ Saved!';

            // Track analytics
            if (analytics) {
                logEvent(analytics, 'update_book_visibility', {
                    changes_count: Object.keys(visibilityChanges).length
                });
            }

            setTimeout(() => {
                saveVisibilityBtn.textContent = 'Save Changes';
                saveVisibilityBtn.disabled = true;
            }, 2000);

        } catch (error) {
            console.error('[Upload] Error saving visibility:', error);
            saveVisibilityBtn.textContent = 'Error - Try Again';
            saveVisibilityBtn.disabled = false;
        }
    }

    // Save button click handler
    if (saveVisibilityBtn) {
        saveVisibilityBtn.addEventListener('click', saveVisibilityChanges);
    }
});

