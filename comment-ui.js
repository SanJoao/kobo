/**
 * Comment UI Component for Koby
 * Handles comment rendering and user interactions
 */

import { auth } from "./firebase-config.js";

export class CommentUI {
    constructor() {
        this.auth = auth;
        this.currentHighlightId = null;
        this.currentHighlightOwnerId = null;
    }

    /**
     * Initialize comment section for a highlight
     */
    async initializeComments(highlightId, highlightOwnerId, containerId) {
        this.currentHighlightId = highlightId;
        this.currentHighlightOwnerId = highlightOwnerId;

        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('[CommentUI] Container not found:', containerId);
            return;
        }

        // Show loading state
        container.innerHTML = `
            <div class="comments-section">
                <h3 class="comments-header">
                    <i class="fas fa-comments"></i> Comments
                </h3>
                <div class="comments-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading comments...</p>
                </div>
            </div>
        `;

        // Subscribe to real-time updates
        window.commentManager.subscribeToComments(highlightId, highlightOwnerId, (organized) => {
            this.renderComments(organized, container);
        });
    }

    /**
     * Render comments section
     */
    renderComments(organized, container) {
        const currentUser = this.auth.currentUser;
        const { topLevel, byParent } = organized;

        let html = `
            <div class="comments-section">
                <h3 class="comments-header">
                    <i class="fas fa-comments"></i> Comments
                    ${topLevel.length > 0 ? `<span class="comments-count">(${topLevel.length})</span>` : ''}
                </h3>
        `;

        // Add comment form if user is logged in
        if (currentUser) {
            html += window.commentManager.renderCommentForm(
                this.currentHighlightId,
                this.currentHighlightOwnerId
            );
        } else {
            html += `
                <div class="comments-login-prompt">
                    <p><i class="fas fa-sign-in-alt"></i> <a href="/login.html">Sign in</a> to join the conversation</p>
                </div>
            `;
        }

        // Render comments
        if (topLevel.length === 0) {
            html += `
                <div class="comments-empty">
                    <i class="fas fa-comment-slash"></i>
                    <p>No comments yet</p>
                    <p class="comments-empty-hint">Be the first to share your thoughts!</p>
                </div>
            `;
        } else {
            html += '<div class="comments-list">';

            topLevel.forEach(comment => {
                html += this.renderCommentThread(comment, byParent, currentUser?.uid, 0);
            });

            html += '</div>';
        }

        html += '</div>';

        container.innerHTML = html;

        // Setup character counter
        this.setupCharacterCounter();
    }

    /**
     * Render comment thread (comment + replies)
     */
    renderCommentThread(comment, byParent, currentUserId, level) {
        let html = window.commentManager.renderComment(
            comment,
            currentUserId,
            this.currentHighlightOwnerId,
            level
        );

        // Render replies
        const replies = byParent[comment.id] || [];
        if (replies.length > 0) {
            replies.forEach(reply => {
                html += this.renderCommentThread(reply, byParent, currentUserId, level + 1);
            });
        }

        return html;
    }

    /**
     * Setup character counter for comment input
     */
    setupCharacterCounter() {
        const commentInput = document.getElementById('comment-input');
        const commentCount = document.getElementById('comment-count');

        if (commentInput && commentCount) {
            commentInput.addEventListener('input', (e) => {
                commentCount.textContent = e.target.value.length;
            });
        }

        // Setup for all reply inputs
        document.querySelectorAll('[id^="reply-input-"]').forEach(input => {
            const parentId = input.id.replace('reply-input-', '');
            const counter = document.getElementById(`reply-count-${parentId}`);

            if (counter) {
                input.addEventListener('input', (e) => {
                    counter.textContent = e.target.value.length;
                });
            }
        });
    }

    /**
     * Cleanup (unsubscribe from listeners)
     */
    cleanup() {
        if (this.currentHighlightId) {
            window.commentManager.unsubscribeFromComments(this.currentHighlightId);
        }
    }
}

// Create global instance
window.commentUI = new CommentUI();

// Global helper functions for onclick handlers
window.submitComment = async function (highlightId, highlightOwnerId, parentId = null) {
    // Import auth dynamically to ensure it's available
    const { auth } = await import('./firebase-config.js');
    const currentUser = auth.currentUser;
    if (!currentUser) {
        window.location.href = '/login.html';
        return;
    }

    const inputId = parentId ? `reply-input-${parentId}` : 'comment-input';
    const input = document.getElementById(inputId);

    if (!input) return;

    const text = input.value.trim();
    if (!text) {
        alert('Please enter a comment');
        return;
    }

    // Disable input
    input.disabled = true;

    try {
        const result = await window.commentManager.createComment(
            highlightId,
            highlightOwnerId,
            text,
            parentId
        );

        if (result.success) {
            // Clear input
            input.value = '';

            // Update character count
            const countId = parentId ? `reply-count-${parentId}` : 'comment-count';
            const counter = document.getElementById(countId);
            if (counter) counter.textContent = '0';

            // Hide reply form if it's a reply
            if (parentId) {
                hideReplyForm(parentId);
            }
        } else {
            alert('Failed to post comment: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error submitting comment:', error);
        alert('Failed to post comment. Please try again.');
    } finally {
        input.disabled = false;
    }
};

window.editComment = async function (commentId, highlightId, highlightOwnerId) {
    const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (!commentEl) return;

    const textEl = commentEl.querySelector('.comment-text');
    const currentText = textEl.textContent;

    const newText = prompt('Edit your comment:', currentText);
    if (!newText || newText === currentText) return;

    try {
        const result = await window.commentManager.updateComment(
            commentId,
            highlightId,
            highlightOwnerId,
            newText
        );

        if (!result.success) {
            alert('Failed to edit comment: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error editing comment:', error);
        alert('Failed to edit comment. Please try again.');
    }
};

window.deleteComment = async function (commentId, highlightId, highlightOwnerId, parentId = null) {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
        const result = await window.commentManager.deleteComment(
            commentId,
            highlightId,
            highlightOwnerId,
            parentId || null
        );

        if (!result.success) {
            alert('Failed to delete comment: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting comment:', error);
        alert('Failed to delete comment. Please try again.');
    }
};

window.showReplyForm = function (commentId, highlightId, highlightOwnerId) {
    const container = document.getElementById(`reply-form-${commentId}`);
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = window.commentManager.renderCommentForm(
        highlightId,
        highlightOwnerId,
        commentId
    );

    // Setup character counter for this reply form
    const input = document.getElementById(`reply-input-${commentId}`);
    const counter = document.getElementById(`reply-count-${commentId}`);

    if (input && counter) {
        input.addEventListener('input', (e) => {
            counter.textContent = e.target.value.length;
        });
        input.focus();
    }
};

window.hideReplyForm = function (commentId) {
    const container = document.getElementById(`reply-form-${commentId}`);
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
};

console.log('[CommentUI] Initialized');
