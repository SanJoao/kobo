/**
 * Offline Processor for Koby
 * Process Kobo SQLite database entirely in the browser
 * using sql.js (SQLite compiled to WebAssembly)
 */

export class OfflineProcessor {
    constructor() {
        this.db = null;
        this.SQL = null;
        this.data = {
            books: [],
            highlights: [],
            words: []
        };
    }

    /**
     * Initialize sql.js
     */
    async init() {
        if (this.SQL) return; // Already initialized

        try {
            this.SQL = await initSqlJs({
                locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
            });
            console.log('[OfflineProcessor] sql.js initialized');
        } catch (error) {
            console.error('[OfflineProcessor] Failed to initialize sql.js:', error);
            throw new Error('Failed to load SQLite processor. Please refresh the page.');
        }
    }

    /**
     * Process Kobo database file
     */
    async processFile(file, onProgress = null) {
        await this.init();

        try {
            if (onProgress) onProgress({ stage: 'reading', progress: 0 });

            // Read file as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            if (onProgress) onProgress({ stage: 'reading', progress: 20 });

            // Load into sql.js
            this.db = new this.SQL.Database(uint8Array);
            console.log('[OfflineProcessor] Database loaded');

            if (onProgress) onProgress({ stage: 'extracting', progress: 30 });

            // Extract data
            await this.extractBooks(onProgress);
            await this.extractHighlights(onProgress);
            await this.extractWords(onProgress);

            // Store in IndexedDB for persistence (optional)
            if (onProgress) onProgress({ stage: 'saving', progress: 90 });
            await this.saveToIndexedDB();

            if (onProgress) onProgress({ stage: 'complete', progress: 100 });

            return {
                success: true,
                data: this.data,
                stats: {
                    bookCount: this.data.books.length,
                    highlightCount: this.data.highlights.length,
                    wordCount: this.data.words.length
                }
            };
        } catch (error) {
            console.error('[OfflineProcessor] Error processing file:', error);
            throw error;
        } finally {
            // Clean up
            if (this.db) {
                this.db.close();
                this.db = null;
            }
        }
    }

