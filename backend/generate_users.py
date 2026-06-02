import random
from pymongo import MongoClient

# Insert your actual password here
MONGO_URI = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"

def generate_mock_users(num_users=5000):
    print("Connecting to MongoDB Atlas...")
    client = MongoClient(MONGO_URI)
    db = client.cineiq
    
    movies_collection = db.movies
    users_collection = db.users
    
    # 1. Clear out any old test users
    print("Clearing old user data...")
    users_collection.delete_many({})
    
    # 2. Fetch all real movie IDs from your database
    print("Fetching real movie IDs...")
    # We only need the 'title' or 'movie_id' to act as the reference. 
    # Let's use 'title' since your current system indexes by title.
    movies = list(movies_collection.find({}, {"title": 1}))
    movie_titles = [movie["title"] for movie in movies]
    
    if not movie_titles:
        print("❌ No movies found! Did you delete them?")
        return

    # 3. Generate Users
    print(f"Generating {num_users} users and watchlists...")
    mock_users = []
    
    for i in range(num_users):
        # Give each user between 5 and 30 random movies in their watchlist
        watchlist_size = random.randint(5, 30)
        watchlist = random.sample(movie_titles, watchlist_size)
        
        user = {
            "user_id": f"user_{i}",
            "username": f"cine_fan_{i}",
            "watchlist": watchlist
        }
        mock_users.append(user)
    
    # 4. Batch Upload to MongoDB
    print(f"Uploading {num_users} users to the cloud. This will take a few seconds...")
    users_collection.insert_many(mock_users)
    
    print(f"✅ Success! Your bipartite graph is ready.")
    print(f"Total Users: {num_users}")
    print(f"Total Interactions (Edges): {sum(len(u['watchlist']) for u in mock_users)}")

if __name__ == "__main__":
    generate_mock_users()