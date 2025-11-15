/**
 * Search Manager for Koby
 * Handles search across highlights, users, groups, and books
 */

import { getFirestore, collection, query, where, orderBy, limit, getDocs, collectionGroup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export class SearchManager {
    constructor() {
        this.db = getFirestore();
        this.auth = getAuth();
        this.searchCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Search highlights by text content, book title, or author
     */
    async searchHighlights(searchTerm, limitCount = 20) {
        try {
            console.log('[SearchManager] Searching highlights:', searchTerm);

            const searchLower = searchTerm.toLowerCase();
            const cacheKey = `highlights-${searchLower}-${limitCount}`;

            // Check cache
            if (this.searchCache.has(cacheKey)) {
                const cached = this.searchCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    console.log('[SearchManager] Returning cached results');
                    return cached.data;
                }
            }

            // Firestore doesn't support full-text search, so we need to:
            // 1. Load public highlights
            // 2. Filter client-side

            const highlightsQuery = query(
                collectionGroup(this.db, 'highlights'),
                where('is_public', '==', true),
                orderBy('date_created', 'desc'),
                limit(200) // Load more for better search results
            );

            const snapshot = await getDocs(highlightsQuery);

            const allHighlights = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date_created: doc.data().date_created?.toDate() || new Date()
            }));

            // Client-side filtering
            const filtered = allHighlights.filter(highlight => {
                const text = (highlight.text || '').toLowerCase();
                const title = (highlight.title || '').toLowerCase();
                const author = (highlight.attribution || '').toLowerCase();

                return text.includes(searchLower) ||
                       title.includes(searchLower) ||
                       author.includes(searchLower);
            });

            // Sort by relevance (exact matches first)
            filtered.sort((a, b) => {
                const aText = (a.text || '').toLowerCase();
                const bText = (b.text || '').toLowerCase();
                const aTitle = (a.title || '').toLowerCase();
                const bTitle = (b.title || '').toLowerCase();

                // Exact text match gets highest priority
                const aExactText = aText === searchLower;
                const bExactText = bText === searchLower;
                if (aExactText && !bExactText) return -1;
                if (!aExactText && bExactText) return 1;

                // Title match gets second priority
                const aTitleMatch = aTitle.includes(searchLower);
                const bTitleMatch = bTitle.includes(searchLower);
                if (aTitleMatch && !bTitleMatch) return -1;
                if (!aTitleMatch && bTitleMatch) return 1;

                // Otherwise sort by date
                return b.date_created - a.date_created;
            });

            const results = filtered.slice(0, limitCount);

            // Cache results
            this.searchCache.set(cacheKey, {
                data: results,
                timestamp: Date.now()
            });

            console.log('[SearchManager] Found', results.length, 'highlights');
            return results;

        } catch (error) {
            console.error('[SearchManager] Error searching highlights:', error);
            return [];
        }
    }

    /**
     * Search users by display name
     */
    async searchUsers(searchTerm, limitCount = 20) {
        try {
            console.log('[SearchManager] Searching users:', searchTerm);

            const searchLower = searchTerm.toLowerCase();
            const cacheKey = `users-${searchLower}-${limitCount}`;

            // Check cache
            if (this.searchCache.has(cacheKey)) {
                const cached = this.searchCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    console.log('[SearchManager] Returning cached results');
                    return cached.data;
                }
            }

            // Load all users (in production, use Algolia or similar for better performance)
            const usersQuery = query(
                collection(this.db, 'users'),
                limit(200)
            );

            const snapshot = await getDocs(usersQuery);

            const allUsers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Client-side filtering
            const filtered = allUsers.filter(user => {
                const displayName = (user.displayName || '').toLowerCase();
                return displayName.includes(searchLower);
            });

            // Sort by relevance
            filtered.sort((a, b) => {
                const aName = (a.displayName || '').toLowerCase();
                const bName = (b.displayName || '').toLowerCase();

                // Starts with search term gets priority
                const aStartsWith = aName.startsWith(searchLower);
                const bStartsWith = bName.startsWith(searchLower);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;

                // Exact match
                const aExact = aName === searchLower;
                const bExact = bName === searchLower;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                // Alphabetical
                return aName.localeCompare(bName);
            });

            const results = filtered.slice(0, limitCount);

            // Cache results
            this.searchCache.set(cacheKey, {
                data: results,
                timestamp: Date.now()
            });

            console.log('[SearchManager] Found', results.length, 'users');
            return results;

        } catch (error) {
            console.error('[SearchManager] Error searching users:', error);
            return [];
        }
    }

    /**
     * Search groups by name, description, book, or tags
     */
    async searchGroups(searchTerm, limitCount = 20) {
        try {
            console.log('[SearchManager] Searching groups:', searchTerm);

            const searchLower = searchTerm.toLowerCase();
            const cacheKey = `groups-${searchLower}-${limitCount}`;

            // Check cache
            if (this.searchCache.has(cacheKey)) {
                const cached = this.searchCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    console.log('[SearchManager] Returning cached results');
                    return cached.data;
                }
            }

            // Load public groups
            const groupsQuery = query(
                collection(this.db, 'groups'),
                where('isPrivate', '==', false),
                limit(200)
            );

            const snapshot = await getDocs(groupsQuery);

            const allGroups = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            }));

            // Client-side filtering
            const filtered = allGroups.filter(group => {
                const name = (group.name || '').toLowerCase();
                const description = (group.description || '').toLowerCase();
                const bookTitle = (group.bookTitle || '').toLowerCase();
                const tags = group.tags || [];
                const tagString = tags.join(' ').toLowerCase();

                return name.includes(searchLower) ||
                       description.includes(searchLower) ||
                       bookTitle.includes(searchLower) ||
                       tagString.includes(searchLower);
            });

            // Sort by relevance
            filtered.sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();

                // Name match gets highest priority
                const aNameMatch = aName.includes(searchLower);
                const bNameMatch = bName.includes(searchLower);
                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;

                // Then by member count (popularity)
                return (b.memberCount || 0) - (a.memberCount || 0);
            });

            const results = filtered.slice(0, limitCount);

            // Cache results
            this.searchCache.set(cacheKey, {
                data: results,
                timestamp: Date.now()
            });

            console.log('[SearchManager] Found', results.length, 'groups');
            return results;

        } catch (error) {
            console.error('[SearchManager] Error searching groups:', error);
            return [];
        }
    }

    /**
     * Search books by title
     */
    async searchBooks(searchTerm, limitCount = 20) {
        try {
            console.log('[SearchManager] Searching books:', searchTerm);

            const searchLower = searchTerm.toLowerCase();
            const cacheKey = `books-${searchLower}-${limitCount}`;

            // Check cache
            if (this.searchCache.has(cacheKey)) {
                const cached = this.searchCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTTL) {
                    console.log('[SearchManager] Returning cached results');
                    return cached.data;
                }
            }

            // Load all books across all users
            const booksQuery = query(
                collectionGroup(this.db, 'books'),
                limit(200)
            );

            const snapshot = await getDocs(booksQuery);

            const allBooks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Deduplicate by title (same book might be in multiple users' libraries)
            const uniqueBooks = new Map();
            allBooks.forEach(book => {
                const title = (book.title || '').toLowerCase();
                if (!uniqueBooks.has(title) ||
                    (book.percent_read || 0) > (uniqueBooks.get(title).percent_read || 0)) {
                    uniqueBooks.set(title, book);
                }
            });

            const deduped = Array.from(uniqueBooks.values());

            // Client-side filtering
            const filtered = deduped.filter(book => {
                const title = (book.title || '').toLowerCase();
                return title.includes(searchLower);
            });

            // Sort by relevance
            filtered.sort((a, b) => {
                const aTitle = (a.title || '').toLowerCase();
                const bTitle = (b.title || '').toLowerCase();

                // Starts with search term gets priority
                const aStartsWith = aTitle.startsWith(searchLower);
                const bStartsWith = bTitle.startsWith(searchLower);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;

                // Exact match
                const aExact = aTitle === searchLower;
                const bExact = bTitle === searchLower;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                // Alphabetical
                return aTitle.localeCompare(bTitle);
            });

            const results = filtered.slice(0, limitCount);

            // Cache results
            this.searchCache.set(cacheKey, {
                data: results,
                timestamp: Date.now()
            });

            console.log('[SearchManager] Found', results.length, 'books');
            return results;

        } catch (error) {
            console.error('[SearchManager] Error searching books:', error);
            return [];
        }
    }

    /**
     * Search all content types at once
     */
    async searchAll(searchTerm, limitPerType = 5) {
        try {
            console.log('[SearchManager] Searching all:', searchTerm);

            const [highlights, users, groups, books] = await Promise.all([
                this.searchHighlights(searchTerm, limitPerType),
                this.searchUsers(searchTerm, limitPerType),
                this.searchGroups(searchTerm, limitPerType),
                this.searchBooks(searchTerm, limitPerType)
            ]);

            return {
                highlights,
                users,
                groups,
                books,
                totalResults: highlights.length + users.length + groups.length + books.length
            };

        } catch (error) {
            console.error('[SearchManager] Error in searchAll:', error);
            return {
                highlights: [],
                users: [],
                groups: [],
                books: [],
                totalResults: 0
            };
        }
    }

    /**
     * Clear search cache
     */
    clearCache() {
        console.log('[SearchManager] Clearing search cache');
        this.searchCache.clear();
    }

    /**
     * Get search suggestions (popular searches, recent books, etc.)
     */
    async getSearchSuggestions() {
        try {
            // Get recent popular books
            const booksQuery = query(
                collectionGroup(this.db, 'books'),
                orderBy('date_last_read', 'desc'),
                limit(5)
            );

            const snapshot = await getDocs(booksQuery);
            const recentBooks = snapshot.docs.map(doc => ({
                type: 'book',
                title: doc.data().title || 'Untitled',
                subtitle: 'Recent book'
            }));

            // Deduplicate
            const unique = new Map();
            recentBooks.forEach(book => {
                if (!unique.has(book.title)) {
                    unique.set(book.title, book);
                }
            });

            return Array.from(unique.values()).slice(0, 5);

        } catch (error) {
            console.error('[SearchManager] Error getting suggestions:', error);
            return [];
        }
    }
}

// Create global instance
window.searchManager = new SearchManager();

console.log('[SearchManager] Initialized');
