import sqlite3
import os

def get_db_schema(db_path):
    """Connects to a SQLite database and returns its schema."""
    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}")
        return None

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        schema = {}
        for table_name in tables:
            table_name = table_name[0]
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            schema[table_name] = columns
            
        return schema
    except sqlite3.Error as e:
        print(f"Database error with {db_path}: {e}")
        return None
    finally:
        if conn:
            conn.close()

def compare_schemas(schema1, schema2):
    """Compares two database schemas and prints the differences."""
    all_tables = set(schema1.keys()) | set(schema2.keys())
    
    for table in sorted(all_tables):
        if table not in schema1:
            print(f"Table '{table}' is missing from the first database.")
            continue
        if table not in schema2:
            print(f"Table '{table}' is missing from the second database.")
            continue
            
        cols1 = {col[1]: col for col in schema1[table]}
        cols2 = {col[1]: col for col in schema2[table]}
        
        all_cols = set(cols1.keys()) | set(cols2.keys())
        
        for col in sorted(all_cols):
            if col not in cols1:
                print(f"Table '{table}': Column '{col}' is missing from the first database.")
            elif col not in cols2:
                print(f"Table '{table}': Column '{col}' is missing from the second database.")
            elif cols1[col] != cols2[col]:
                print(f"Table '{table}', Column '{col}': Schema mismatch.")
                print(f"  - DB1: {cols1[col]}")
                print(f"  - DB2: {cols2[col]}")

if __name__ == '__main__':
    local_db = 'KoboReader.sqlite'
    user_db_folder = r"C:\Users\juanp\Downloads\UsersSQLite"

    print(f"--- Inspecting Local Database: {local_db} ---")
    local_schema = get_db_schema(local_db)
    if local_schema:
        for table, columns in local_schema.items():
            print(f"\nTable: {table}")
            for col in columns:
                print(f"  - {col}")

    if os.path.exists(user_db_folder):
        for filename in os.listdir(user_db_folder):
            if filename.endswith(".sqlite"):
                user_db_path = os.path.join(user_db_folder, filename)
                print(f"\n--- Inspecting User Database: {user_db_path} ---")
                user_schema = get_db_schema(user_db_path)
                
                if user_schema:
                    for table, columns in user_schema.items():
                        print(f"\nTable: {table}")
                        for col in columns:
                            print(f"  - {col}")

                if local_schema and user_schema:
                    print(f"\n--- Schema Comparison for {filename} ---")
                    compare_schemas(local_schema, user_schema)
    else:
        print(f"Error: User database folder not found at {user_db_folder}")
