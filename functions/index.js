const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getStorage } = require("firebase-admin/storage");
const { getFirestore } = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const os = require("os");
const path = require("path");
const fs = require("fs");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");

admin.initializeApp();

exports.processKoboDB = onObjectFinalized({ cpu: 2, memory: "1GiB" }, async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name;

    if (!filePath.startsWith("uploads/") || !filePath.endsWith("/KoboReader.sqlite")) {
        return logger.log("This is not a Kobo DB file.");
    }

    const userId = filePath.split("/")[1];
    const bucket = getStorage().bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), "KoboReader.sqlite");
    
    await bucket.file(filePath).download({ destination: tempFilePath });
    logger.log("Database downloaded to", tempFilePath);

    const db = getFirestore();
    const statusRef = db.collection("processingStatus").doc(userId);
    let sqliteDb;

    try {
        sqliteDb = await open({
            filename: tempFilePath,
            driver: sqlite3.Database,
        });

        let batch = db.batch();
        let operationCount = 0;
        let bookCount = 0;
        let highlightCount = 0;
        let wordCount = 0;
        const BATCH_LIMIT = 490;

        // Helper function to commit batch with retry logic
        async function commitBatchWithRetry(batchToCommit, retries = 3) {
            try {
                await batchToCommit.commit();
            } catch (error) {
                if (retries > 0 && (error.code === 'deadline-exceeded' || error.code === 'unavailable')) {
                    logger.warn(`Batch commit failed, retrying... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                    return commitBatchWithRetry(batchToCommit, retries - 1);
                }
                throw error;
            }
        }

        // 1. Process books in a streaming fashion
        const bookQuery = `
            SELECT
                ContentID as book_id,
                Title as title,
                TimeSpentReading as time_spent_reading,
                ___PercentRead as percent_read,
                WordCount as word_count,
                Series as series,
                SeriesNumber as series_number,
                Description as description,
                AverageRating as average_rating,
                RatingCount as rating_count,
                DateLastRead as date_last_read
            FROM content
            WHERE ContentType = 6
        `;

        await sqliteDb.each(bookQuery, [], (err, book) => {
            if (err) {
                throw err;
            }
            if (book && book.book_id) {
                const sanitizedBookId = book.book_id.replace(/\//g, "__");
                const bookRef = db.collection("users").doc(userId).collection("books").doc(sanitizedBookId);
                batch.set(bookRef, book, { merge: true });
                operationCount++;
                bookCount++;

                if (operationCount >= BATCH_LIMIT) {
                    await commitBatchWithRetry(batch);
                    batch = db.batch();
                    operationCount = 0;
                }
            }
        });

        // 2. Process highlights, handling schema differences
        let hasColorColumn = true;
        try {
            await sqliteDb.get("SELECT Color FROM Bookmark LIMIT 1");
        } catch (e) {
            if (e.message.includes("no such column: Color")) {
                logger.log("Query failed due to missing 'Color' column. Proceeding without it.");
                hasColorColumn = false;
            } else {
                throw e;
            }
        }

        const highlightQuery = hasColorColumn
            ? `SELECT VolumeID AS book_id, Text AS text, Annotation AS annotation, DateCreated AS date_created, Type AS type, Color AS color FROM Bookmark WHERE Type = 'highlight' OR Type = 'note'`
            : `SELECT VolumeID AS book_id, Text AS text, Annotation AS annotation, DateCreated AS date_created, Type AS type FROM Bookmark WHERE Type = 'highlight' OR Type = 'note'`;

        await sqliteDb.each(highlightQuery, [], (err, highlight) => {
            if (err) {
                throw err;
            }
            if (highlight && highlight.book_id && highlight.text) {
                if (!hasColorColumn) {
                    highlight.color = 0; // Add default color
                }
                const sanitizedBookId = highlight.book_id.replace(/\//g, "__");
                const uniqueString = `${userId}-${sanitizedBookId}-${highlight.text}`;
                const sanitizedHighlightId = crypto.createHash('sha1').update(uniqueString).digest('hex');
                const highlightRef = db.collection("users").doc(userId).collection("highlights").doc(sanitizedHighlightId);
                batch.set(highlightRef, { ...highlight, book_id: sanitizedBookId }, { merge: true });
                operationCount++;
                highlightCount++;

                if (operationCount >= BATCH_LIMIT) {
                    await commitBatchWithRetry(batch);
                    batch = db.batch();
                    operationCount = 0;
                }
            }
        });

        // 4. Process WordList
        const wordListQuery = "SELECT Text, DateCreated, VolumeId FROM WordList;";
        const words = await sqliteDb.all(wordListQuery);

        for (const word of words) {
            if (word && word.Text && word.VolumeId) {
                let bookTitle = "Unknown Book";
                try {
                    const url = new URL(word.VolumeId);
                    const filename = path.basename(url.pathname);
                    const decodedFilename = decodeURIComponent(filename);
                    bookTitle = path.parse(decodedFilename).name;
                } catch (e) {
                    logger.warn(`Could not parse VolumeId for word: ${word.VolumeId}`);
                }

                const uniqueString = `${userId}-${bookTitle}-${word.Text}`;
                const wordId = crypto.createHash('sha1').update(uniqueString).digest('hex');
                const wordRef = db.collection("users").doc(userId).collection("words").doc(wordId);
                
                batch.set(wordRef, {
                    Text: word.Text,
                    DateCreated: word.DateCreated,
                    BookTitle: bookTitle,
                }, { merge: true });

                operationCount++;
                wordCount++;

                if (operationCount >= BATCH_LIMIT) {
                    await batch.commit();
                    batch = db.batch();
                    operationCount = 0;
                }
            }
        }

        logger.log(`Successfully processed and saved ${bookCount} books, ${highlightCount} highlights, and ${wordCount} words.`);

        // Commit any remaining operations from all steps
        if (operationCount > 0) {
            await commitBatchWithRetry(batch);
        }

        // Ensure the user document exists by setting a field on it.
        const userRef = db.collection("users").doc(userId);
        await userRef.set({ 
            lastUpload: admin.firestore.FieldValue.serverTimestamp() 
        }, { merge: true });

        // 5. Update status
        if (bookCount > 0 && highlightCount === 0) {
            await statusRef.set({ status: 'no_highlights', bookCount: bookCount, highlightCount: 0, wordCount: wordCount });
        } else {
            await statusRef.set({ status: 'success', bookCount: bookCount, highlightCount: highlightCount, wordCount: wordCount });
        }

    } catch (error) {
        logger.error("Error processing database:", error);
        await statusRef.set({ status: 'error', error: error.message });
    } finally {
        if (sqliteDb) {
            await sqliteDb.close();
        }
        fs.unlinkSync(tempFilePath);
    }
});

/**
 * Follow a user
 * Creates follower/following relationships and updates counts
 */
exports.followUser = onCall(async (request) => {
    const { auth, data } = request;

    // Check authentication
    if (!auth) {
        throw new Error('Authentication required');
    }

    const followerId = auth.uid;
    const followingId = data.userId;

    if (!followingId) {
        throw new Error('userId is required');
    }

    if (followerId === followingId) {
        throw new Error('Cannot follow yourself');
    }

    const db = getFirestore();

    try {
        // Check if already following
        const followerDoc = await db
            .collection('users')
            .doc(followingId)
            .collection('followers')
            .doc(followerId)
            .get();

        if (followerDoc.exists) {
            throw new Error('Already following this user');
        }

        // Use batch for atomic operations
        const batch = db.batch();

        // Add to following's followers subcollection
        const followerRef = db
            .collection('users')
            .doc(followingId)
            .collection('followers')
            .doc(followerId);

        batch.set(followerRef, {
            userId: followerId,
            followedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Add to follower's following subcollection
        const followingRef = db
            .collection('users')
            .doc(followerId)
            .collection('following')
            .doc(followingId);

        batch.set(followingRef, {
            userId: followingId,
            followedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Increment follower count on user being followed
        const followingUserRef = db.collection('users').doc(followingId);
        batch.set(followingUserRef, {
            followerCount: admin.firestore.FieldValue.increment(1)
        }, { merge: true });

        // Increment following count on follower
        const followerUserRef = db.collection('users').doc(followerId);
        batch.set(followerUserRef, {
            followingCount: admin.firestore.FieldValue.increment(1)
        }, { merge: true });

        await batch.commit();

        logger.log(`User ${followerId} followed ${followingId}`);

        return {
            success: true,
            message: 'Successfully followed user'
        };

    } catch (error) {
        logger.error('Error following user:', error);
        throw new Error(error.message || 'Failed to follow user');
    }
});

/**
 * Unfollow a user
 * Removes follower/following relationships and updates counts
 */
exports.unfollowUser = onCall(async (request) => {
    const { auth, data } = request;

    // Check authentication
    if (!auth) {
        throw new Error('Authentication required');
    }

    const followerId = auth.uid;
    const followingId = data.userId;

    if (!followingId) {
        throw new Error('userId is required');
    }

    const db = getFirestore();

    try {
        // Check if actually following
        const followerDoc = await db
            .collection('users')
            .doc(followingId)
            .collection('followers')
            .doc(followerId)
            .get();

        if (!followerDoc.exists) {
            throw new Error('Not following this user');
        }

        // Use batch for atomic operations
        const batch = db.batch();

        // Remove from following's followers subcollection
        const followerRef = db
            .collection('users')
            .doc(followingId)
            .collection('followers')
            .doc(followerId);

        batch.delete(followerRef);

        // Remove from follower's following subcollection
        const followingRef = db
            .collection('users')
            .doc(followerId)
            .collection('following')
            .doc(followingId);

        batch.delete(followingRef);

        // Decrement follower count on user being unfollowed
        const followingUserRef = db.collection('users').doc(followingId);
        batch.set(followingUserRef, {
            followerCount: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });

        // Decrement following count on unfollower
        const followerUserRef = db.collection('users').doc(followerId);
        batch.set(followerUserRef, {
            followingCount: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });

        await batch.commit();

        logger.log(`User ${followerId} unfollowed ${followingId}`);

        return {
            success: true,
            message: 'Successfully unfollowed user'
        };

    } catch (error) {
        logger.error('Error unfollowing user:', error);
        throw new Error(error.message || 'Failed to unfollow user');
    }
});

/**
 * Activity Feed: Fan out new highlights to followers
 * Triggered when a new highlight is created
 */
exports.onCreateHighlight = onDocumentCreated(
    "users/{userId}/highlights/{highlightId}",
    async (event) => {
        const userId = event.params.userId;
        const highlightId = event.params.highlightId;
        const highlightData = event.data.data();

        const db = getFirestore();

        try {
            // Get user info (actor)
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                logger.warn(`User ${userId} not found`);
                return;
            }

            const userData = userDoc.data();

            // Get book info
            let bookTitle = 'Unknown Book';
            let bookAuthor = 'Unknown Author';

            if (highlightData.book_id) {
                const bookDoc = await db
                    .collection('users')
                    .doc(userId)
                    .collection('books')
                    .doc(highlightData.book_id)
                    .get();

                if (bookDoc.exists) {
                    const bookData = bookDoc.data();
                    bookTitle = bookData.title || bookTitle;

                    // Extract author from book_id or title
                    if (highlightData.book_id.includes('/')) {
                        const parts = highlightData.book_id.split('/');
                        if (parts.length > 1) {
                            bookAuthor = parts[0];
                        }
                    }
                }
            }

            // Get all followers
            const followersSnapshot = await db
                .collection('users')
                .doc(userId)
                .collection('followers')
                .get();

            if (followersSnapshot.empty) {
                logger.log(`User ${userId} has no followers, skipping feed fanout`);
                return;
            }

            const batch = db.batch();
            let batchCount = 0;
            const BATCH_LIMIT = 490;

            // Create feed item for each follower
            for (const followerDoc of followersSnapshot.docs) {
                const followerId = followerDoc.data().userId;

                const feedItemRef = db
                    .collection('users')
                    .doc(followerId)
                    .collection('feed')
                    .doc(); // Auto-generate ID

                const feedItem = {
                    actorId: userId,
                    actorName: userData.displayName || 'Anonymous',
                    actorPhotoURL: userData.photoURL || null,
                    action: 'highlight',
                    highlightId: highlightId,
                    highlightText: highlightData.text || '',
                    annotation: highlightData.annotation || null,
                    bookId: highlightData.book_id || null,
                    bookTitle: bookTitle,
                    bookAuthor: bookAuthor,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    read: false
                };

                batch.set(feedItemRef, feedItem);
                batchCount++;

                if (batchCount >= BATCH_LIMIT) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            // Commit remaining operations
            if (batchCount > 0) {
                await batch.commit();
            }

            logger.log(`Fanned out highlight ${highlightId} to ${followersSnapshot.size} followers`);

        } catch (error) {
            logger.error('Error fanning out highlight:', error);
        }
    }
);

/**
 * Activity Feed: Fan out finished books to followers
 * Triggered when a book is updated to 100% read
 */
exports.onFinishBook = onDocumentUpdated(
    "users/{userId}/books/{bookId}",
    async (event) => {
        const userId = event.params.userId;
        const bookId = event.params.bookId;
        const beforeData = event.data.before.data();
        const afterData = event.data.after.data();

        const db = getFirestore();

        try {
            // Check if book was just finished (percent_read reached 100)
            const wasFinished = beforeData.percent_read >= 100;
            const isFinished = afterData.percent_read >= 100;

            if (wasFinished || !isFinished) {
                // Book was already finished or not finished yet
                return;
            }

            // Get user info (actor)
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                logger.warn(`User ${userId} not found`);
                return;
            }

            const userData = userDoc.data();

            // Extract book info
            const bookTitle = afterData.title || 'Unknown Book';
            let bookAuthor = 'Unknown Author';

            if (bookId.includes('/')) {
                const parts = bookId.split('/');
                if (parts.length > 1) {
                    bookAuthor = parts[0];
                }
            }

            // Get all followers
            const followersSnapshot = await db
                .collection('users')
                .doc(userId)
                .collection('followers')
                .get();

            if (followersSnapshot.empty) {
                logger.log(`User ${userId} has no followers, skipping feed fanout`);
                return;
            }

            const batch = db.batch();
            let batchCount = 0;
            const BATCH_LIMIT = 490;

            // Create feed item for each follower
            for (const followerDoc of followersSnapshot.docs) {
                const followerId = followerDoc.data().userId;

                const feedItemRef = db
                    .collection('users')
                    .doc(followerId)
                    .collection('feed')
                    .doc(); // Auto-generate ID

                const feedItem = {
                    actorId: userId,
                    actorName: userData.displayName || 'Anonymous',
                    actorPhotoURL: userData.photoURL || null,
                    action: 'finished_book',
                    bookId: bookId,
                    bookTitle: bookTitle,
                    bookAuthor: bookAuthor,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    read: false
                };

                batch.set(feedItemRef, feedItem);
                batchCount++;

                if (batchCount >= BATCH_LIMIT) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            // Commit remaining operations
            if (batchCount > 0) {
                await batch.commit();
            }

            logger.log(`Fanned out finished book ${bookId} to ${followersSnapshot.size} followers`);

        } catch (error) {
            logger.error('Error fanning out finished book:', error);
        }
    }
);

/**
 * Cleanup old feed items
 * Runs daily at midnight UTC
 * Removes items older than 30 days and limits to 100 items per user
 */
exports.cleanupFeeds = onSchedule("0 0 * * *", async (event) => {
    const db = getFirestore();

    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();

        logger.log(`Cleaning up feeds for ${usersSnapshot.size} users`);

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;

            // Get feed items older than 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const oldItemsSnapshot = await db
                .collection('users')
                .doc(userId)
                .collection('feed')
                .where('timestamp', '<', thirtyDaysAgo)
                .get();

            // Delete old items
            const batch = db.batch();
            let batchCount = 0;
            const BATCH_LIMIT = 490;

            for (const itemDoc of oldItemsSnapshot.docs) {
                batch.delete(itemDoc.ref);
                batchCount++;

                if (batchCount >= BATCH_LIMIT) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
                batchCount = 0;
            }

            // Limit to 100 items (keep most recent)
            const allItemsSnapshot = await db
                .collection('users')
                .doc(userId)
                .collection('feed')
                .orderBy('timestamp', 'desc')
                .get();

            if (allItemsSnapshot.size > 100) {
                const itemsToDelete = allItemsSnapshot.docs.slice(100);

                for (const itemDoc of itemsToDelete) {
                    batch.delete(itemDoc.ref);
                    batchCount++;

                    if (batchCount >= BATCH_LIMIT) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }

                if (batchCount > 0) {
                    await batch.commit();
                }

                logger.log(`Deleted ${itemsToDelete.length} excess feed items for user ${userId}`);
            }
        }

        logger.log('Feed cleanup completed successfully');

    } catch (error) {
        logger.error('Error cleaning up feeds:', error);
    }
});

/**
 * Comments System
 * CRUD operations for highlight comments
 */

/**
 * Create a comment on a highlight
 */
exports.createComment = onCall(async (request) => {
    const { auth, data } = request;

    // Check authentication
    if (!auth) {
        throw new Error('Authentication required');
    }

    const userId = auth.uid;
    const { highlightId, highlightOwnerId, text, parentId } = data;

    if (!highlightId || !text || !highlightOwnerId) {
        throw new Error('highlightId, highlightOwnerId, and text are required');
    }

    if (text.trim().length === 0) {
        throw new Error('Comment text cannot be empty');
    }

    if (text.length > 1000) {
        throw new Error('Comment text cannot exceed 1000 characters');
    }

    const db = getFirestore();

    try {
        // Get user info
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error('User not found');
        }

        const userData = userDoc.data();

        // Create comment
        const commentData = {
            userId,
            userName: userData.displayName || 'Anonymous',
            userPhotoURL: userData.photoURL || null,
            text: text.trim(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            edited: false,
            highlightId,
            highlightOwnerId,
            parentId: parentId || null,
            replyCount: 0
        };

        // Add comment to highlight owner's comments subcollection
        const commentRef = await db
            .collection('users')
            .doc(highlightOwnerId)
            .collection('highlights')
            .doc(highlightId)
            .collection('comments')
            .add(commentData);

        // If it's a reply, increment parent's reply count
        if (parentId) {
            const parentCommentRef = db
                .collection('users')
                .doc(highlightOwnerId)
                .collection('highlights')
                .doc(highlightId)
                .collection('comments')
                .doc(parentId);

            await parentCommentRef.update({
                replyCount: admin.firestore.FieldValue.increment(1)
            });
        }

        logger.log(`Comment created: ${commentRef.id} by user ${userId} on highlight ${highlightId}`);

        return {
            success: true,
            commentId: commentRef.id,
            comment: {
                id: commentRef.id,
                ...commentData,
                timestamp: new Date()
            }
        };

    } catch (error) {
        logger.error('Error creating comment:', error);
        throw new Error(error.message || 'Failed to create comment');
    }
});

/**
 * Update a comment
 */
exports.updateComment = onCall(async (request) => {
    const { auth, data } = request;

    if (!auth) {
        throw new Error('Authentication required');
    }

    const userId = auth.uid;
    const { commentId, highlightId, highlightOwnerId, text } = data;

    if (!commentId || !highlightId || !highlightOwnerId || !text) {
        throw new Error('commentId, highlightId, highlightOwnerId, and text are required');
    }

    if (text.trim().length === 0) {
        throw new Error('Comment text cannot be empty');
    }

    if (text.length > 1000) {
        throw new Error('Comment text cannot exceed 1000 characters');
    }

    const db = getFirestore();

    try {
        const commentRef = db
            .collection('users')
            .doc(highlightOwnerId)
            .collection('highlights')
            .doc(highlightId)
            .collection('comments')
            .doc(commentId);

        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            throw new Error('Comment not found');
        }

        const commentData = commentDoc.data();

        // Check if user owns the comment
        if (commentData.userId !== userId) {
            throw new Error('You can only edit your own comments');
        }

        // Update comment
        await commentRef.update({
            text: text.trim(),
            edited: true,
            editedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        logger.log(`Comment updated: ${commentId} by user ${userId}`);

        return {
            success: true,
            message: 'Comment updated successfully'
        };

    } catch (error) {
        logger.error('Error updating comment:', error);
        throw new Error(error.message || 'Failed to update comment');
    }
});

/**
 * Delete a comment
 */
exports.deleteComment = onCall(async (request) => {
    const { auth, data } = request;

    if (!auth) {
        throw new Error('Authentication required');
    }

    const userId = auth.uid;
    const { commentId, highlightId, highlightOwnerId, parentId } = data;

    if (!commentId || !highlightId || !highlightOwnerId) {
        throw new Error('commentId, highlightId, and highlightOwnerId are required');
    }

    const db = getFirestore();

    try {
        const commentRef = db
            .collection('users')
            .doc(highlightOwnerId)
            .collection('highlights')
            .doc(highlightId)
            .collection('comments')
            .doc(commentId);

        const commentDoc = await commentRef.get();

        if (!commentDoc.exists) {
            throw new Error('Comment not found');
        }

        const commentData = commentDoc.data();

        // Check if user owns the comment or owns the highlight
        if (commentData.userId !== userId && highlightOwnerId !== userId) {
            throw new Error('You can only delete your own comments or comments on your highlights');
        }

        // If comment has replies, just mark as deleted instead of removing
        if (commentData.replyCount > 0) {
            await commentRef.update({
                text: '[deleted]',
                deleted: true,
                deletedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // No replies, safe to delete completely
            await commentRef.delete();

            // If it's a reply, decrement parent's reply count
            if (parentId) {
                const parentCommentRef = db
                    .collection('users')
                    .doc(highlightOwnerId)
                    .collection('highlights')
                    .doc(highlightId)
                    .collection('comments')
                    .doc(parentId);

                await parentCommentRef.update({
                    replyCount: admin.firestore.FieldValue.increment(-1)
                });
            }
        }

        logger.log(`Comment deleted: ${commentId} by user ${userId}`);

        return {
            success: true,
            message: 'Comment deleted successfully'
        };

    } catch (error) {
        logger.error('Error deleting comment:', error);
        throw new Error(error.message || 'Failed to delete comment');
    }
});

/**
 * Notifications System
 * Creates notifications for important events
 */

/**
 * Helper function to create a notification
 */
async function createNotification(db, userId, notificationData) {
    try {
        await db.collection('users').doc(userId).collection('notifications').add({
            ...notificationData,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        // Increment unread count
        await db.collection('users').doc(userId).update({
            unreadNotifications: admin.firestore.FieldValue.increment(1)
        });

        logger.log(`Notification created for user ${userId}`);
    } catch (error) {
        logger.error('Error creating notification:', error);
    }
}

/**
 * Trigger: Notify when someone comments on your highlight
 */
exports.onCommentCreated = onDocumentCreated(
    "users/{userId}/highlights/{highlightId}/comments/{commentId}",
    async (event) => {
        const highlightOwnerId = event.params.userId;
        const highlightId = event.params.highlightId;
        const commentId = event.params.commentId;
        const commentData = event.data.data();

        const db = getFirestore();

        try {
            // Don't notify if commenting on own highlight
            if (commentData.userId === highlightOwnerId) {
                return;
            }

            // Get highlight data
            const highlightDoc = await db
                .collection('users')
                .doc(highlightOwnerId)
                .collection('highlights')
                .doc(highlightId)
                .get();

            if (!highlightDoc.exists) {
                return;
            }

            const highlightData = highlightDoc.data();

            // Create notification
            if (commentData.parentId) {
                // This is a reply - notify the parent comment author
                const parentCommentDoc = await db
                    .collection('users')
                    .doc(highlightOwnerId)
                    .collection('highlights')
                    .doc(highlightId)
                    .collection('comments')
                    .doc(commentData.parentId)
                    .get();

                if (parentCommentDoc.exists) {
                    const parentCommentData = parentCommentDoc.data();
                    const parentAuthorId = parentCommentData.userId;

                    // Don't notify if replying to own comment
                    if (parentAuthorId !== commentData.userId) {
                        await createNotification(db, parentAuthorId, {
                            type: 'comment_reply',
                            actorId: commentData.userId,
                            actorName: commentData.userName,
                            actorPhotoURL: commentData.userPhotoURL,
                            highlightId: highlightId,
                            highlightText: highlightData.text?.substring(0, 100) || '',
                            commentId: commentId,
                            commentText: commentData.text.substring(0, 100),
                            highlightOwnerId: highlightOwnerId
                        });
                    }
                }
            } else {
                // Top-level comment - notify highlight owner
                await createNotification(db, highlightOwnerId, {
                    type: 'new_comment',
                    actorId: commentData.userId,
                    actorName: commentData.userName,
                    actorPhotoURL: commentData.userPhotoURL,
                    highlightId: highlightId,
                    highlightText: highlightData.text?.substring(0, 100) || '',
                    commentId: commentId,
                    commentText: commentData.text.substring(0, 100)
                });
            }

            logger.log(`Comment notification created for highlight ${highlightId}`);

        } catch (error) {
            logger.error('Error creating comment notification:', error);
        }
    }
);

/**
 * Trigger: Notify when someone follows you
 */
exports.onNewFollower = onDocumentCreated(
    "users/{userId}/followers/{followerId}",
    async (event) => {
        const userId = event.params.userId;
        const followerId = event.params.followerId;

        const db = getFirestore();

        try {
            // Get follower info
            const followerDoc = await db.collection('users').doc(followerId).get();

            if (!followerDoc.exists) {
                return;
            }

            const followerData = followerDoc.data();

            // Create notification
            await createNotification(db, userId, {
                type: 'new_follower',
                actorId: followerId,
                actorName: followerData.displayName || 'Anonymous',
                actorPhotoURL: followerData.photoURL || null
            });

            logger.log(`Follower notification created: ${followerId} followed ${userId}`);

        } catch (error) {
            logger.error('Error creating follower notification:', error);
        }
    }
);

/**
 * Mark notification as read
 */
exports.markNotificationRead = onCall(async (request) => {
    const { auth, data } = request;

    if (!auth) {
        throw new Error('Authentication required');
    }

    const userId = auth.uid;
    const { notificationId } = data;

    if (!notificationId) {
        throw new Error('notificationId is required');
    }

    const db = getFirestore();

    try {
        const notificationRef = db
            .collection('users')
            .doc(userId)
            .collection('notifications')
            .doc(notificationId);

        const notificationDoc = await notificationRef.get();

        if (!notificationDoc.exists) {
            throw new Error('Notification not found');
        }

        const notificationData = notificationDoc.data();

        // Only mark as read if it's currently unread
        if (!notificationData.read) {
            await notificationRef.update({
                read: true,
                readAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Decrement unread count
            await db.collection('users').doc(userId).update({
                unreadNotifications: admin.firestore.FieldValue.increment(-1)
            });
        }

        logger.log(`Notification ${notificationId} marked as read`);

        return {
            success: true,
            message: 'Notification marked as read'
        };

    } catch (error) {
        logger.error('Error marking notification as read:', error);
        throw new Error(error.message || 'Failed to mark notification as read');
    }
});

/**
 * Mark all notifications as read
 */
exports.markAllNotificationsRead = onCall(async (request) => {
    const { auth } = request;

    if (!auth) {
        throw new Error('Authentication required');
    }

    const userId = auth.uid;
    const db = getFirestore();

    try {
        // Get all unread notifications
        const unreadQuery = await db
            .collection('users')
            .doc(userId)
            .collection('notifications')
            .where('read', '==', false)
            .get();

        if (unreadQuery.empty) {
            return {
                success: true,
                message: 'No unread notifications',
                count: 0
            };
        }

        const batch = db.batch();
        let count = 0;

        unreadQuery.docs.forEach(doc => {
            batch.update(doc.ref, {
                read: true,
                readAt: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
        });

        await batch.commit();

        // Reset unread count
        await db.collection('users').doc(userId).update({
            unreadNotifications: 0
        });

        logger.log(`Marked ${count} notifications as read for user ${userId}`);

        return {
            success: true,
            message: `Marked ${count} notifications as read`,
            count
        };

    } catch (error) {
        logger.error('Error marking all notifications as read:', error);
        throw new Error(error.message || 'Failed to mark all notifications as read');
    }
});
