/**
 * Recommendation Engine for Koby
 * Suggests books based on reading patterns using:
 * - Google Books API
 * - Open Library API
 * - Internal pattern analysis
 */

import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db } from './firebase-init.js';
import { performanceMonitor } from './performance-monitor.js';

export class RecommendationEngine {
    constructor(userId) {
        this.userId = userId;
        this.books = [];
        this.highlights = [];
        this.apiKey = 'AIzaSyAf6QRXDT9Hc9epK0fWmbV6WeJDGIWaoLw'; // Firebase API key, you can reuse or get separate Google Books API key
        this.cache = new Map();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Generate personalized book recommendations
     * @param {number} count - Number of recommendations to return
     * @returns {Promise<Array>} - Array of recommended books
     */
    async getRecommendations(count = 10) {
        await this.loadUserData();

        const recommendations = [];

        // Strategy 1: Based on favorite authors
        const authorRecs = await this.getAuthorBasedRecommendations(Math.ceil(count / 3));
        recommendations.push(...authorRecs);

        // Strategy 2: Based on popular genres
        const genreRecs = await this.getGenreBasedRecommendations(Math.ceil(count / 3));
        recommendations.push(...genreRecs);

        // Strategy 3: Based on highlight themes
        const themeRecs = await this.getThemeBasedRecommendations(Math.ceil(count / 3));
        recommendations.push(...themeRecs);

        // Remove duplicates and limit
        const unique = this.removeDuplicates(recommendations);

        return unique.slice(0, count);
    }

    /**
     * Load user's books and highlights
     */
    async loadUserData() {
        const [booksSnapshot, highlightsSnapshot] = await Promise.all([
            getDocs(collection(db, 'users', this.userId, 'books')),
            getDocs(collection(db, 'users', this.userId, 'highlights'))
        ]);

        this.books = booksSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        this.highlights = highlightsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * Get recommendations based on favorite authors
     */
    async getAuthorBasedRecommendations(count) {
        const authors = this.extractFavoriteAuthors(5);
        const recommendations = [];

        for (const author of authors.slice(0, 2)) {
            try {
                const books = await this.searchGoogleBooks(`author:${author}`, count);
                recommendations.push(...books.map(book => ({
                    ...book,
                    reason: `Because you enjoyed books by ${author}`
                })));
            } catch (error) {
                console.error(`Error fetching books for author ${author}:`, error);
            }
        }

        return recommendations;
    }

    /**
     * Get recommendations based on popular genres
     */
    async getGenreBasedRecommendations(count) {
        const genres = this.extractGenres(3);
        const recommendations = [];

        for (const genre of genres) {
            try {
                const books = await this.searchGoogleBooks(`subject:${genre}`, count);
                recommendations.push(...books.map(book => ({
                    ...book,
                    reason: `Based on your interest in ${genre}`
                })));
            } catch (error) {
                console.error(`Error fetching books for genre ${genre}:`, error);
            }
        }

        return recommendations;
    }

    /**
     * Get recommendations based on highlight themes
     */
    async getThemeBasedRecommendations(count) {
        const themes = this.extractThemes(5);
        const recommendations = [];

        for (const theme of themes.slice(0, 2)) {
            try {
                const books = await this.searchGoogleBooks(theme, count);
                recommendations.push(...books.map(book => ({
                    ...book,
                    reason: `Based on themes in your highlights: ${theme}`
                })));
            } catch (error) {
                console.error(`Error fetching books for theme ${theme}:`, error);
            }
        }

        return recommendations;
    }

    /**
     * Extract favorite authors from books
     */
    extractFavoriteAuthors(limit) {
        const authorCounts = new Map();

        this.books.forEach(book => {
            const author = this.parseAuthor(book.title);
            if (author) {
                authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
            }
        });

        return Array.from(authorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([author]) => author);
    }

    /**
     * Parse author from book title
     */
    parseAuthor(title) {
        if (!title) return null;

        const patterns = [
            / - ([^-]+)$/,           // "Title - Author"
            / by ([^,\(]+)/i,        // "Title by Author"
            /\(([^)]+)\)$/,          // "Title (Author)"
        ];

        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        return null;
    }

    /**
     * Extract genres from book titles/metadata
     */
    extractGenres(limit) {
        // Common genre keywords
        const genreKeywords = [
            'fiction', 'science fiction', 'fantasy', 'mystery', 'thriller',
            'romance', 'horror', 'biography', 'history', 'philosophy',
            'psychology', 'business', 'self-help', 'technology', 'science'
        ];

        const genreCounts = new Map();

        this.books.forEach(book => {
            const title = (book.title || '').toLowerCase();
            const description = (book.description || '').toLowerCase();
            const combined = `${title} ${description}`;

            genreKeywords.forEach(genre => {
                if (combined.includes(genre)) {
                    genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
                }
            });
        });

        return Array.from(genreCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([genre]) => genre);
    }

    /**
     * Extract themes from highlights
     */
    extractThemes(limit) {
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'is', 'was', 'are', 'were', 'been', 'be',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
            'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'said', 'say'
        ]);

        const wordCounts = new Map();

        this.highlights.forEach(h => {
            if (!h.text) return;

            const words = h.text.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 4 && !stopwords.has(w));

            words.forEach(word => {
                wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
            });
        });

