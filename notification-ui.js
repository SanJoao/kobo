/**
 * Notification UI for Koby
 * Handles notification bell and dropdown
 */

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export class NotificationUI {
    constructor() {
        this.auth = getAuth();
        this.isOpen = false;
        this.unsubscribeNotifications = null;
        this.unsubscribeCount = null;
    }

    /**
     * Initialize notification bell in header
     */
    initializeNotificationBell() {
        const currentUser = this.auth.currentUser;
        if (!currentUser) return;

        const bellContainer = document.getElementById('notification-bell-container');
        if (!bellContainer) {
            console.warn('[NotificationUI] Bell container not found');
            return;
        }

        // Create bell HTML
        bellContainer.innerHTML = `
            <div class="notification-bell" id="notification-bell" onclick="toggleNotificationDropdown()">
                <i class="fas fa-bell"></i>
                <span class="notification-badge" id="notification-badge" style="display: none;">0</span>
            </div>
            <div class="notification-dropdown" id="notification-dropdown" style="display: none;">
                <div class="notification-dropdown-header">
                    <h3>Notifications</h3>
                    <button class="btn-mark-all-read" id="mark-all-read-btn" onclick="markAllNotificationsRead()">
                        Mark all as read
                    </button>
                </div>
                <div class="notification-list" id="notification-list">
                    <div class="notification-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading notifications...</p>
                    </div>
                </div>
            </div>
        `;

        // Subscribe to unread count
        this.unsubscribeCount = window.notificationManager.subscribeToUnreadCount(
            currentUser.uid,
            (count) => {
                this.updateBadge(count);
            }
        );

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const bell = document.getElementById('notification-bell');
            const dropdown = document.getElementById('notification-dropdown');

            if (bell && dropdown && this.isOpen) {
                if (!bell.contains(e.target) && !dropdown.contains(e.target)) {
                    this.closeDropdown();
                }
            }
        });

        console.log('[NotificationUI] Notification bell initialized');
    }

    /**
     * Update notification badge
     */
    updateBadge(count) {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    /**
     * Toggle notification dropdown
     */
    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    /**
     * Open notification dropdown
     */
    async openDropdown() {
        const currentUser = this.auth.currentUser;
        if (!currentUser) return;

        const dropdown = document.getElementById('notification-dropdown');
        if (!dropdown) return;

        this.isOpen = true;
        dropdown.style.display = 'block';

        // Load notifications
        await this.loadNotifications(currentUser.uid);
    }

    /**
     * Close notification dropdown
     */
    closeDropdown() {
        const dropdown = document.getElementById('notification-dropdown');
        if (!dropdown) return;

        this.isOpen = false;
        dropdown.style.display = 'none';

        // Unsubscribe from notifications (but keep count subscription)
        if (this.unsubscribeNotifications) {
            this.unsubscribeNotifications();
            this.unsubscribeNotifications = null;
        }
    }

    /**
     * Load and display notifications
     */
    async loadNotifications(userId) {
        const listContainer = document.getElementById('notification-list');
        if (!listContainer) return;

        // Subscribe to real-time updates
        this.unsubscribeNotifications = window.notificationManager.subscribeToNotifications(
            userId,
            (notifications) => {
                this.renderNotifications(notifications);
            },
            20
        );
    }

    /**
     * Render notifications list
     */
    renderNotifications(notifications) {
        const listContainer = document.getElementById('notification-list');
        if (!listContainer) return;

        if (notifications.length === 0) {
            listContainer.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell-slash"></i>
                    <p>No notifications yet</p>
                    <p class="notification-empty-hint">You'll see notifications when people interact with your highlights</p>
                </div>
            `;
            return;
        }

        let html = '';
        notifications.forEach(notification => {
            html += window.notificationManager.renderNotification(notification);
        });

        listContainer.innerHTML = html;

        // Show/hide "Mark all as read" button
        const hasUnread = notifications.some(n => !n.read);
        const markAllBtn = document.getElementById('mark-all-read-btn');
        if (markAllBtn) {
            markAllBtn.style.display = hasUnread ? 'block' : 'none';
        }
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead() {
        const markAllBtn = document.getElementById('mark-all-read-btn');
        if (markAllBtn) {
            markAllBtn.disabled = true;
            markAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marking...';
        }

        try {
            const result = await window.notificationManager.markAllAsRead();

            if (result.success) {
                console.log('[NotificationUI] Marked all notifications as read');
            } else {
                alert('Failed to mark all as read. Please try again.');
            }
        } catch (error) {
            console.error('[NotificationUI] Error marking all as read:', error);
            alert('Failed to mark all as read. Please try again.');
        } finally {
            if (markAllBtn) {
                markAllBtn.disabled = false;
                markAllBtn.innerHTML = 'Mark all as read';
            }
        }
    }

    /**
     * Cleanup (unsubscribe from listeners)
     */
    cleanup() {
        if (this.unsubscribeNotifications) {
            this.unsubscribeNotifications();
        }
        if (this.unsubscribeCount) {
            this.unsubscribeCount();
        }
    }
}

// Create global instance
window.notificationUI = new NotificationUI();

// Global functions for onclick handlers
window.toggleNotificationDropdown = function() {
    window.notificationUI.toggleDropdown();
};

window.markAllNotificationsRead = async function() {
    await window.notificationUI.markAllAsRead();
};

console.log('[NotificationUI] Initialized');