    /**
     * Extract books from database
     */
    async extractBooks(onProgress) {
        const query = `
            SELECT
                ContentID as book_id,
                Title as title,
                TimeSpentReading as time_spent_reading,
                ___PercentRead as percent_read,
                WordCount as word_count,
                Series as series,
                SeriesNumber as series_number,
                Description as description,
                AverageRating as average_rating,
                RatingCount as rating_count,
                DateLastRead as date_last_read
            FROM content
            WHERE ContentType = 6
        `;

        try {
            const result = this.db.exec(query);

            if (result.length === 0 || !result[0].values) {
                this.data.books = [];
                return;
            }

            const columns = result[0].columns;
            const rows = result[0].values;

            this.data.books = rows.map(row => {
                const book = {};
                columns.forEach((col, idx) => {
                    book[col] = row[idx];
                });
                // Sanitize book_id
                if (book.book_id) {
                    book.doc_id = book.book_id.replace(/\//g, '__');
                }
                return book;
            });

            console.log(`[OfflineProcessor] Extracted ${this.data.books.length} books`);
            if (onProgress) onProgress({ stage: 'extracting', progress: 50 });
        } catch (error) {
            console.error('[OfflineProcessor] Error extracting books:', error);
            this.data.books = [];
        }
    }

    /**
     * Extract highlights from database
     */
    async extractHighlights(onProgress) {
        // Check if Color column exists
        let hasColorColumn = true;
        try {
            this.db.exec("SELECT Color FROM Bookmark LIMIT 1");
        } catch (e) {
            if (e.message.includes("no such column: Color")) {
                hasColorColumn = false;
                console.log('[OfflineProcessor] Color column not found, using default');
            }
        }

        const query = hasColorColumn
            ? `SELECT VolumeID AS book_id, Text AS text, Annotation AS annotation,
                      DateCreated AS date_created, Type AS type, Color AS color
               FROM Bookmark
               WHERE Type = 'highlight' OR Type = 'note'`
            : `SELECT VolumeID AS book_id, Text AS text, Annotation AS annotation,
                      DateCreated AS date_created, Type AS type
               FROM Bookmark
               WHERE Type = 'highlight' OR Type = 'note'`;

        try {
            const result = this.db.exec(query);

            if (result.length === 0 || !result[0].values) {
                this.data.highlights = [];
                return;
            }

            const columns = result[0].columns;
            const rows = result[0].values;

            this.data.highlights = rows.map(row => {
                const highlight = {};
                columns.forEach((col, idx) => {
                    highlight[col] = row[idx];
                });

                // Set default color if not present
                if (!hasColorColumn || highlight.color === null) {
                    highlight.color = 0; // Yellow
                }

                // Sanitize book_id
                if (highlight.book_id) {
                    highlight.book_id = highlight.book_id.replace(/\//g, '__');
                }

                // Match highlight with book title
                const book = this.data.books.find(b => b.doc_id === highlight.book_id);
                if (book) {
                    highlight.book_title = book.title;
                    highlight.author = book.author;
                }

                return highlight;
            });

            console.log(`[OfflineProcessor] Extracted ${this.data.highlights.length} highlights`);
            if (onProgress) onProgress({ stage: 'extracting', progress: 70 });
        } catch (error) {
            console.error('[OfflineProcessor] Error extracting highlights:', error);
            this.data.highlights = [];
        }
    }

    /**
     * Extract vocabulary words from database
     */
    async extractWords(onProgress) {
        const query = `SELECT Text, DateCreated, VolumeId FROM WordList`;

        try {
            const result = this.db.exec(query);

            if (result.length === 0 || !result[0].values) {
                this.data.words = [];
                return;
            }

            const columns = result[0].columns;
            const rows = result[0].values;

            this.data.words = rows.map(row => {
                const word = {};
                columns.forEach((col, idx) => {
                    word[col] = row[idx];
                });

                // Try to extract book title from VolumeId
                if (word.VolumeId) {
                    try {
                        const url = new URL(word.VolumeId);
                        const filename = decodeURIComponent(url.pathname.split('/').pop());
                        word.BookTitle = filename.replace(/\.[^/.]+$/, ''); // Remove extension
                    } catch (e) {
                        word.BookTitle = 'Unknown Book';
                    }
                }

                return word;
            });

            console.log(`[OfflineProcessor] Extracted ${this.data.words.length} words`);
            if (onProgress) onProgress({ stage: 'extracting', progress: 85 });
        } catch (error) {
            console.error('[OfflineProcessor] Error extracting words:', error);
            this.data.words = [];
        }
    }

    /**
     * Save extracted data to IndexedDB for persistence
     */
    async saveToIndexedDB() {
        const dbName = 'KobyOfflineDB';
        const storeName = 'offlineData';

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };

            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);

                store.put(this.data.books, 'books');
                store.put(this.data.highlights, 'highlights');
                store.put(this.data.words, 'words');
                store.put(Date.now(), 'lastUpdated');
                store.put('offline', 'mode'); // Flag that this is offline data

                transaction.oncomplete = () => {
                    console.log('[OfflineProcessor] Data saved to IndexedDB');
                    resolve();
                };

                transaction.onerror = () => {
                    console.error('[OfflineProcessor] Error saving to IndexedDB:', transaction.error);
                    reject(transaction.error);
                };
            };

            request.onerror = () => {
                console.error('[OfflineProcessor] Error opening IndexedDB:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Load data from IndexedDB
     */
    async loadFromIndexedDB() {
        const dbName = 'KobyOfflineDB';
        const storeName = 'offlineData';

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);

            request.onsuccess = (event) => {
                const db = event.target.result;

                // Check if store exists
                if (!db.objectStoreNames.contains(storeName)) {
                    resolve(null);
                    return;
                }

                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);

                const booksReq = store.get('books');
                const highlightsReq = store.get('highlights');
                const wordsReq = store.get('words');
                const lastUpdatedReq = store.get('lastUpdated');

                transaction.oncomplete = () => {
                    if (booksReq.result && highlightsReq.result) {
                        const data = {
                            books: booksReq.result,
                            highlights: highlightsReq.result,
                            words: wordsReq.result || [],
                            lastUpdated: lastUpdatedReq.result
                        };
                        console.log('[OfflineProcessor] Data loaded from IndexedDB');
                        resolve(data);
                    } else {
                        resolve(null);
                    }
                };

                transaction.onerror = () => {
                    reject(transaction.error);
                };
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Clear offline data from IndexedDB
     */
    async clearOfflineData() {
        const dbName = 'KobyOfflineDB';

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(dbName);

            request.onsuccess = () => {
                console.log('[OfflineProcessor] Offline data cleared');
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Create global instance
window.offlineProcessor = new OfflineProcessor();
