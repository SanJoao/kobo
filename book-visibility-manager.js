/**
 * Book Visibility Manager
 * Handles book visibility settings: normal, private, excluded
 * - normal: visible to everyone
 * - private: visible only to owner
 * - excluded: hidden everywhere
 */

import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db, auth } from "./firebase-init.js";

class BookVisibilityManager {
    constructor() {
        this.visibilityCache = null;
        this.userId = null;
    }

    /**
     * Get visibility settings for all books
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Map of bookId -> visibility status
     */
    async getBookVisibility(userId) {
        if (this.visibilityCache && this.userId === userId) {
            return this.visibilityCache;
        }

        try {
            const docRef = doc(db, "users", userId, "settings", "book-visibility");
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                this.visibilityCache = docSnap.data();
                this.userId = userId;
                return this.visibilityCache;
            }

            return {};
        } catch (error) {
            console.error("[BookVisibilityManager] Error fetching visibility:", error);
            return {};
        }
    }

    /**
     * Set visibility for a single book
     * @param {string} userId - User ID
     * @param {string} bookId - Book ID (sanitized)
     * @param {string} status - 'normal', 'private', or 'excluded'
     */
    async setBookVisibility(userId, bookId, status) {
        try {
            const visibility = await this.getBookVisibility(userId);

            if (status === 'normal') {
                // Remove from settings if normal (default)
                delete visibility[bookId];
            } else {
                visibility[bookId] = status;
            }

            const docRef = doc(db, "users", userId, "settings", "book-visibility");
            await setDoc(docRef, visibility);

            // Update cache
            this.visibilityCache = visibility;

            console.log(`[BookVisibilityManager] Set ${bookId} to ${status}`);
        } catch (error) {
            console.error("[BookVisibilityManager] Error setting visibility:", error);
            throw error;
        }
    }

    /**
     * Bulk update visibility for multiple books
     * @param {string} userId - User ID
     * @param {Object} visibilityMap - Map of bookId -> status
     */
    async bulkSetVisibility(userId, visibilityMap) {
        try {
            // Clean up: remove 'normal' entries
            const cleaned = {};
            for (const [bookId, status] of Object.entries(visibilityMap)) {
                if (status !== 'normal') {
                    cleaned[bookId] = status;
                }
            }

            const docRef = doc(db, "users", userId, "settings", "book-visibility");
            await setDoc(docRef, cleaned);

            // Update cache
            this.visibilityCache = cleaned;
            this.userId = userId;

            console.log("[BookVisibilityManager] Bulk visibility update complete");
        } catch (error) {
            console.error("[BookVisibilityManager] Error in bulk update:", error);
            throw error;
        }
    }

    /**
     * Get visibility status for a single book
     * @param {string} bookId - Book ID
     * @returns {string} 'normal', 'private', or 'excluded'
     */
    getStatus(bookId) {
        if (!this.visibilityCache) return 'normal';
        return this.visibilityCache[bookId] || 'normal';
    }

    /**
     * Filter books based on visibility settings
     * @param {Array} books - Array of book objects
     * @param {boolean} isOwner - Whether current user is the owner
     * @param {boolean} includePrivate - Whether to include private books (only for owner)
     * @returns {Array} Filtered books
     */
    filterBooks(books, isOwner, includePrivate = true) {
        return books.filter(book => {
            const bookId = book.doc_id || book.book_id?.replace(/\//g, '__');
            const status = this.getStatus(bookId);

            if (status === 'excluded') {
                return false; // Never show excluded
            }

            if (status === 'private') {
                return isOwner && includePrivate;
            }

            return true; // normal
        });
    }

    /**
     * Filter highlights based on their book's visibility
     * @param {Array} highlights - Array of highlight objects  
     * @param {boolean} isOwner - Whether current user is the owner
     * @param {boolean} includePrivate - Whether to include private highlights
     * @returns {Array} Filtered highlights
     */
    filterHighlights(highlights, isOwner, includePrivate = true) {
        return highlights.filter(h => {
            const bookId = h.book_id;
            const status = this.getStatus(bookId);

            if (status === 'excluded') {
                return false;
            }

            if (status === 'private') {
                return isOwner && includePrivate;
            }

            return true;
        });
    }

    /**
     * Clear cache (call when user changes)
     */
    clearCache() {
        this.visibilityCache = null;
        this.userId = null;
    }

    // ==================== IndexedDB Support for Offline Mode ====================

    /**
     * Save visibility to IndexedDB (for offline mode)
     * @param {Object} visibilityMap - Map of bookId -> status
     */
    async saveToIndexedDB(visibilityMap) {
        const dbName = 'KobyOfflineDB';
        const storeName = 'offlineData';

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);

                store.put(visibilityMap, 'bookVisibility');

                transaction.oncomplete = () => {
                    console.log('[BookVisibilityManager] Saved to IndexedDB');
                    resolve();
                };

                transaction.onerror = () => reject(transaction.error);
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load visibility from IndexedDB (for offline mode)
     * @returns {Promise<Object>} Map of bookId -> status
     */
    async loadFromIndexedDB() {
        const dbName = 'KobyOfflineDB';
        const storeName = 'offlineData';

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onsuccess = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(storeName)) {
                    resolve({});
                    return;
                }

                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const getRequest = store.get('bookVisibility');

                getRequest.onsuccess = () => {
                    const visibility = getRequest.result || {};
                    this.visibilityCache = visibility;
                    console.log('[BookVisibilityManager] Loaded from IndexedDB');
                    resolve(visibility);
                };

                getRequest.onerror = () => reject(getRequest.error);
            };

            request.onerror = () => reject(request.error);
        });
    }
}

// Create global instance immediately
const bookVisibilityManager = new BookVisibilityManager();
window.bookVisibilityManager = bookVisibilityManager;
console.log('[BookVisibilityManager] Initialized and attached to window');
export { BookVisibilityManager, bookVisibilityManager };
