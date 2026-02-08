/**
 * Comment Manager for Koby
 * Handles comment operations and real-time updates
 */

import { db, functions } from "./firebase-config.js";
import { collection, query, orderBy, getDocs, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

export class CommentManager {
    constructor() {
        this.db = db;
        this.functions = functions;
        this.createCommentFn = httpsCallable(this.functions, 'createComment');
        this.updateCommentFn = httpsCallable(this.functions, 'updateComment');
        this.deleteCommentFn = httpsCallable(this.functions, 'deleteComment');
        this.commentListeners = new Map();
    }

    /**
     * Load comments for a highlight
     */
    async loadComments(highlightId, highlightOwnerId) {
        try {
            console.log('[CommentManager] Loading comments for highlight:', highlightId);

            const commentsRef = collection(
                this.db,
                'users',
                highlightOwnerId,
                'highlights',
                highlightId,
                'comments'
            );

            const commentsQuery = query(commentsRef, orderBy('timestamp', 'asc'));
            const snapshot = await getDocs(commentsQuery);

            const comments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            }));

            console.log('[CommentManager] Loaded', comments.length, 'comments');
            return this.organizeComments(comments);

        } catch (error) {
            console.error('[CommentManager] Error loading comments:', error);
            return { topLevel: [], byParent: {} };
        }
    }

    /**
     * Organize comments into threaded structure
     */
    organizeComments(comments) {
        const topLevel = [];
        const byParent = {};

        comments.forEach(comment => {
            if (comment.parentId) {
                // It's a reply
                if (!byParent[comment.parentId]) {
                    byParent[comment.parentId] = [];
                }
                byParent[comment.parentId].push(comment);
            } else {
                // It's a top-level comment
                topLevel.push(comment);
            }
        });

        return { topLevel, byParent };
    }

    /**
     * Subscribe to real-time comment updates
     */
    subscribeToComments(highlightId, highlightOwnerId, callback) {
        try {
            console.log('[CommentManager] Subscribing to comments');

            const commentsRef = collection(
                this.db,
                'users',
                highlightOwnerId,
                'highlights',
                highlightId,
                'comments'
            );

            const commentsQuery = query(commentsRef, orderBy('timestamp', 'asc'));

            const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
                const comments = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    timestamp: doc.data().timestamp?.toDate() || new Date()
                }));

                const organized = this.organizeComments(comments);
                callback(organized);
            });

            // Store unsubscribe function
            this.commentListeners.set(highlightId, unsubscribe);

            return unsubscribe;

        } catch (error) {
            console.error('[CommentManager] Error subscribing to comments:', error);
            return null;
        }
    }

    /**
     * Unsubscribe from comment updates
     */
    unsubscribeFromComments(highlightId) {
        const unsubscribe = this.commentListeners.get(highlightId);
        if (unsubscribe) {
            console.log('[CommentManager] Unsubscribing from comments');
            unsubscribe();
            this.commentListeners.delete(highlightId);
        }
    }

    /**
     * Create a comment
     */
    async createComment(highlightId, highlightOwnerId, text, parentId = null) {
        try {
            console.log('[CommentManager] Creating comment');

            const result = await this.createCommentFn({
                highlightId,
                highlightOwnerId,
                text,
                parentId
            });

            if (result.data.success) {
                console.log('[CommentManager] Comment created:', result.data.commentId);
                return { success: true, comment: result.data.comment };
            }

            throw new Error(result.data.message || 'Failed to create comment');

        } catch (error) {
            console.error('[CommentManager] Error creating comment:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update a comment
     */
    async updateComment(commentId, highlightId, highlightOwnerId, text) {
        try {
            console.log('[CommentManager] Updating comment');

            const result = await this.updateCommentFn({
                commentId,
                highlightId,
                highlightOwnerId,
                text
            });

            if (result.data.success) {
                console.log('[CommentManager] Comment updated');
                return { success: true };
            }

            throw new Error(result.data.message || 'Failed to update comment');

        } catch (error) {
            console.error('[CommentManager] Error updating comment:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a comment
     */
    async deleteComment(commentId, highlightId, highlightOwnerId, parentId = null) {
        try {
            console.log('[CommentManager] Deleting comment');

            const result = await this.deleteCommentFn({
                commentId,
                highlightId,
                highlightOwnerId,
                parentId
            });

            if (result.data.success) {
                console.log('[CommentManager] Comment deleted');
                return { success: true };
            }

            throw new Error(result.data.message || 'Failed to delete comment');

        } catch (error) {
            console.error('[CommentManager] Error deleting comment:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Render comment HTML
     */
    renderComment(comment, currentUserId, highlightOwnerId, level = 0) {
        const isOwner = comment.userId === currentUserId;
        const isHighlightOwner = highlightOwnerId === currentUserId;
        const canDelete = isOwner || isHighlightOwner;
        const isDeleted = comment.deleted || false;

        const timeAgo = this.getTimeAgo(comment.timestamp);

        return `
            <div class="comment ${level > 0 ? 'comment-reply' : ''}"
                 data-comment-id="${comment.id}"
                 data-parent-id="${comment.parentId || ''}"
                 style="margin-left: ${level * 40}px">
                <div class="comment-header">
                    <img src="${comment.userPhotoURL || '/assets/default-avatar.png'}"
                         alt="${comment.userName}"
                         class="comment-avatar">
                    <div class="comment-meta">
                        <span class="comment-author">${this.escapeHtml(comment.userName)}</span>
                        <span class="comment-time">${timeAgo}${comment.edited ? ' (edited)' : ''}</span>
                    </div>
                    ${!isDeleted && (isOwner || canDelete) ? `
                        <div class="comment-actions">
                            ${isOwner ? `
                                <button class="comment-action-btn edit-btn"
                                        onclick="editComment('${comment.id}', '${comment.highlightId}', '${highlightOwnerId}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                            ` : ''}
                            ${canDelete ? `
                                <button class="comment-action-btn delete-btn"
                                        onclick="deleteComment('${comment.id}', '${comment.highlightId}', '${highlightOwnerId}', '${comment.parentId || ''}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
                <div class="comment-body">
                    <p class="comment-text ${isDeleted ? 'deleted' : ''}">${this.escapeHtml(comment.text)}</p>
                </div>
                ${!isDeleted && currentUserId ? `
                    <div class="comment-footer">
                        <button class="comment-reply-btn"
                                onclick="showReplyForm('${comment.id}', '${comment.highlightId}', '${highlightOwnerId}')">
                            <i class="fas fa-reply"></i> Reply
                        </button>
                        ${comment.replyCount > 0 ? `
                            <span class="comment-reply-count">${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}</span>
                        ` : ''}
                    </div>
                    <div class="reply-form-container" id="reply-form-${comment.id}" style="display: none;">
                        <!-- Reply form will be injected here -->
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render comment form
     */
    renderCommentForm(highlightId, highlightOwnerId, parentId = null) {
        return `
            <div class="comment-form">
                <textarea class="comment-input"
                          id="${parentId ? `reply-input-${parentId}` : 'comment-input'}"
                          placeholder="${parentId ? 'Write a reply...' : 'Write a comment...'}"
                          maxlength="1000"
                          rows="3"></textarea>
                <div class="comment-form-actions">
                    <span class="comment-char-count">
                        <span id="${parentId ? `reply-count-${parentId}` : 'comment-count'}">0</span>/1000
                    </span>
                    <div>
                        ${parentId ? `
                            <button class="btn-secondary" onclick="hideReplyForm('${parentId}')">
                                Cancel
                            </button>
                        ` : ''}
                        <button class="btn-primary"
                                onclick="submitComment('${highlightId}', '${highlightOwnerId}', ${parentId ? `'${parentId}'` : 'null'})">
                            ${parentId ? 'Reply' : 'Post Comment'}
                        </button>
                    </div>
                </div>
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
window.commentManager = new CommentManager();

console.log('[CommentManager] Initialized');
