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
                    batch.commit();
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
                    batch.commit();
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
            await batch.commit();
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
