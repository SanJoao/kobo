/**
 * User Discovery for Koby
 * Recommendation algorithms for finding users to follow
 */

import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export class UserDiscovery {
    constructor() {
        this.db = db;
        this.recommendationCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Check if a book title is a Kobo sketch (should be excluded)
     */
    isSketch(title) {
        if (!title) return false;
        const lowerTitle = title.toLowerCase().trim();
        // Match patterns like "sketch1", "sketch 1", "sketch", etc.
        return lowerTitle.startsWith('sketch');
    }

    /**
     * Get "Readers Like You" recommendations
     * Finds users who read similar books using collaborative filtering
     */
    async getReadersLikeYou(currentUserId, limitCount = 5) {
        try {
            console.log('[UserDiscovery] Finding readers like you...');

            // Check cache
            const cacheKey = `readers-like-you:${currentUserId}`;
            if (this.recommendationCache.has(cacheKey)) {
                const cached = this.recommendationCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.CACHE_TTL) {
                    console.log('[UserDiscovery] Returning cached recommendations');
                    return cached.data;
                }
            }

            // Get current user's books (excluding sketches)
            const userBooksSnapshot = await getDocs(
                collection(this.db, 'users', currentUserId, 'books')
            );

            if (userBooksSnapshot.empty) {
                console.log('[UserDiscovery] Current user has no books');
                return [];
            }

            // Filter out sketches from user's books
            const userBooks = new Set(
                userBooksSnapshot.docs
                    .filter(doc => !this.isSketch(doc.data().title))
                    .map(doc => doc.id)
            );
            console.log(`[UserDiscovery] Current user has ${userBooks.size} books (after filtering sketches)`);

            // Get users who are already following/followers (exclude them)
            const followingSnapshot = await getDocs(
                collection(this.db, 'users', currentUserId, 'following')
            );
            const excludeUserIds = new Set(
                followingSnapshot.docs.map(doc => doc.data().userId)
            );
            excludeUserIds.add(currentUserId); // Exclude self

            // Get all users (we'll need to optimize this for scale)
            const usersSnapshot = await getDocs(collection(this.db, 'users'));

            const similarityScores = [];

            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;

                // Skip excluded users
                if (excludeUserIds.has(userId)) continue;

                // Get this user's books
                const otherUserBooksSnapshot = await getDocs(
                    collection(this.db, 'users', userId, 'books')
                );

                if (otherUserBooksSnapshot.empty) continue;

                // Create a map of book ID to title for this user (excluding sketches)
                const otherUserBooksMap = new Map();
                otherUserBooksSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const title = data.title || 'Unknown Book';
                    // Skip sketches
                    if (!this.isSketch(title)) {
                        otherUserBooksMap.set(doc.id, title);
                    }
                });

                const otherUserBooks = new Set(otherUserBooksMap.keys());

                // Calculate Jaccard similarity (intersection / union)
                const intersection = new Set(
                    [...userBooks].filter(book => otherUserBooks.has(book))
                );

                if (intersection.size === 0) continue;

                // Get the titles of shared books
                const sharedBookTitles = [...intersection].map(bookId => otherUserBooksMap.get(bookId));

                const union = new Set([...userBooks, ...otherUserBooks]);
                const similarity = intersection.size / union.size;

                similarityScores.push({
                    userId,
                    userData: userDoc.data(),
                    similarity,
                    sharedBooks: intersection.size,
                    sharedBookTitles,
                    totalBooks: otherUserBooks.size
                });
            }

            // Sort by similarity score
            similarityScores.sort((a, b) => b.similarity - a.similarity);

            // Take top N recommendations
            const recommendations = similarityScores.slice(0, limitCount).map(item => {
                // Get display name from profile.nickname first, then displayName, then 'Anonymous'
                const displayName = item.userData.profile?.nickname || item.userData.displayName || 'Anonymous';

                // Format reason with book titles (show up to 3 titles)
                const bookTitles = item.sharedBookTitles || [];
                let reason;
                if (bookTitles.length === 1) {
                    reason = `Both read: ${bookTitles[0]}`;
                } else if (bookTitles.length <= 3) {
                    reason = `Both read: ${bookTitles.join(', ')}`;
                } else {
                    reason = `Both read: ${bookTitles.slice(0, 2).join(', ')} +${bookTitles.length - 2} more`;
                }

                return {
                    userId: item.userId,
                    displayName,
                    followerCount: item.userData.followerCount || 0,
                    highlightCount: item.userData.highlightCount || 0,
                    sharedBooks: item.sharedBooks,
                    sharedBookTitles: bookTitles,
                    similarity: Math.round(item.similarity * 100),
                    reason
                };
            });

            // Cache results
            this.recommendationCache.set(cacheKey, {
                data: recommendations,
                timestamp: Date.now()
            });

            console.log(`[UserDiscovery] Found ${recommendations.length} similar readers`);
            return recommendations;

        } catch (error) {
            console.error('[UserDiscovery] Error finding readers like you:', error);
            return [];
        }
    }

    /**
     * Get "Popular in Your Network" recommendations
     * Finds users followed by people you follow (friend-of-friend)
     */
    async getPopularInNetwork(currentUserId, limitCount = 5) {
        try {
            console.log('[UserDiscovery] Finding popular users in your network...');

            // Check cache
            const cacheKey = `popular-network:${currentUserId}`;
            if (this.recommendationCache.has(cacheKey)) {
                const cached = this.recommendationCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.CACHE_TTL) {
                    console.log('[UserDiscovery] Returning cached network recommendations');
                    return cached.data;
                }
            }

            // Get users I'm following
            const followingSnapshot = await getDocs(
                collection(this.db, 'users', currentUserId, 'following')
            );

            if (followingSnapshot.empty) {
                console.log('[UserDiscovery] Current user is not following anyone');
                return [];
            }

            const followingUserIds = followingSnapshot.docs.map(doc => doc.data().userId);
            console.log(`[UserDiscovery] User follows ${followingUserIds.length} people`);

            // Track how many of my followings follow each user
            const userFollowerCounts = new Map();
            const followedByMe = new Set(followingUserIds);
            followedByMe.add(currentUserId); // Exclude self

            // For each person I follow, get who they follow
            for (const followingUserId of followingUserIds) {
                const theirFollowingSnapshot = await getDocs(
                    collection(this.db, 'users', followingUserId, 'following')
                );

                for (const doc of theirFollowingSnapshot.docs) {
                    const targetUserId = doc.data().userId;

                    // Skip if I already follow them or it's me
                    if (followedByMe.has(targetUserId)) continue;

                    if (!userFollowerCounts.has(targetUserId)) {
                        userFollowerCounts.set(targetUserId, {
                            count: 0,
                            followedBy: []
                        });
                    }

                    const entry = userFollowerCounts.get(targetUserId);
                    entry.count++;
                    entry.followedBy.push(followingUserId);
                }
            }

            if (userFollowerCounts.size === 0) {
                console.log('[UserDiscovery] No network recommendations found');
                return [];
            }

            // Convert to array and sort by count
            const recommendations = [];

            for (const [userId, data] of userFollowerCounts.entries()) {
                // Get user data
                const userDoc = await getDoc(doc(this.db, 'users', userId));

                if (!userDoc.exists()) continue;

                const userData = userDoc.data();

                recommendations.push({
                    userId,
                    displayName: userData.displayName || 'Anonymous',
                    photoURL: userData.photoURL || null,
                    followerCount: userData.followerCount || 0,
                    highlightCount: userData.highlightCount || 0,
                    mutualConnections: data.count,
                    reason: `Followed by ${data.count} ${data.count > 1 ? 'people' : 'person'} you follow`
                });
            }

            // Sort by mutual connections count
            recommendations.sort((a, b) => b.mutualConnections - a.mutualConnections);

            // Take top N
            const topRecommendations = recommendations.slice(0, limitCount);

            // Cache results
            this.recommendationCache.set(cacheKey, {
                data: topRecommendations,
                timestamp: Date.now()
            });

            console.log(`[UserDiscovery] Found ${topRecommendations.length} popular users in network`);
            return topRecommendations;

        } catch (error) {
            console.error('[UserDiscovery] Error finding popular in network:', error);
            return [];
        }
    }

    /**
     * Get trending users (most active recently)
     */
    async getTrendingUsers(currentUserId, limitCount = 5) {
        try {
            console.log('[UserDiscovery] Finding trending users...');

            // Get users who are already following/followers (exclude them)
            const followingSnapshot = await getDocs(
                collection(this.db, 'users', currentUserId, 'following')
            );
            const excludeUserIds = new Set(
                followingSnapshot.docs.map(doc => doc.data().userId)
            );
            excludeUserIds.add(currentUserId);

            // Get all users with recent uploads
            const usersSnapshot = await getDocs(collection(this.db, 'users'));

            const usersWithActivity = [];

            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;

                if (excludeUserIds.has(userId)) continue;

                const userData = userDoc.data();

                // Check if user has recent activity (lastUpload in last 30 days)
                if (userData.lastUpload) {
                    const lastUploadDate = userData.lastUpload.toDate();
                    const daysSinceUpload = (Date.now() - lastUploadDate.getTime()) / (1000 * 60 * 60 * 24);

                    if (daysSinceUpload <= 30) {
                        usersWithActivity.push({
                            userId,
                            displayName: userData.displayName || 'Anonymous',
                            photoURL: userData.photoURL || null,
                            followerCount: userData.followerCount || 0,
                            highlightCount: userData.highlightCount || 0,
                            daysSinceUpload,
                            reason: 'Active reader'
                        });
                    }
                }
            }

            // Sort by follower count and recency
            usersWithActivity.sort((a, b) => {
                // Combine follower count and recency
                const scoreA = a.followerCount - (a.daysSinceUpload * 0.1);
                const scoreB = b.followerCount - (b.daysSinceUpload * 0.1);
                return scoreB - scoreA;
            });

            const trending = usersWithActivity.slice(0, limitCount);

            console.log(`[UserDiscovery] Found ${trending.length} trending users`);
            return trending;

        } catch (error) {
            console.error('[UserDiscovery] Error finding trending users:', error);
            return [];
        }
    }

    /**
     * Render user card for discovery widget
     */
    renderUserCard(user, showFollowButton = true) {
        return `
            <div class="discovery-user-card" data-user-id="${user.userId}">
                <a href="/user/${user.userId}" class="discovery-user-link">
                    <div class="discovery-user-info">
                        <h4 class="discovery-user-name">${this.escapeHtml(user.displayName)}</h4>
                        <p class="discovery-user-reason">${user.reason}</p>
                        <div class="discovery-user-stats">
                            ${user.highlightCount ? `<span><i class="fas fa-highlighter"></i> ${user.highlightCount}</span>` : ''}
                            ${user.followerCount ? `<span><i class="fas fa-users"></i> ${user.followerCount}</span>` : ''}
                        </div>
                    </div>
                </a>
                ${showFollowButton ? `
                    <button class="discovery-follow-btn"
                            data-user-id="${user.userId}"
                            onclick="handleDiscoveryFollow('${user.userId}', this)">
                        <i class="fas fa-user-plus"></i>
                        Follow
                    </button>
                ` : ''}
            </div>
        `;
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Clear recommendation cache
     */
    clearCache() {
        this.recommendationCache.clear();
    }
}

// Create global instance
window.userDiscovery = new UserDiscovery();

// Global follow handler for discovery widgets
window.handleDiscoveryFollow = async function (userId, button) {
    const currentUser = window.currentUser || window.auth?.currentUser;
    if (!currentUser) {
        window.location.href = '/login.html';
        return;
    }

    try {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Following...';

        const result = await window.followManager.followUser(userId);

        if (result.success) {
            button.innerHTML = '<i class="fas fa-check"></i> Following';
            button.classList.add('following');

            // Clear discovery cache to get updated recommendations
            window.userDiscovery.clearCache();

            // Refresh the widget after a delay
            setTimeout(() => {
                if (window.refreshDiscoveryWidgets) {
                    window.refreshDiscoveryWidgets();
                }
            }, 1000);
        }
    } catch (error) {
        console.error('Error following user:', error);
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
        alert('Failed to follow user. Please try again.');
    }
};

console.log('[UserDiscovery] Initialized');
