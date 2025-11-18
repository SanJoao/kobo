/**
 * Lazy Loading Manager for Koby
 * Implements efficient infinite scroll and pagination
 * with Intersection Observer API and Firestore cursor-based pagination
 */

import { collection, query, orderBy, limit, startAfter, getDocs, collectionGroup, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { db } from './firebase-init.js';
import { performanceMonitor } from './performance-monitor.js';

export class LazyLoader {
    constructor(config) {
        this.config = {
            pageSize: 20,
            threshold: 0.5,
            rootMargin: '200px',
            ...config
        };

        this.items = [];
        this.lastDoc = null;
        this.loading = false;
        this.hasMore = true;
        this.observer = null;
        this.sentinelElement = null;
    }

    /**
     * Initialize lazy loading with Intersection Observer
     * @param {HTMLElement} container - Container element
     * @param {HTMLElement} sentinel - Sentinel element to observe
     * @param {Function} renderCallback - Function to render new items
     */
    init(container, sentinel, renderCallback) {
        this.container = container;
        this.sentinelElement = sentinel;
        this.renderCallback = renderCallback;

        // Create Intersection Observer
        this.observer = new IntersectionObserver(
            (entries) => this.handleIntersection(entries),
            {
                root: null,
                rootMargin: this.config.rootMargin,
                threshold: this.config.threshold
            }
        );

        // Observe sentinel element
        if (this.sentinelElement) {
            this.observer.observe(this.sentinelElement);
        }

        // Load initial page
        return this.loadMore();
    }

    /**
     * Handle intersection observer callback
     */
    async handleIntersection(entries) {
        const entry = entries[0];

        if (entry.isIntersecting && !this.loading && this.hasMore) {
            await this.loadMore();
        }
    }

    /**
     * Load more items from Firestore
     */
    async loadMore() {
        if (this.loading || !this.hasMore) {
            return;
        }

        this.loading = true;
        this.showLoadingIndicator();

        try {
            const startTime = performance.now();

            // Build query
            let firestoreQuery = this.buildQuery();

            // Execute query with performance tracking
            const snapshot = await performanceMonitor.trackOperation(
                'lazy_load',
                async () => await getDocs(firestoreQuery),
                { page_size: this.config.pageSize }
            );

            const duration = performance.now() - startTime;

            // Process results
            const newItems = [];
            snapshot.forEach((doc) => {
                newItems.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Update state
            this.items.push(...newItems);

            if (snapshot.docs.length < this.config.pageSize) {
                this.hasMore = false;
                this.hideSentinel();
            } else {
                this.lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }

            // Render new items
            if (this.renderCallback) {
                await this.renderCallback(newItems);
            }

            // Log performance
            performanceMonitor.putMetric('lazy_load', 'items_loaded', newItems.length);
            performanceMonitor.putMetric('lazy_load', 'duration_ms', Math.round(duration));

        } catch (error) {
            console.error('Error loading more items:', error);
            this.hasMore = false;
        } finally {
            this.loading = false;
            this.hideLoadingIndicator();
        }
    }

    /**
     * Build Firestore query (override in subclass)
     */
    buildQuery() {
        throw new Error('buildQuery must be implemented by subclass');
    }

    /**
     * Reset loader state
     */
    reset() {
        this.items = [];
        this.lastDoc = null;
        this.hasMore = true;
        this.loading = false;

        if (this.container) {
            this.container.innerHTML = '';
        }

        if (this.sentinelElement) {
            this.showSentinel();
        }
    }

    /**
     * Show loading indicator
     */
    showLoadingIndicator() {
        if (this.sentinelElement) {
            this.sentinelElement.innerHTML = '<div class="loading-spinner">Loading...</div>';
        }
    }

    /**
     * Hide loading indicator
     */
    hideLoadingIndicator() {
        if (this.sentinelElement && this.hasMore) {
            this.sentinelElement.innerHTML = '';
        }
    }

    /**
     * Show sentinel element
     */
    showSentinel() {
        if (this.sentinelElement) {
            this.sentinelElement.style.display = 'block';
        }
    }

    /**
     * Hide sentinel element
     */
    hideSentinel() {
        if (this.sentinelElement) {
            this.sentinelElement.style.display = 'none';
        }
    }

    /**
     * Destroy observer
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

/**
 * Highlights Lazy Loader
 */
export class HighlightsLazyLoader extends LazyLoader {
    constructor(userId, config) {
        super(config);
        this.userId = userId;
        this.filters = {
            book: 'all',
            type: 'all',
            color: 'all',
            sort: 'recent'
        };
    }

    /**
     * Set filters
     */
    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.reset();
        return this.loadMore();
    }

    /**
     * Build Firestore query for highlights
     */
    buildQuery() {
        const collectionRef = this.userId
            ? collection(db, 'users', this.userId, 'highlights')
            : collectionGroup(db, 'highlights');

        let constraints = [];

        // Filter by book
        if (this.filters.book !== 'all') {
            constraints.push(where('book_id', '==', this.filters.book));
        }

        // Filter by type
        if (this.filters.type !== 'all') {
            constraints.push(where('type', '==', this.filters.type));
        }

        // Filter by color
        if (this.filters.color !== 'all') {
            constraints.push(where('color', '==', parseInt(this.filters.color)));
        }

        // Filter public highlights for collectionGroup queries
        if (!this.userId) {
            constraints.push(where('visibility', '==', 'public'));
        }

        // Sorting
        switch (this.filters.sort) {
            case 'recent':
                constraints.push(orderBy('date_created', 'desc'));
                break;
            case 'oldest':
                constraints.push(orderBy('date_created', 'asc'));
                break;
            case 'popular':
                constraints.push(orderBy('likeCount', 'desc'));
                constraints.push(orderBy('date_created', 'desc'));
                break;
        }

        // Pagination
        constraints.push(limit(this.config.pageSize));

        if (this.lastDoc) {
            constraints.push(startAfter(this.lastDoc));
        }

        return query(collectionRef, ...constraints);
    }
}

/**
 * Books Lazy Loader
 */
export class BooksLazyLoader extends LazyLoader {
    constructor(userId, config) {
        super(config);
        this.userId = userId;
    }

    /**
     * Build Firestore query for books
     */
    buildQuery() {
        const collectionRef = this.userId
            ? collection(db, 'users', this.userId, 'books')
            : collectionGroup(db, 'books');

        let constraints = [
            orderBy('date_last_read', 'desc'),
            limit(this.config.pageSize)
        ];

        // Filter public books for collectionGroup queries
        if (!this.userId) {
            constraints.unshift(where('visibility', '==', 'public'));
        }

        if (this.lastDoc) {
            constraints.push(startAfter(this.lastDoc));
        }

        return query(collectionRef, ...constraints);
    }
}

/**
 * Feed Lazy Loader
 */
export class FeedLazyLoader extends LazyLoader {
    constructor(userId, config) {
        super(config);
        this.userId = userId;
    }

    /**
     * Build Firestore query for feed
     */
    buildQuery() {
        const collectionRef = collection(db, 'users', this.userId, 'feed');

        let constraints = [
            orderBy('timestamp', 'desc'),
            limit(this.config.pageSize)
        ];

        if (this.lastDoc) {
            constraints.push(startAfter(this.lastDoc));
        }

        return query(collectionRef, ...constraints);
    }
}

/**
 * Comments Lazy Loader
 */
export class CommentsLazyLoader extends LazyLoader {
    constructor(highlightId, config) {
        super(config);
        this.highlightId = highlightId;
    }

    /**
     * Build Firestore query for comments
     */
    buildQuery() {
        const collectionRef = collectionGroup(db, 'comments');

        let constraints = [
            where('highlightId', '==', this.highlightId),
            where('parentId', '==', null), // Top-level comments only
            orderBy('createdAt', 'asc'),
            limit(this.config.pageSize)
        ];

        if (this.lastDoc) {
            constraints.push(startAfter(this.lastDoc));
        }

        return query(collectionRef, ...constraints);
    }
}

/**
 * Notifications Lazy Loader
 */
export class NotificationsLazyLoader extends LazyLoader {
    constructor(userId, config) {
        super(config);
        this.userId = userId;
    }

    /**
     * Build Firestore query for notifications
     */
    buildQuery() {
        const collectionRef = collection(db, 'users', this.userId, 'notifications');

        let constraints = [
            orderBy('createdAt', 'desc'),
            limit(this.config.pageSize)
        ];

        if (this.lastDoc) {
            constraints.push(startAfter(this.lastDoc));
        }

        return query(collectionRef, ...constraints);
    }
}

/**
 * Virtual Scroll Manager for large lists
 * Renders only visible items for better performance
 */
export class VirtualScrollManager {
    constructor(config) {
        this.config = {
            itemHeight: 100,
            buffer: 5,
            ...config
        };

        this.items = [];
        this.container = null;
        this.scrollContainer = null;
        this.visibleStart = 0;
        this.visibleEnd = 0;
    }

    /**
     * Initialize virtual scroll
     * @param {HTMLElement} container - Container element
     * @param {HTMLElement} scrollContainer - Scroll container
     * @param {Array} items - All items to render
     * @param {Function} renderItemCallback - Function to render a single item
     */
    init(container, scrollContainer, items, renderItemCallback) {
        this.container = container;
        this.scrollContainer = scrollContainer;
        this.items = items;
        this.renderItemCallback = renderItemCallback;

        // Set container height
        this.container.style.height = `${this.items.length * this.config.itemHeight}px`;
        this.container.style.position = 'relative';

        // Attach scroll listener
        this.scrollContainer.addEventListener('scroll', () => this.handleScroll());

        // Initial render
        this.render();
    }

    /**
     * Handle scroll event
     */
    handleScroll() {
        requestAnimationFrame(() => this.render());
    }

    /**
     * Render visible items
     */
    render() {
        const scrollTop = this.scrollContainer.scrollTop;
        const viewportHeight = this.scrollContainer.clientHeight;

        // Calculate visible range
        const start = Math.max(0, Math.floor(scrollTop / this.config.itemHeight) - this.config.buffer);
        const end = Math.min(
            this.items.length,
            Math.ceil((scrollTop + viewportHeight) / this.config.itemHeight) + this.config.buffer
        );

        // Only re-render if range changed
        if (start !== this.visibleStart || end !== this.visibleEnd) {
            this.visibleStart = start;
            this.visibleEnd = end;

            this.renderVisibleItems();
        }
    }

    /**
     * Render only visible items
     */
    renderVisibleItems() {
        const fragment = document.createDocumentFragment();

        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const item = this.items[i];
            const element = this.renderItemCallback(item, i);

            // Position element
            element.style.position = 'absolute';
            element.style.top = `${i * this.config.itemHeight}px`;
            element.style.width = '100%';

            fragment.appendChild(element);
        }

        // Replace container content
        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    /**
     * Update items
     */
    updateItems(items) {
        this.items = items;
        this.container.style.height = `${this.items.length * this.config.itemHeight}px`;
        this.render();
    }
}
