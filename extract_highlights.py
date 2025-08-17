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

        cursor.execute("""
            SELECT
                b.VolumeID,
                b.Text,
                b.Annotation,
                b.DateCreated,
                b.Type,
                b.Color,
                c.TimeSpentReading,
                c.___PercentRead,
                c.WordCount,
                c.Series,
                c.SeriesNumber,
                c.Description,
                c.AverageRating,
                c.RatingCount,
                c.DateLastRead,
                c.Title
            FROM Bookmark b
            LEFT JOIN content c ON b.VolumeID = c.ContentID
            WHERE b.Type = 'highlight' OR b.Type = 'note'
        """)
        highlights_data = cursor.fetchall()

        books = {}
        highlights = []
        for row in highlights_data:
            (volume_id, text, annotation, date_created, highlight_type, color,
             time_spent_reading, percent_read, word_count, series, series_number,
             description, average_rating, rating_count, date_last_read, title) = row

            if volume_id not in books:
                books[volume_id] = {
                    'book_id': volume_id,
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
    extract_and_process_highlights('KoboReader.sqlite', 'books.json', 'highlights.json')
