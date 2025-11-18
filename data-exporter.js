/**
 * Data Exporter for Koby
 * GDPR-compliant data export in JSON and CSV formats
 */

import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class DataExporter {
    constructor() {
        this.db = getFirestore();
    }

    /**
     * Export all user data as ZIP containing JSON and CSV files
     */
    async exportAllData(userId) {
        try {
            console.log('[DataExporter] Starting data export for user:', userId);

            // Fetch all user data
            const userData = await this.fetchAllUserData(userId);

            // Create ZIP file with multiple formats
            const zip = new JSZip();

            // Add JSON export
            zip.file('koby-data.json', JSON.stringify(userData, null, 2));

            // Add CSV exports
            zip.file('books.csv', this.convertToCSV(userData.books, 'books'));
            zip.file('highlights.csv', this.convertToCSV(userData.highlights, 'highlights'));
            zip.file('words.csv', this.convertToCSV(userData.words, 'words'));

            // Add README
            zip.file('README.txt', this.generateReadme(userData));

            // Generate and download ZIP
            const blob = await zip.generateAsync({ type: 'blob' });
            this.downloadBlob(blob, `koby-data-export-${Date.now()}.zip`);

            console.log('[DataExporter] Export complete');
            return { success: true, stats: this.getExportStats(userData) };
        } catch (error) {
            console.error('[DataExporter] Export failed:', error);
            throw error;
        }
    }

    /**
     * Fetch all user data from Firestore
     */
    async fetchAllUserData(userId) {
        const data = {
            exportedAt: new Date().toISOString(),
            userId: userId,
            books: [],
            highlights: [],
            words: [],
            profile: null,
            settings: null
        };

        try {
            // Fetch books
            const booksSnapshot = await getDocs(collection(this.db, 'users', userId, 'books'));
            data.books = booksSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Fetch highlights
            const highlightsSnapshot = await getDocs(collection(this.db, 'users', userId, 'highlights'));
            data.highlights = highlightsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Fetch words
            const wordsSnapshot = await getDocs(collection(this.db, 'users', userId, 'words'));
            data.words = wordsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Fetch user profile
            const userDoc = await getDocs(collection(this.db, 'users'));
            const currentUserDoc = userDoc.docs.find(doc => doc.id === userId);
            if (currentUserDoc) {
                data.profile = currentUserDoc.data();
            }

            // Fetch privacy settings
            try {
                const settingsSnapshot = await getDocs(collection(this.db, 'users', userId, 'settings'));
                const privacyDoc = settingsSnapshot.docs.find(doc => doc.id === 'privacy');
                if (privacyDoc) {
                    data.settings = privacyDoc.data();
                }
            } catch (e) {
                console.log('[DataExporter] No settings found:', e);
            }

            console.log('[DataExporter] Fetched data:', {
                books: data.books.length,
                highlights: data.highlights.length,
                words: data.words.length
            });

            return data;
        } catch (error) {
            console.error('[DataExporter] Error fetching data:', error);
            throw error;
        }
    }

    /**
     * Convert data array to CSV format
     */
    convertToCSV(dataArray, type) {
        if (!dataArray || dataArray.length === 0) {
            return 'No data available';
        }

        // Get all unique keys from all objects
        const allKeys = new Set();
        dataArray.forEach(item => {
            Object.keys(item).forEach(key => allKeys.add(key));
        });

        const headers = Array.from(allKeys);

        // Create CSV header
        let csv = headers.map(h => this.escapeCsvValue(h)).join(',') + '\n';

        // Create CSV rows
        dataArray.forEach(item => {
            const row = headers.map(header => {
                const value = item[header];
                return this.escapeCsvValue(value);
            });
            csv += row.join(',') + '\n';
        });

        return csv;
    }

    /**
     * Escape CSV value (handle quotes, commas, newlines)
     */
    escapeCsvValue(value) {
        if (value === null || value === undefined) {
            return '';
        }

        // Convert to string
        let str = String(value);

        // If contains comma, newline, or quote, wrap in quotes and escape existing quotes
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            str = '"' + str.replace(/"/g, '""') + '"';
        }

        return str;
    }

    /**
     * Generate README file for export
     */
    generateReadme(userData) {
        return `KOBY DATA EXPORT
================

Exported: ${userData.exportedAt}
User ID: ${userData.userId}

This ZIP file contains all your data from Koby in both JSON and CSV formats.

FILES INCLUDED:
--------------
- koby-data.json: Complete data export in JSON format
- books.csv: Your book collection
- highlights.csv: All your highlights and annotations
- words.csv: Your vocabulary words
- README.txt: This file

STATISTICS:
-----------
- Total Books: ${userData.books.length}
- Total Highlights: ${userData.highlights.length}
- Total Vocabulary Words: ${userData.words.length}

DATA FORMATS:
------------

JSON Format (koby-data.json):
- Complete structured data
- Can be imported into other applications
- Includes all metadata and relationships

CSV Format (books.csv, highlights.csv, words.csv):
- Spreadsheet-compatible format
- Can be opened in Excel, Google Sheets, etc.
- One file per data type

PRIVACY:
--------
This export contains all your personal data from Koby. Please store it securely.
This data is provided in compliance with GDPR data portability rights.

SUPPORT:
--------
If you have any questions about this export, please contact:
- Email: support@koby.app
- GitHub: https://github.com/SanJoao/kobo

Thank you for using Koby!
`;
    }

    /**
     * Get export statistics
     */
    getExportStats(userData) {
        return {
            totalBooks: userData.books.length,
            totalHighlights: userData.highlights.length,
            totalWords: userData.words.length,
            exportedAt: userData.exportedAt
        };
    }

    /**
     * Download blob as file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Export data as JSON only
     */
    async exportAsJSON(userId) {
        try {
            const userData = await this.fetchAllUserData(userId);
            const json = JSON.stringify(userData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            this.downloadBlob(blob, `koby-data-${Date.now()}.json`);

            return { success: true, stats: this.getExportStats(userData) };
        } catch (error) {
            console.error('[DataExporter] JSON export failed:', error);
            throw error;
        }
    }

    /**
     * Export specific data type as CSV
     */
    async exportAsCSV(userId, dataType) {
        try {
            const userData = await this.fetchAllUserData(userId);

            let data, filename;
            switch (dataType) {
                case 'books':
                    data = userData.books;
                    filename = 'koby-books.csv';
                    break;
                case 'highlights':
                    data = userData.highlights;
                    filename = 'koby-highlights.csv';
                    break;
                case 'words':
                    data = userData.words;
                    filename = 'koby-words.csv';
                    break;
                default:
                    throw new Error('Invalid data type');
            }

            const csv = this.convertToCSV(data, dataType);
            const blob = new Blob([csv], { type: 'text/csv' });
            this.downloadBlob(blob, filename);

            return { success: true };
        } catch (error) {
            console.error('[DataExporter] CSV export failed:', error);
            throw error;
        }
    }
}

// Create global instance
window.dataExporter = new DataExporter();
