/**
 * Follow Manager for Koby
 * Handles follow/unfollow operations and follower/following lists
 */

import { db, functions } from "./firebase-config.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { collection, query, getDocs, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class FollowManager {
    constructor() {
        this.functions = functions;
        this.db = db;
        this.followUserFn = httpsCallable(this.functions, 'followUser');
        this.unfollowUserFn = httpsCallable(this.functions, 'unfollowUser');
        this.followingCache = new Map();
    }

    /**
     * Follow a user
     */
    async followUser(userId) {
        try {
            console.log('[FollowManager] Following user:', userId);

            const result = await this.followUserFn({ userId });

            if (result.data.success) {
                // Clear cache
                this.followingCache.clear();
                console.log('[FollowManager] Successfully followed user');
                return { success: true };
            } else {
                throw new Error(result.data.message || 'Failed to follow user');
            }
        } catch (error) {
            console.error('[FollowManager] Error following user:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Unfollow a user
     */
    async unfollowUser(userId) {
        try {
            console.log('[FollowManager] Unfollowing user:', userId);

            const result = await this.unfollowUserFn({ userId });

            if (result.data.success) {
                // Clear cache
                this.followingCache.clear();
                console.log('[FollowManager] Successfully unfollowed user');
                return { success: true };
            } else {
                throw new Error(result.data.message || 'Failed to unfollow user');
            }
        } catch (error) {
            console.error('[FollowManager] Error unfollowing user:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check if current user is following another user
     */
    async isFollowing(currentUserId, targetUserId) {
        if (!currentUserId || !targetUserId) {
            return false;
        }

        // Check cache first
        const cacheKey = `${currentUserId}:${targetUserId}`;
        if (this.followingCache.has(cacheKey)) {
            return this.followingCache.get(cacheKey);
        }

        try {
            const followingDoc = await getDoc(
                doc(this.db, 'users', currentUserId, 'following', targetUserId)
            );

            const isFollowing = followingDoc.exists();
            this.followingCache.set(cacheKey, isFollowing);
            return isFollowing;
        } catch (error) {
            console.error('[FollowManager] Error checking follow status:', error);
            return false;
        }
    }

    /**
     * Get follower count for a user
     */
    async getFollowerCount(userId) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (userDoc.exists()) {
                return userDoc.data().followerCount || 0;
            }
            return 0;
        } catch (error) {
            console.error('[FollowManager] Error getting follower count:', error);
            return 0;
        }
    }

    /**
     * Get following count for a user
     */
    async getFollowingCount(userId) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', userId));
            if (userDoc.exists()) {
                return userDoc.data().followingCount || 0;
            }
            return 0;
        } catch (error) {
            console.error('[FollowManager] Error getting following count:', error);
            return 0;
        }
    }

    /**
     * Get list of users that current user is following
     */
    async getFollowing(userId) {
        try {
            const followingSnapshot = await getDocs(
                collection(this.db, 'users', userId, 'following')
            );

            const followingIds = followingSnapshot.docs.map(doc => doc.data().userId);

            // Fetch user details for each following
            const usersPromises = followingIds.map(async (id) => {
                const userDoc = await getDoc(doc(this.db, 'users', id));
                if (userDoc.exists()) {
                    return {
                        userId: id,
                        ...userDoc.data()
                    };
                }
                return null;
            });

            const users = await Promise.all(usersPromises);
            return users.filter(u => u !== null);
        } catch (error) {
            console.error('[FollowManager] Error getting following list:', error);
            return [];
        }
    }

    /**
     * Get list of users following current user
     */
    async getFollowers(userId) {
        try {
            const followersSnapshot = await getDocs(
                collection(this.db, 'users', userId, 'followers')
            );

            const followerIds = followersSnapshot.docs.map(doc => doc.data().userId);

            // Fetch user details for each follower
            const usersPromises = followerIds.map(async (id) => {
                const userDoc = await getDoc(doc(this.db, 'users', id));
                if (userDoc.exists()) {
                    return {
                        userId: id,
                        ...userDoc.data()
                    };
                }
                return null;
            });

            const users = await Promise.all(usersPromises);
            return users.filter(u => u !== null);
        } catch (error) {
            console.error('[FollowManager] Error getting followers list:', error);
            return [];
        }
    }

    /**
     * Subscribe to real-time follower count updates
     */
    subscribeToFollowerCount(userId, callback) {
        return onSnapshot(doc(this.db, 'users', userId), (snapshot) => {
            if (snapshot.exists()) {
                const count = snapshot.data().followerCount || 0;
                callback(count);
            }
        });
    }

    /**
     * Subscribe to real-time following count updates
     */
    subscribeToFollowingCount(userId, callback) {
        return onSnapshot(doc(this.db, 'users', userId), (snapshot) => {
            if (snapshot.exists()) {
                const count = snapshot.data().followingCount || 0;
                callback(count);
            }
        });
    }

    /**
     * Create follow button HTML
     */
    createFollowButton(targetUserId, currentUserId, isFollowing, options = {}) {
        const buttonClass = options.class || 'follow-button';
        const followingText = options.followingText || 'Following';
        const followText = options.followText || 'Follow';

        if (currentUserId === targetUserId) {
            // Don't show follow button for own profile
            return '';
        }

        const buttonState = isFollowing ? 'following' : 'not-following';
        const buttonText = isFollowing ? followingText : followText;

        return `
            <button
                class="${buttonClass} ${buttonState}"
                data-user-id="${targetUserId}"
                data-is-following="${isFollowing}"
                onclick="handleFollowButtonClick(this)"
            >
                <span class="follow-icon">${isFollowing ? '✓' : '+'}</span>
                <span class="follow-text">${buttonText}</span>
            </button>
        `;
    }

    /**
     * Update follow button state
     */
    updateFollowButton(button, isFollowing) {
        if (isFollowing) {
            button.classList.remove('not-following');
            button.classList.add('following');
            button.querySelector('.follow-icon').textContent = '✓';
            button.querySelector('.follow-text').textContent = 'Following';
            button.dataset.isFollowing = 'true';
        } else {
            button.classList.remove('following');
            button.classList.add('not-following');
            button.querySelector('.follow-icon').textContent = '+';
            button.querySelector('.follow-text').textContent = 'Follow';
            button.dataset.isFollowing = 'false';
        }
    }

    /**
     * Handle follow button click
     */
    async handleFollowClick(button, currentUserId) {
        const targetUserId = button.dataset.userId;
        const isFollowing = button.dataset.isFollowing === 'true';

        // Prevent multiple clicks
        if (button.disabled) return;
        button.disabled = true;

        try {
            let result;
            if (isFollowing) {
                result = await this.unfollowUser(targetUserId);
            } else {
                result = await this.followUser(targetUserId);
            }

            if (result.success) {
                this.updateFollowButton(button, !isFollowing);
            } else {
                alert(result.error || 'Failed to update follow status');
            }
        } catch (error) {
            console.error('[FollowManager] Error handling follow click:', error);
            alert('An error occurred. Please try again.');
        } finally {
            button.disabled = false;
        }
    }
}

// Create global instance
window.followManager = new FollowManager();

// Global function for button clicks
window.handleFollowButtonClick = async function (button) {
    const currentUser = window.currentUser || window.auth?.currentUser;
    if (!currentUser) {
        alert('Please log in to follow users');
        window.location.href = '/login.html';
        return;
    }

    await window.followManager.handleFollowClick(button, currentUser.uid);
};
