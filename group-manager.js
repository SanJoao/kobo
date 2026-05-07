/**
 * Group Manager for Koby
 * Handles reading group operations
 */

import { db, functions, auth } from "./firebase-config.js";
import { collection, query, where, orderBy, limit, getDocs, onSnapshot, doc, getDoc, startAfter } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

export class GroupManager {
    constructor() {
        this.db = db;
        this.functions = functions;
        this.auth = auth;

        // Cloud Functions
        this.createGroupFn = httpsCallable(this.functions, 'createGroup');
        this.joinGroupFn = httpsCallable(this.functions, 'joinGroup');
        this.leaveGroupFn = httpsCallable(this.functions, 'leaveGroup');
        this.updateGroupFn = httpsCallable(this.functions, 'updateGroup');
        this.deleteGroupFn = httpsCallable(this.functions, 'deleteGroup');
        this.createGroupPostFn = httpsCallable(this.functions, 'createGroupPost');

        // Subscription management
        this.unsubscribers = new Map();
        this.lastVisible = null;
        this.hasMore = true;
    }

    /**
     * Create a new reading group
     */
    async createGroup(name, description, bookId = null, bookTitle = null, isPrivate = false, tags = []) {
        try {
            console.log('[GroupManager] Creating group:', name);

            const result = await this.createGroupFn({
                name,
                description,
                bookId,
                bookTitle,
                isPrivate,
                tags
            });

            if (result.data.success) {
                console.log('[GroupManager] Group created:', result.data.groupId);
                window.track?.('create_group', {
                    group_id: result.data.groupId,
                    is_private: isPrivate,
                    has_book: !!bookId,
                    tag_count: tags.length
                });
                return {
                    success: true,
                    groupId: result.data.groupId,
                    message: result.data.message
                };
            }

            throw new Error(result.data.message || 'Failed to create group');

        } catch (error) {
            console.error('[GroupManager] Error creating group:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Join a reading group
     */
    async joinGroup(groupId) {
        try {
            console.log('[GroupManager] Joining group:', groupId);

            const result = await this.joinGroupFn({ groupId });

            if (result.data.success) {
                console.log('[GroupManager] Successfully joined group');
                window.track?.('join_group', { group_id: groupId });
                return { success: true, message: result.data.message };
            }

            throw new Error(result.data.message || 'Failed to join group');

        } catch (error) {
            console.error('[GroupManager] Error joining group:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Leave a reading group
     */
    async leaveGroup(groupId) {
        try {
            console.log('[GroupManager] Leaving group:', groupId);

            const result = await this.leaveGroupFn({ groupId });

            if (result.data.success) {
                console.log('[GroupManager] Successfully left group');
                return { success: true, message: result.data.message };
            }

            throw new Error(result.data.message || 'Failed to leave group');

        } catch (error) {
            console.error('[GroupManager] Error leaving group:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update group details (admin only)
     */
    async updateGroup(groupId, updates) {
        try {
            console.log('[GroupManager] Updating group:', groupId);

            const result = await this.updateGroupFn({
                groupId,
                ...updates
            });

            if (result.data.success) {
                console.log('[GroupManager] Group updated successfully');
                return { success: true, message: result.data.message };
            }

            throw new Error(result.data.message || 'Failed to update group');

        } catch (error) {
            console.error('[GroupManager] Error updating group:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a reading group (admin only)
     */
    async deleteGroup(groupId) {
        try {
            console.log('[GroupManager] Deleting group:', groupId);

            const result = await this.deleteGroupFn({ groupId });

            if (result.data.success) {
                console.log('[GroupManager] Group deleted successfully');
                return { success: true, message: result.data.message };
            }

            throw new Error(result.data.message || 'Failed to delete group');

        } catch (error) {
            console.error('[GroupManager] Error deleting group:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load all public groups
     */
    async loadPublicGroups(limitCount = 20) {
        try {
            console.log('[GroupManager] Loading public groups');

            const groupsQuery = query(
                collection(this.db, 'groups'),
                where('isPrivate', '==', false),
                orderBy('updatedAt', 'desc'),
                limit(limitCount)
            );

            const snapshot = await getDocs(groupsQuery);
            this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            this.hasMore = snapshot.docs.length === limitCount;

            const groups = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            }));

            console.log('[GroupManager] Loaded', groups.length, 'public groups');
            return groups;

        } catch (error) {
            console.error('[GroupManager] Error loading public groups:', error);
            return [];
        }
    }

    /**
     * Load more public groups (pagination)
     */
    async loadMorePublicGroups(limitCount = 20) {
        if (!this.hasMore || !this.lastVisible) {
            return [];
        }

        try {
            console.log('[GroupManager] Loading more public groups');

            const groupsQuery = query(
                collection(this.db, 'groups'),
                where('isPrivate', '==', false),
                orderBy('updatedAt', 'desc'),
                startAfter(this.lastVisible),
                limit(limitCount)
            );

            const snapshot = await getDocs(groupsQuery);
            this.lastVisible = snapshot.docs[snapshot.docs.length - 1];
            this.hasMore = snapshot.docs.length === limitCount;

            const groups = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            }));

            console.log('[GroupManager] Loaded', groups.length, 'more groups');
            return groups;

        } catch (error) {
            console.error('[GroupManager] Error loading more groups:', error);
            return [];
        }
    }

    /**
     * Load user's groups
     */
    async loadMyGroups(userId) {
        try {
            console.log('[GroupManager] Loading my groups');

            const userGroupsQuery = query(
                collection(this.db, 'users', userId, 'groups'),
                orderBy('joinedAt', 'desc')
            );

            const snapshot = await getDocs(userGroupsQuery);
            const userGroups = snapshot.docs.map(doc => doc.data());

            // Get full group details
            const groups = await Promise.all(
                userGroups.map(async (userGroup) => {
                    const groupDoc = await getDoc(doc(this.db, 'groups', userGroup.groupId));
                    if (groupDoc.exists()) {
                        return {
                            id: groupDoc.id,
                            ...groupDoc.data(),
                            myRole: userGroup.role,
                            createdAt: groupDoc.data().createdAt?.toDate() || new Date(),
                            updatedAt: groupDoc.data().updatedAt?.toDate() || new Date()
                        };
                    }
                    return null;
                })
            );

            const validGroups = groups.filter(g => g !== null);
            console.log('[GroupManager] Loaded', validGroups.length, 'my groups');
            return validGroups;

        } catch (error) {
            console.error('[GroupManager] Error loading my groups:', error);
            return [];
        }
    }

    /**
     * Get group details
     */
    async getGroup(groupId) {
        try {
            const groupDoc = await getDoc(doc(this.db, 'groups', groupId));

            if (!groupDoc.exists()) {
                return null;
            }

            return {
                id: groupDoc.id,
                ...groupDoc.data(),
                createdAt: groupDoc.data().createdAt?.toDate() || new Date(),
                updatedAt: groupDoc.data().updatedAt?.toDate() || new Date()
            };

        } catch (error) {
            console.error('[GroupManager] Error getting group:', error);
            return null;
        }
    }

    /**
     * Check if user is a member of a group
     */
    async isMember(groupId, userId) {
        try {
            const memberDoc = await getDoc(
                doc(this.db, 'groups', groupId, 'members', userId)
            );
            return memberDoc.exists();
        } catch (error) {
            console.error('[GroupManager] Error checking membership:', error);
            return false;
        }
    }

    /**
     * Get user's role in a group
     */
    async getMemberRole(groupId, userId) {
        try {
            const memberDoc = await getDoc(
                doc(this.db, 'groups', groupId, 'members', userId)
            );

            if (memberDoc.exists()) {
                return memberDoc.data().role;
            }

            return null;
        } catch (error) {
            console.error('[GroupManager] Error getting member role:', error);
            return null;
        }
    }

    /**
     * Load group members
     */
    async loadMembers(groupId, limitCount = 50) {
        try {
            console.log('[GroupManager] Loading members for group:', groupId);

            const membersQuery = query(
                collection(this.db, 'groups', groupId, 'members'),
                orderBy('joinedAt', 'desc'),
                limit(limitCount)
            );

            const snapshot = await getDocs(membersQuery);

            const members = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                joinedAt: doc.data().joinedAt?.toDate() || new Date()
            }));

            console.log('[GroupManager] Loaded', members.length, 'members');
            return members;

        } catch (error) {
            console.error('[GroupManager] Error loading members:', error);
            return [];
        }
    }

    /**
     * Create a group discussion post
     */
    async createPost(groupId, title, content, highlightId = null) {
        try {
            console.log('[GroupManager] Creating post in group:', groupId);

            const result = await this.createGroupPostFn({
                groupId,
                title,
                content,
                highlightId
            });

            if (result.data.success) {
                console.log('[GroupManager] Post created:', result.data.postId);
                return {
                    success: true,
                    postId: result.data.postId,
                    message: result.data.message
                };
            }

            throw new Error(result.data.message || 'Failed to create post');

        } catch (error) {
            console.error('[GroupManager] Error creating post:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load group posts
     */
    async loadPosts(groupId, limitCount = 20) {
        try {
            console.log('[GroupManager] Loading posts for group:', groupId);

            const postsQuery = query(
                collection(this.db, 'groups', groupId, 'posts'),
                orderBy('createdAt', 'desc'),
                limit(limitCount)
            );

            const snapshot = await getDocs(postsQuery);

            const posts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            }));

            console.log('[GroupManager] Loaded', posts.length, 'posts');
            return posts;

        } catch (error) {
            console.error('[GroupManager] Error loading posts:', error);
            return [];
        }
    }

    /**
     * Subscribe to group posts in real-time
     */
    subscribeToPosts(groupId, callback, limitCount = 20) {
        try {
            const postsQuery = query(
                collection(this.db, 'groups', groupId, 'posts'),
                orderBy('createdAt', 'desc'),
                limit(limitCount)
            );

            const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
                const posts = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date(),
                    updatedAt: doc.data().updatedAt?.toDate() || new Date()
                }));

                callback(posts);
            });

            this.unsubscribers.set(`posts-${groupId}`, unsubscribe);
            return unsubscribe;

        } catch (error) {
            console.error('[GroupManager] Error subscribing to posts:', error);
            return null;
        }
    }

    /**
     * Search groups by name or book
     */
    async searchGroups(searchTerm, limitCount = 20) {
        try {
            console.log('[GroupManager] Searching groups:', searchTerm);

            // Firestore doesn't support full-text search, so we load all public groups
            // and filter client-side (for production, use Algolia or similar)
            const groupsQuery = query(
                collection(this.db, 'groups'),
                where('isPrivate', '==', false),
                limit(100) // Load more for search
            );

            const snapshot = await getDocs(groupsQuery);

            const allGroups = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate() || new Date()
            }));

            // Client-side filter
            const searchLower = searchTerm.toLowerCase();
            const filtered = allGroups.filter(group =>
                group.name.toLowerCase().includes(searchLower) ||
                (group.description && group.description.toLowerCase().includes(searchLower)) ||
                (group.bookTitle && group.bookTitle.toLowerCase().includes(searchLower)) ||
                (group.tags && group.tags.some(tag => tag.toLowerCase().includes(searchLower)))
            );

            // Sort by relevance (name matches first, then others)
            filtered.sort((a, b) => {
                const aNameMatch = a.name.toLowerCase().includes(searchLower);
                const bNameMatch = b.name.toLowerCase().includes(searchLower);
                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;
                return 0;
            });

            const results = filtered.slice(0, limitCount);
            console.log('[GroupManager] Found', results.length, 'groups');
            return results;

        } catch (error) {
            console.error('[GroupManager] Error searching groups:', error);
            return [];
        }
    }

    /**
     * Cleanup (unsubscribe from all listeners)
     */
    cleanup() {
        console.log('[GroupManager] Cleaning up subscriptions');
        this.unsubscribers.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.unsubscribers.clear();
    }
}

// Create global instance
window.groupManager = new GroupManager();

console.log('[GroupManager] Initialized');
