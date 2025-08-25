import os
from extract_highlights import extract_and_process_highlights

def process_all_databases(db_folder):
    """
    Iterates through all .sqlite files in a folder and processes them.
    """
    if not os.path.exists(db_folder):
        print(f"Error: Database folder not found at {db_folder}")
        return

    for filename in os.listdir(db_folder):
        if filename.endswith(".sqlite"):
            db_path = os.path.join(db_folder, filename)
            base_filename = os.path.splitext(filename)[0]
            
            books_output = f"{base_filename}_books.json"
            highlights_output = f"{base_filename}_highlights.json"
            
            print(f"\n--- Processing {db_path} ---")
            extract_and_process_highlights(db_path, books_output, highlights_output)

if __name__ == '__main__':
    user_db_folder = r"C:\Users\juanp\Downloads\UsersSQLite"
    process_all_databases(user_db_folder)
