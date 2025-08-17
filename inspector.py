import sqlite3

def inspect_table(db_file, table_name):
    """
    Connects to an SQLite database and inspects a table's schema and some sample data.
    """
    conn = None
    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        
        # Get table schema
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        
        if columns:
            print(f"Schema for table '{table_name}':")
            for column in columns:
                print(f"- {column[1]} ({column[2]})")
        else:
            print(f"Table '{table_name}' not found or has no columns.")
            return

        # Get a few rows of data
        cursor.execute(f"SELECT * FROM {table_name} LIMIT 5;")
        rows = cursor.fetchall()

        if rows:
            print(f"\nSample data from '{table_name}':")
            for row in rows:
                print(row)
        else:
            print(f"\nNo data found in '{table_name}'.")

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    inspect_table('KoboReader.sqlite', 'content')
