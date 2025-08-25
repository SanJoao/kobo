import sqlite3
import json
import re

def extract_and_process_highlights(db_file, books_output_file, highlights_output_file):
    """
    Connects to the Kobo database, extracts highlights and book information,
    processes the data, and saves it to separate JSON files.
    """
    conn = None
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()

        # First, get all books from the content table
        cursor.execute("""
            SELECT
                ContentID,
                Title,
                TimeSpentReading,
                ___PercentRead,
                WordCount,
                Series,
                SeriesNumber,
                Description,
                AverageRating,
                RatingCount,
                DateLastRead
            FROM content
            WHERE ContentType = 6
        """)
        all_books_data = cursor.fetchall()

        books = {}
        for row in all_books_data:
            (content_id, title, time_spent_reading, percent_read, word_count,
             series, series_number, description, average_rating, rating_count,
             date_last_read) = row
            books[content_id] = {
                'book_id': content_id,
                'title': title,
                'time_spent_reading': time_spent_reading,
                'percent_read': percent_read,
                'word_count': word_count,
                'series': series,
                'series_number': series_number,
                'description': description,
                'average_rating': average_rating,
                'rating_count': rating_count,
                'date_last_read': date_last_read
            }

        # Now, get all highlights
        try:
            # Try to execute the query with the 'Color' column
            cursor.execute("""
                SELECT
                    VolumeID,
                    Text,
                    Annotation,
                    DateCreated,
                    Type,
                    Color
                FROM Bookmark
                WHERE Type = 'highlight' OR Type = 'note'
            """)
            highlights_data = cursor.fetchall()
            color_column_exists = True
        except sqlite3.OperationalError as e:
            if "no such column: Color" in str(e):
                # If 'Color' column doesn't exist, run a modified query
                cursor.execute("""
                    SELECT
                        VolumeID,
                        Text,
                        Annotation,
                        DateCreated,
                        Type
                    FROM Bookmark
                    WHERE Type = 'highlight' OR Type = 'note'
                """)
                highlights_data = cursor.fetchall()
                color_column_exists = False
            else:
                raise

        highlights = []
        for row in highlights_data:
            if color_column_exists:
                (volume_id, text, annotation, date_created, highlight_type, color) = row
            else:
                (volume_id, text, annotation, date_created, highlight_type) = row
                color = 0  # Default color

            highlights.append({
                'book_id': volume_id,
                'text': text,
                'annotation': annotation,
                'date_created': date_created,
                'type': highlight_type,
                'color': color
            })

        with open(books_output_file, 'w', encoding='utf-8') as f:
            json.dump(list(books.values()), f, indent=4, ensure_ascii=False)
        
        with open(highlights_output_file, 'w', encoding='utf-8') as f:
            json.dump(highlights, f, indent=4, ensure_ascii=False)
        
        print(f"Successfully processed {len(books)} books and {len(highlights)} highlights.")
        print(f"Book data saved to {books_output_file}")
        print(f"Highlight data saved to {highlights_output_file}")

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    import sys
    if len(sys.argv) != 4:
        print("Usage: python extract_highlights.py <db_file> <books_output_file> <highlights_output_file>")
        sys.exit(1)
    
    db_file = sys.argv[1]
    books_output_file = sys.argv[2]
    highlights_output_file = sys.argv[3]
    
    extract_and_process_highlights(db_file, books_output_file, highlights_output_file)
