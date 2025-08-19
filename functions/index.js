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

    const sqliteDb = await open({
        filename: tempFilePath,
        driver: sqlite3.Database,
    });

    try {
        const results = await sqliteDb.all(`
            SELECT
                b.BookmarkID AS highlight_id,
                b.VolumeID AS book_id,
                b.Text AS text,
                b.Annotation AS annotation,
                b.DateCreated AS date_created,
                b.Type AS type,
                b.Color AS color,
                c.Title AS title,
                c.Attribution AS author,
                c.TimeSpentReading as time_spent_reading,
                c.___PercentRead as percent_read,
                c.WordCount as word_count,
                c.Series as series,
                c.SeriesNumber as series_number,
                c.Description as description,
                c.AverageRating as average_rating,
                c.RatingCount as rating_count,
                c.DateLastRead as date_last_read
            FROM Bookmark b
            LEFT JOIN content c ON b.VolumeID = c.ContentID
            WHERE b.Type = 'highlight' OR b.Type = 'note'
        `);

        const db = getFirestore();
        const batch = db.batch();
        const bookMap = new Map();

        results.forEach(row => {
            const sanitizedBookId = row.book_id.replace(/\//g, "__");
            const sanitizedHighlightId = row.highlight_id.replace(/\//g, "__");

            // Add book to batch if it's new
            if (!bookMap.has(sanitizedBookId) && row.title) { // Ensure title is not null
                const bookRef = db.collection("users").doc(userId).collection("books").doc(sanitizedBookId);
                batch.set(bookRef, {
                    title: row.title,
                    author: row.author,
                    time_spent_reading: row.time_spent_reading,
                    percent_read: row.percent_read,
                    word_count: row.word_count,
                    series: row.series,
                    series_number: row.series_number,
                    description: row.description,
                    average_rating: row.average_rating,
                    rating_count: row.rating_count,
                    date_last_read: row.date_last_read,
                });
                bookMap.set(sanitizedBookId, true);
            }

            // Add highlight to batch
            const highlightRef = db.collection("users").doc(userId).collection("highlights").doc(sanitizedHighlightId);
            batch.set(highlightRef, {
                book_id: sanitizedBookId,
                text: row.text,
                annotation: row.annotation,
                date_created: row.date_created,
                color: row.color,
                type: row.type,
            });
        });

        await batch.commit();
        logger.log(`Successfully processed and saved ${results.length} highlights to Firestore.`);

    } catch (error) {
        logger.error("Error processing database:", error);
    } finally {
        await sqliteDb.close();
        fs.unlinkSync(tempFilePath);
    }
});
