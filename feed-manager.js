/**
 * Feed Manager for Koby
 * Handles activity feed operations and real-time updates
 */

import { db } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, doc, updateDoc, onSnapshot, where, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class FeedManager {
    constructor() {
        this.db = db;
        this.feedCache = [];
        this.lastVisible = null;
        this.hasMore = true;
        this.unsubscribe = null;
        this.ITEMS_PER_PAGE = 20;
    }

    /**
     * Load initial feed items
     */
    async loadFeed(userId, pageSize = this.ITEMS_PER_PAGE) {
        try {
            console.log('[FeedManager] Loading feed for user:', userId);

            const feedRef = collection(this.db, 'users', userId, 'feed');
            const feedQuery = query(
                feedRef,
                orderBy('timestamp', 'desc'),
                limit(pageSize)
            );

            const snapshot = await getDocs(feedQuery);

            if (snapshot.empty) {
                console.log('[FeedManager] No feed items found');
                this.hasMore = false;
                return [];
            }

            this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            this.hasMore = snapshot.docs.length === pageSize;

            const feedItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));

            this.feedCache = feedItems;
            console.log('[FeedManager] Loaded', feedItems.length, 'feed items');

            return feedItems;

        } catch (error) {
            console.error('[FeedManager] Error loading feed:', error);
            return [];
        }
    }

    /**
     * Load more feed items (for infinite scroll)
     */
    async loadMoreFeed(userId, pageSize = this.ITEMS_PER_PAGE) {
        if (!this.hasMore || !this.lastVisible) {
            console.log('[FeedManager] No more items to load');
            return [];
        }

        try {
            console.log('[FeedManager] Loading more feed items...');

            const feedRef = collection(this.db, 'users', userId, 'feed');
            const feedQuery = query(
                feedRef,
                orderBy('timestamp', 'desc'),
                startAfter(this.lastVisible),
                limit(pageSize)
            );

            const snapshot = await getDocs(feedQuery);

            if (snapshot.empty) {
                console.log('[FeedManager] No more feed items');
                this.hasMore = false;
                return [];
            }

            this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            this.hasMore = snapshot.docs.length === pageSize;

            const feedItems = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));

            this.feedCache = [...this.feedCache, ...feedItems];
            console.log('[FeedManager] Loaded', feedItems.length, 'more items');

            return feedItems;

        } catch (error) {
            console.error('[FeedManager] Error loading more feed:', error);
            return [];
        }
    }

    /**
     * Subscribe to real-time feed updates
     */
    subscribeToFeed(userId, callback, pageSize = this.ITEMS_PER_PAGE) {
        try {
            console.log('[FeedManager] Subscribing to feed updates');

            const feedRef = collection(this.db, 'users', userId, 'feed');
            const feedQuery = query(
                feedRef,
                orderBy('timestamp', 'desc'),
                limit(pageSize)
            );

            this.unsubscribe = onSnapshot(feedQuery, (snapshot) => {
                const feedItems = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp?.toDate() || new Date()
                }));

                this.feedCache = feedItems;
                callback(feedItems);
            });

            return this.unsubscribe;

        } catch (error) {
            console.error('[FeedManager] Error subscribing to feed:', error);
            return null;
        }
    }

    /**
     * Unsubscribe from feed updates
     */
    unsubscribeFromFeed() {
        if (this.unsubscribe) {
            console.log('[FeedManager] Unsubscribing from feed');
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    /**
     * Mark feed item as read
     */
    async markAsRead(userId, feedItemId) {
        try {
            console.log('[FeedManager] Marking item as read:', feedItemId);

            const feedItemRef = doc(this.db, 'users', userId, 'feed', feedItemId);
            await updateDoc(feedItemRef, {
                read: true
            });

            // Update cache
            const item = this.feedCache.find(item => item.id === feedItemId);
            if (item) {
                item.read = true;
            }

            return { success: true };

        } catch (error) {
            console.error('[FeedManager] Error marking as read:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark all feed items as read
     */
    async markAllAsRead(userId) {
        try {
            console.log('[FeedManager] Marking all items as read');

            const feedRef = collection(this.db, 'users', userId, 'feed');
            const unreadQuery = query(feedRef, where('read', '==', false));
            const snapshot = await getDocs(unreadQuery);

            if (snapshot.empty) {
                console.log('[FeedManager] No unread items');
                return { success: true };
            }

            // Update in batches
            const batch = this.db.batch();
            let count = 0;

            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { read: true });
                count++;
            });

            await batch.commit();

            // Update cache
            this.feedCache.forEach(item => {
                item.read = true;
            });

            console.log('[FeedManager] Marked', count, 'items as read');
            return { success: true, count };

        } catch (error) {
            console.error('[FeedManager] Error marking all as read:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get unread count
     */
    async getUnreadCount(userId) {
        try {
            const feedRef = collection(this.db, 'users', userId, 'feed');
            const unreadQuery = query(feedRef, where('read', '==', false));
            const snapshot = await getDocs(unreadQuery);

            return snapshot.size;

        } catch (error) {
            console.error('[FeedManager] Error getting unread count:', error);
            return 0;
        }
    }

    /**
     * Subscribe to unread count updates
     */
    subscribeToUnreadCount(userId, callback) {
        try {
            const feedRef = collection(this.db, 'users', userId, 'feed');
            const unreadQuery = query(feedRef, where('read', '==', false));

            return onSnapshot(unreadQuery, (snapshot) => {
                callback(snapshot.size);
            });

        } catch (error) {
            console.error('[FeedManager] Error subscribing to unread count:', error);
            return null;
        }
    }

    /**
     * Refresh feed (pull-to-refresh)
     */
    async refreshFeed(userId, pageSize = this.ITEMS_PER_PAGE) {
        console.log('[FeedManager] Refreshing feed');
        this.lastVisible = null;
        this.hasMore = true;
        this.feedCache = [];
        return await this.loadFeed(userId, pageSize);
    }

    /**
     * Render feed item HTML
     */
    renderFeedItem(item) {
        const timeAgo = this.getTimeAgo(item.timestamp);

        if (item.action === 'highlight') {
            return `
                <div class="feed-item ${item.read ? 'read' : 'unread'}" data-feed-id="${item.id}">
                    <div class="feed-item-header">
                        <img src="${item.actorPhotoURL || ''}"
                             alt="${item.actorName}"
                             class="feed-avatar">
                        <div class="feed-item-info">
                            <div class="feed-item-actor">
                                <a href="/profile.html?userId=${item.actorId}">${item.actorName}</a>
                                <span class="feed-item-action">highlighted from</span>
                                <span class="feed-item-book">${item.bookTitle}</span>
                            </div>
                            <div class="feed-item-time">${timeAgo}</div>
                        </div>
                    </div>
                    <div class="feed-item-content">
                        <blockquote class="feed-highlight-text">${this.escapeHtml(item.highlightText)}</blockquote>
                        ${item.annotation ? `<p class="feed-annotation"><strong>Note:</strong> ${this.escapeHtml(item.annotation)}</p>` : ''}
                    </div>
                    <div class="feed-item-footer">
                        <a href="/profile.html?userId=${item.actorId}#highlight-${item.highlightId}" class="feed-view-link">
                            View highlight →
                        </a>
                    </div>
                </div>
            `;
        } else if (item.action === 'finished_book') {
            return `
                <div class="feed-item ${item.read ? 'read' : 'unread'}" data-feed-id="${item.id}">
                    <div class="feed-item-header">
                        <img src="${item.actorPhotoURL || ''}"
                             alt="${item.actorName}"
                             class="feed-avatar">
                        <div class="feed-item-info">
                            <div class="feed-item-actor">
                                <a href="/profile.html?userId=${item.actorId}">${item.actorName}</a>
                                <span class="feed-item-action">finished reading</span>
                                <span class="feed-item-book">${item.bookTitle}</span>
                            </div>
                            <div class="feed-item-time">${timeAgo}</div>
                        </div>
                    </div>
                    <div class="feed-item-content">
                        <p class="feed-finished-message">
                            <i class="fas fa-check-circle"></i>
                            Completed "${item.bookTitle}" by ${item.bookAuthor}
                        </p>
                    </div>
                    <div class="feed-item-footer">
                        <a href="/profile.html?userId=${item.actorId}" class="feed-view-link">
                            View profile →
                        </a>
                    </div>
                </div>
            `;
        }

        return '';
    }

    /**
     * Get time ago string
     */
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) {
            return 'just now';
        } else if (diffMins < 60) {
            return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
        } else if (diffDays < 30) {
            return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
window.feedManager = new FeedManager();

console.log('[FeedManager] Initialized');
