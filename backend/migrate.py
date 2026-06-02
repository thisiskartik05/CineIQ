import pandas as pd
from pymongo import MongoClient

# 1. Your Exact Connection String (Put your real password here!)
MONGO_URI = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"

def migrate_data():
    try:
        # Connect to Atlas
        print("Connecting to MongoDB Atlas...")
        client = MongoClient(MONGO_URI)
        db = client["cineiq"]
        movies_collection = db["movies"]
        
        # 2. Load your CSV
        print("Reading tmdb_ml.csv...")
        # Make sure this path points exactly to where your CSV is inside the backend folder!
        df = pd.read_csv("models/tmdb_ml.csv") 
        
        # Clean up Pandas NaN (Not a Number) values so MongoDB accepts them
        df = df.where(pd.notnull(df), None)
        
        # 3. Convert to a list of dictionaries
        movies_data = df.to_dict(orient="records")
        
        # 4. Upload to Cloud
        print(f"Uploading {len(movies_data)} movies. This might take a minute...")
        
        # Clear the collection first just in case you run this script twice by accident
        movies_collection.delete_many({}) 
        
        # Insert the data!
        movies_collection.insert_many(movies_data)
        
        print("✅ Migration Complete! Your database is ready.")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    migrate_data()