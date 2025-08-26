import sqlite3
import json
import os
from urllib.parse import urlparse, unquote

def extract_word_list(db_file, output_json_file):
    """
    Connects to an SQLite database, extracts the WordList table, 
    parses the book title from the VolumeId, and saves it as a JSON file.
    """
    conn = None
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()

        # Get all rows from the WordList table
        cursor.execute("SELECT Text, DateCreated, VolumeId FROM WordList;")
        rows = cursor.fetchall()

        # Create a list of dictionaries
        word_list = []
        for row in rows:
            text, date_created, volume_id = row
            
            # Extract book title from VolumeId (which is a file URI)
            try:
                # Parse the URI to get the path
                path = urlparse(volume_id).path
                # Get the filename from the path
                filename = os.path.basename(path)
                # Decode the URL-encoded filename
                decoded_filename = unquote(filename)
                # Remove the extension to get the title
                book_title, _ = os.path.splitext(decoded_filename)
            except Exception:
                # Fallback in case of parsing errors
                book_title = "Unknown Book"

            word_list.append({
                "Text": text,
                "DateCreated": date_created,
                "BookTitle": book_title
            })

        # Write to JSON file
        with open(output_json_file, 'w') as f:
            json.dump(word_list, f, indent=4)

        print(f"Successfully extracted {len(word_list)} words to {output_json_file}")

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    extract_word_list('KoboReader.sqlite', 'words.json')
