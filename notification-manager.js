/**
 * Notification Manager for Koby
 * Handles notification operations and real-time updates
 */

import { db, functions } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

export class NotificationManager {
    constructor() {
        this.db = db;
        this.functions = functions;
        this.markReadFn = httpsCallable(this.functions, 'markNotificationRead');
        this.markAllReadFn = httpsCallable(this.functions, 'markAllNotificationsRead');
        this.unsubscribe = null;
        this.unreadCount = 0;
    }

    /**
     * Load notifications
     */
    async loadNotifications(userId, limitCount = 20) {
        try {
            console.log('[NotificationManager] Loading notifications');

            const notificationsRef = collection(this.db, 'users', userId, 'notifications');
            const notificationsQuery = query(
                notificationsRef,
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );

            const snapshot = await getDocs(notificationsQuery);

            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));

            console.log('[NotificationManager] Loaded', notifications.length, 'notifications');
            return notifications;

        } catch (error) {
            console.error('[NotificationManager] Error loading notifications:', error);
            return [];
        }
    }

    /**
     * Subscribe to real-time notification updates
     */
    subscribeToNotifications(userId, callback, limitCount = 20) {
        try {
            console.log('[NotificationManager] Subscribing to notifications');

            const notificationsRef = collection(this.db, 'users', userId, 'notifications');
            const notificationsQuery = query(
                notificationsRef,
                orderBy('timestamp', 'desc'),
                limit(limitCount)
            );

            this.unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
                const notifications = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp?.toDate() || new Date()
                }));

                callback(notifications);
            });

            return this.unsubscribe;

        } catch (error) {
            console.error('[NotificationManager] Error subscribing to notifications:', error);
            return null;
        }
    }

    /**
     * Subscribe to unread count updates
     */
    subscribeToUnreadCount(userId, callback) {
        try {
            const userRef = doc(this.db, 'users', userId);

            return onSnapshot(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const count = data.unreadNotifications || 0;
                    this.unreadCount = count;
                    callback(count);
                }
            });

        } catch (error) {
            console.error('[NotificationManager] Error subscribing to unread count:', error);
            return null;
        }
    }

    /**
     * Unsubscribe from notifications
     */
    unsubscribeFromNotifications() {
        if (this.unsubscribe) {
            console.log('[NotificationManager] Unsubscribing from notifications');
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId) {
        try {
            console.log('[NotificationManager] Marking notification as read:', notificationId);

            const result = await this.markReadFn({ notificationId });

            if (result.data.success) {
                console.log('[NotificationManager] Notification marked as read');
                return { success: true };
            }

            throw new Error(result.data.message || 'Failed to mark as read');

        } catch (error) {
            console.error('[NotificationManager] Error marking as read:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead() {
        try {
            console.log('[NotificationManager] Marking all notifications as read');

            const result = await this.markAllReadFn();

            if (result.data.success) {
                console.log('[NotificationManager] All notifications marked as read');
                return { success: true, count: result.data.count };
            }

            throw new Error(result.data.message || 'Failed to mark all as read');

        } catch (error) {
            console.error('[NotificationManager] Error marking all as read:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Render notification HTML
     */
    renderNotification(notification) {
        const timeAgo = this.getTimeAgo(notification.timestamp);
        const unreadClass = notification.read ? '' : 'notification-unread';

        let content = '';
        let link = '';

        switch (notification.type) {
            case 'new_comment':
                content = `
                    <strong>${this.escapeHtml(notification.actorName)}</strong> commented on your highlight
                    <p class="notification-preview">"${this.escapeHtml(notification.commentText)}"</p>
                `;
                link = `/user/${notification.highlightOwnerId || notification.actorId}?highlight=${notification.highlightId}`;
                break;

            case 'comment_reply':
                content = `
                    <strong>${this.escapeHtml(notification.actorName)}</strong> replied to your comment
                    <p class="notification-preview">"${this.escapeHtml(notification.commentText)}"</p>
                `;
                link = `/user/${notification.highlightOwnerId}?highlight=${notification.highlightId}`;
                break;

            case 'new_follower':
                content = `
                    <strong>${this.escapeHtml(notification.actorName)}</strong> started following you
                `;
                link = `/profile.html?userId=${notification.actorId}`;
                break;

            case 'highlight_like':
                content = `
                    <strong>${this.escapeHtml(notification.actorName)}</strong> liked your highlight
                    <p class="notification-preview">"${this.escapeHtml(notification.highlightText)}"</p>
                `;
                link = `/user/${notification.actorId}?highlight=${notification.highlightId}`;
                break;

            case 'group_join':
                content = `
                    <strong>${this.escapeHtml(notification.actorName)}</strong> joined your group
                    <p class="notification-preview">"${this.escapeHtml(notification.groupName)}"</p>
                `;
                link = `/groups.html`;
                break;

            default:
                content = `<p>New notification</p>`;
                link = '#';
        }

        return `
            <div class="notification-item ${unreadClass}"
                 data-notification-id="${notification.id}"
                 onclick="handleNotificationClick('${notification.id}', '${link}')">
                <img src="${notification.actorPhotoURL || ''}"
                     alt="${notification.actorName}"
                     class="notification-avatar">
                <div class="notification-content">
                    <div class="notification-text">${content}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                ${!notification.read ? '<div class="notification-dot"></div>' : ''}
            </div>
        `;
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
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 30) {
            return `${diffDays}d ago`;
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
window.notificationManager = new NotificationManager();

// Global handler for notification clicks
window.handleNotificationClick = async function (notificationId, link) {
    // Mark as read
    await window.notificationManager.markAsRead(notificationId);

    // Navigate to link
    if (link && link !== '#') {
        window.location.href = link;
    }
};

console.log('[NotificationManager] Initialized');