        return Array.from(wordCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([word]) => word);
    }

    /**
     * Search Google Books API
     */
    async searchGoogleBooks(query, maxResults = 5) {
        const cacheKey = `google_books_${query}_${maxResults}`;

        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }

        try {
            const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}&orderBy=relevance`;

            const response = await performanceMonitor.trackAPICall(
                'google_books',
                'GET',
                async () => await fetch(url)
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            const books = (data.items || []).map(item => this.parseGoogleBookItem(item));

            // Filter out books user already has
            const filtered = books.filter(book =>
                !this.userHasBook(book.title, book.authors)
            );

            // Cache results
            this.cache.set(cacheKey, {
                data: filtered,
                timestamp: Date.now()
            });

            return filtered;

        } catch (error) {
            console.error('Error searching Google Books:', error);
            return [];
        }
    }

    /**
     * Parse Google Books API item
     */
    parseGoogleBookItem(item) {
        const volumeInfo = item.volumeInfo || {};

        return {
            id: item.id,
            title: volumeInfo.title || 'Unknown Title',
            authors: volumeInfo.authors || ['Unknown Author'],
            description: volumeInfo.description || 'No description available',
            coverUrl: volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail || null,
            publishedDate: volumeInfo.publishedDate || null,
            pageCount: volumeInfo.pageCount || null,
            categories: volumeInfo.categories || [],
            averageRating: volumeInfo.averageRating || null,
            ratingsCount: volumeInfo.ratingsCount || null,
            previewLink: volumeInfo.previewLink || null,
            infoLink: volumeInfo.infoLink || null,
            source: 'Google Books'
        };
    }

    /**
     * Check if user already has a book
     */
    userHasBook(title, authors) {
        const normalizedTitle = this.normalizeString(title);
        const normalizedAuthors = authors.map(a => this.normalizeString(a));

        return this.books.some(book => {
            const bookTitle = this.normalizeString(book.title || '');

            // Check if titles match
            if (this.stringSimilarity(normalizedTitle, bookTitle) > 0.8) {
                return true;
            }

            // Check if author appears in title
            return normalizedAuthors.some(author =>
                bookTitle.includes(author)
            );
        });
    }

    /**
     * Normalize string for comparison
     */
    normalizeString(str) {
        return str.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calculate string similarity (Dice coefficient)
     */
    stringSimilarity(str1, str2) {
        const bigrams1 = this.getBigrams(str1);
        const bigrams2 = this.getBigrams(str2);

        const intersection = bigrams1.filter(b => bigrams2.includes(b));

        return (2 * intersection.length) / (bigrams1.length + bigrams2.length);
    }

    /**
     * Get bigrams from string
     */
    getBigrams(str) {
        const bigrams = [];
        for (let i = 0; i < str.length - 1; i++) {
            bigrams.push(str.slice(i, i + 2));
        }
        return bigrams;
    }

    /**
     * Remove duplicate recommendations
     */
    removeDuplicates(recommendations) {
        const seen = new Set();
        const unique = [];

        recommendations.forEach(rec => {
            const key = this.normalizeString(rec.title + rec.authors.join(''));

            if (!seen.has(key)) {
                seen.add(key);
                unique.push(rec);
            }
        });

        return unique;
    }

    /**
     * Search Open Library API (alternative source)
     */
    async searchOpenLibrary(query, maxResults = 5) {
        const cacheKey = `open_library_${query}_${maxResults}`;

        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
        }

        try {
            const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${maxResults}`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            const books = (data.docs || []).map(doc => this.parseOpenLibraryItem(doc));

            // Filter out books user already has
            const filtered = books.filter(book =>
                !this.userHasBook(book.title, book.authors)
            );

            // Cache results
            this.cache.set(cacheKey, {
                data: filtered,
                timestamp: Date.now()
            });

            return filtered;

        } catch (error) {
            console.error('Error searching Open Library:', error);
            return [];
        }
    }

    /**
     * Parse Open Library API item
     */
    parseOpenLibraryItem(doc) {
        return {
            id: doc.key,
            title: doc.title || 'Unknown Title',
            authors: doc.author_name || ['Unknown Author'],
            description: doc.first_sentence?.join(' ') || 'No description available',
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
            publishedDate: doc.first_publish_year || null,
            pageCount: doc.number_of_pages_median || null,
            categories: doc.subject || [],
            averageRating: doc.ratings_average || null,
            ratingsCount: doc.ratings_count || null,
            infoLink: `https://openlibrary.org${doc.key}`,
            source: 'Open Library'
        };
    }

    /**
     * Get trending books (popular new releases)
     */
    async getTrendingBooks(count = 10) {
        try {
            const currentYear = new Date().getFullYear();
            const books = await this.searchGoogleBooks(
                `subject:fiction&publishedDate:${currentYear}`,
                count * 2
            );

            // Sort by rating and ratings count
            return books
                .filter(b => b.averageRating && b.ratingsCount)
                .sort((a, b) => {
                    const scoreA = (a.averageRating || 0) * Math.log(a.ratingsCount || 1);
                    const scoreB = (b.averageRating || 0) * Math.log(b.ratingsCount || 1);
                    return scoreB - scoreA;
                })
                .slice(0, count)
                .map(book => ({
                    ...book,
                    reason: 'Trending new release'
                }));

        } catch (error) {
            console.error('Error fetching trending books:', error);
            return [];
        }
    }

    /**
     * Get similar books to a specific book
     */
    async getSimilarBooks(bookTitle, count = 5) {
        try {
            const books = await this.searchGoogleBooks(bookTitle, count * 2);

            return books
                .slice(0, count)
                .map(book => ({
                    ...book,
                    reason: `Similar to "${bookTitle}"`
                }));

        } catch (error) {
            console.error('Error fetching similar books:', error);
            return [];
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

/**
 * Wishlist Manager
 * Manages user's book wishlist
 */
export class WishlistManager {
    constructor(userId) {
        this.userId = userId;
        this.wishlistRef = collection(db, 'users', userId, 'wishlist');
    }

    /**
     * Add book to wishlist
     */
    async addToWishlist(book) {
        const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");

        const bookId = this.generateBookId(book.title, book.authors);
        const bookRef = doc(this.wishlistRef, bookId);

        await setDoc(bookRef, {
            ...book,
            addedAt: new Date().toISOString(),
            status: 'to_read'
        });

        return bookId;
    }

    /**
     * Remove book from wishlist
     */
    async removeFromWishlist(bookId) {
        const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");

        const bookRef = doc(this.wishlistRef, bookId);
        await deleteDoc(bookRef);
    }

    /**
     * Get wishlist
     */
    async getWishlist() {
        const snapshot = await getDocs(query(
            this.wishlistRef,
            orderBy('addedAt', 'desc')
        ));

        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    }

    /**
     * Update book status
     */
    async updateStatus(bookId, status) {
        const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js");

        const bookRef = doc(this.wishlistRef, bookId);
        await updateDoc(bookRef, { status });
    }

    /**
     * Generate book ID
     */
    generateBookId(title, authors) {
        const str = `${title}_${authors.join('_')}`.toLowerCase().replace(/[^\w]/g, '_');
        return str.slice(0, 100);
    }
}
