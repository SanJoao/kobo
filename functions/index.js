const { onObjectFinalized } = require("firebase-functions/v2/storage");
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

exports.processKoboDB = onObjectFinalized({ cpu: 2 }, async (event) => {
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

        // 1. Get all books first
        const books = await sqliteDb.all(`
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
        `);

        // 2. Get highlights, handling schema differences
        let highlights = [];
        try {
            // Try query with 'Color' column
            highlights = await sqliteDb.all(`
                SELECT
                    VolumeID AS book_id,
                    Text AS text,
                    Annotation AS annotation,
                    DateCreated AS date_created,
                    Type AS type,
                    Color AS color
                FROM Bookmark
                WHERE Type = 'highlight' OR Type = 'note'
            `);
        } catch (e) {
            if (e.message.includes("no such column: Color")) {
                logger.log("Query failed due to missing 'Color' column. Retrying without it.");
                const highlightsWithoutColor = await sqliteDb.all(`
                    SELECT
                        VolumeID AS book_id,
                        Text AS text,
                        Annotation AS annotation,
                        DateCreated AS date_created,
                        Type AS type
                    FROM Bookmark
                    WHERE Type = 'highlight' OR Type = 'note'
                `);
                // Add default color
                highlights = highlightsWithoutColor.map(h => ({ ...h, color: 0 }));
            } else {
                throw e; // Re-throw other errors
            }
        }

        // 3. Batch write to Firestore
        const batch = db.batch();

        books.forEach(book => {
            if (book.book_id) {
                const sanitizedBookId = book.book_id.replace(/\//g, "__");
                const bookRef = db.collection("users").doc(userId).collection("books").doc(sanitizedBookId);
                batch.set(bookRef, book, { merge: true });
            }
        });

        highlights.forEach(highlight => {
            if (highlight.book_id && highlight.text) {
                const sanitizedBookId = highlight.book_id.replace(/\//g, "__");
                const uniqueString = `${userId}-${sanitizedBookId}-${highlight.text}`;
                const sanitizedHighlightId = crypto.createHash('sha1').update(uniqueString).digest('hex');
                const highlightRef = db.collection("users").doc(userId).collection("highlights").doc(sanitizedHighlightId);
                batch.set(highlightRef, { ...highlight, book_id: sanitizedBookId }, { merge: true });
            }
        });

        await batch.commit();
        logger.log(`Successfully processed and saved ${books.length} books and ${highlights.length} highlights.`);

        // 4. Update status
        if (books.length > 0 && highlights.length === 0) {
            await statusRef.set({ status: 'no_highlights', bookCount: books.length, highlightCount: 0 });
        } else {
            await statusRef.set({ status: 'success', bookCount: books.length, highlightCount: highlights.length });
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
