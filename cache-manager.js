/**
 * Cache Manager for Koby
 * Implements multi-layer caching (memory + localStorage + IndexedDB)
 * to reduce Firestore reads by 80%+
 */

export class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.DB_NAME = 'KobyCache';
        this.DB_VERSION = 1;
        this.STORES = {
            BOOKS: 'books',
            HIGHLIGHTS: 'highlights',
            WORDS: 'words',
            USER_DATA: 'userData'
        };
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores if they don't exist
                if (!db.objectStoreNames.contains(this.STORES.BOOKS)) {
                    db.createObjectStore(this.STORES.BOOKS);
                }
                if (!db.objectStoreNames.contains(this.STORES.HIGHLIGHTS)) {
                    db.createObjectStore(this.STORES.HIGHLIGHTS);
                }
                if (!db.objectStoreNames.contains(this.STORES.WORDS)) {
                    db.createObjectStore(this.STORES.WORDS);
                }
                if (!db.objectStoreNames.contains(this.STORES.USER_DATA)) {
                    db.createObjectStore(this.STORES.USER_DATA);
                }
            };
        });
    }

    /**
     * Get data with multi-layer caching
     * @param {string} key - Cache key
     * @param {function} fetchFn - Function to fetch data if not in cache
     * @param {number} ttl - Time to live in milliseconds (default: 1 hour)
     * @returns {Promise<any>}
     */
    async get(key, fetchFn, ttl = 3600000) {
        // 1. Check memory cache
        if (this.memoryCache.has(key)) {
            const { data, expires } = this.memoryCache.get(key);
            if (Date.now() < expires) {
                console.log(`[Cache] Memory hit: ${key}`);
                return data;
            } else {
                this.memoryCache.delete(key);
            }
        }

        // 2. Check localStorage (faster than IndexedDB for small data)
        try {
            const localData = localStorage.getItem(`koby_cache_${key}`);
            if (localData) {
                const { data, expires } = JSON.parse(localData);
                if (Date.now() < expires) {
                    console.log(`[Cache] localStorage hit: ${key}`);
                    // Store in memory for faster subsequent access
                    this.memoryCache.set(key, { data, expires });
                    return data;
                }
            }
        } catch (e) {
            console.warn('[Cache] localStorage error:', e);
        }

        // 3. Check IndexedDB (for larger datasets)
        const cachedData = await this.getFromIndexedDB(key);
        if (cachedData && Date.now() < cachedData.expires) {
            console.log(`[Cache] IndexedDB hit: ${key}`);
            this.memoryCache.set(key, cachedData);
            return cachedData.data;
        }

        // 4. Fetch fresh data
        console.log(`[Cache] Miss: ${key} - fetching fresh data`);
        const data = await fetchFn();
        const expires = Date.now() + ttl;

        // Store in all cache layers
        await this.set(key, data, expires);

        return data;
    }

    /**
     * Set data in all cache layers
     */
    async set(key, data, expires) {
        const cacheEntry = { data, expires };

        // Memory cache
        this.memoryCache.set(key, cacheEntry);

        // localStorage (for smaller data < 5MB)
        try {
            const serialized = JSON.stringify(cacheEntry);
            if (serialized.length < 5 * 1024 * 1024) { // 5MB limit
                localStorage.setItem(`koby_cache_${key}`, serialized);
            }
        } catch (e) {
            console.warn('[Cache] localStorage set failed:', e);
        }

        // IndexedDB (for larger data)
        await this.setInIndexedDB(key, cacheEntry);
    }

    /**
     * Get data from IndexedDB
     */
    async getFromIndexedDB(key) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.USER_DATA], 'readonly');
            const store = transaction.objectStore(this.STORES.USER_DATA);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Set data in IndexedDB
     */
    async setInIndexedDB(key, value) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.USER_DATA], 'readwrite');
            const store = transaction.objectStore(this.STORES.USER_DATA);
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Invalidate cache for a specific key or pattern
     */
    async invalidate(pattern) {
        console.log(`[Cache] Invalidating: ${pattern}`);

        // Clear memory cache
        if (pattern === '*') {
            this.memoryCache.clear();
        } else {
            for (const key of this.memoryCache.keys()) {
                if (key.includes(pattern)) {
                    this.memoryCache.delete(key);
                }
            }
        }

        // Clear localStorage
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith('koby_cache_') && (pattern === '*' || key.includes(pattern))) {
                localStorage.removeItem(key);
            }
        }

        // Clear IndexedDB (more complex, skip for now or implement full clear)
    }

    /**
     * Clear all caches
     */
    async clearAll() {
        console.log('[Cache] Clearing all caches');

        // Clear memory
        this.memoryCache.clear();

        // Clear localStorage
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith('koby_cache_')) {
                localStorage.removeItem(key);
            }
        }

        // Clear IndexedDB
        if (this.db) {
            const transaction = this.db.transaction([this.STORES.USER_DATA], 'readwrite');
            const store = transaction.objectStore(this.STORES.USER_DATA);
            store.clear();
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const memorySize = this.memoryCache.size;

        let localStorageSize = 0;
        let localStorageCount = 0;
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith('koby_cache_')) {
                localStorageCount++;
                try {
                    localStorageSize += localStorage.getItem(key).length;
                } catch (e) {
                    // ignore
                }
            }
        }

        return {
            memory: {
                count: memorySize,
                keys: Array.from(this.memoryCache.keys())
            },
            localStorage: {
                count: localStorageCount,
                size: `${(localStorageSize / 1024).toFixed(2)} KB`
            }
        };
    }
}

// Singleton instance
export const cacheManager = new CacheManager();
