from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import torch
import pickle
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from pymongo import MongoClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. DATABASE SETUP ---
# REPLACE [PASSWORD] WITH YOUR ACTUAL ATLAS PASSWORD
MONGO_URI = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client.cineiq

# --- GLOBAL VARIABLES FOR ENGINES ---
# Declaring these up top ensures the endpoints can always see them
tfidf_matrix = None
tmdb_df = None
content_indices = None
movie_embeddings = None
title_to_idx = None
idx_to_title = None
graph_lower_to_idx = None

@app.on_event("startup")
async def load_ml_engines():
    global tfidf_matrix, tmdb_df, content_indices
    global movie_embeddings, title_to_idx, idx_to_title, graph_lower_to_idx

    # --- 2. LOAD ENGINE A: TF-IDF (Content-Based) ---
    print("Loading Engine A: TF-IDF Content Matcher...")
    try:
        with open('models/tfidf.pkl', 'rb') as f:
            tfidf_vectorizer = pickle.load(f)
            
        tmdb_df = pd.read_csv('models/tmdb_ml.csv')
        indices_df = pd.read_csv('models/indices_ml.csv')
        
        # Helper function to aggressively clean syntax noise from columns
        def clean_tags(x):
            if isinstance(x, str):
                # 1. Convert to lowercase
                x = x.lower()
                # 2. Strip brackets, quotes, commas, and special syntax characters
                x = x.replace('[', '').replace(']', '').replace("'", "").replace('"', '').replace(',', ' ')
                # 3. Clean up multiple whitespaces
                return " ".join(x.split())
            return ""

        # Apply robust structural cleaning across all categorical dimensions
        clean_genres = tmdb_df['genres'].apply(clean_tags)
        clean_overview = tmdb_df['overview'].fillna('').str.lower()
        
        # Remove spaces in names so 'Christopher Nolan' becomes a single token: 'christophernolan'
        clean_director = tmdb_df['director'].fillna('').astype(str).str.lower().str.replace(' ', '', regex=False)
        clean_cast = tmdb_df['cast'].apply(clean_tags).str.replace(' ', '', regex=False)
        
        # Construct a mathematically balanced metadata text soup
        # We duplicate the core attributes to artificially inflate their Term Frequency weights
        metadata_soup = (
            clean_overview + " " + 
            clean_genres + " " + clean_genres + " " + 
            clean_director + " " + clean_director + " " + 
            clean_cast
        )
        
        # Re-fit or transform based on vectorizer type stability
        try:
            tfidf_matrix = tfidf_vectorizer.transform(metadata_soup)
        except Exception:
            # Fallback configuration if the pickled vectorizer vocabulary clashes with local data shapes
            from sklearn.feature_extraction.text import TfidfVectorizer
            tfidf_vectorizer = TfidfVectorizer(stop_words='english', min_df=1)
            tfidf_matrix = tfidf_vectorizer.fit_transform(metadata_soup)
        
        content_indices = pd.Series(indices_df.index, index=indices_df['title'].str.lower()).drop_duplicates()
        
        print("✅ Engine A Loaded with a Cleaned, Fully Vectorized Metadata Soup!")
    except Exception as e:
        print(f"❌ Failed to load TF-IDF: {e}")

    # --- 3. LOAD ENGINE B: LightGCN (Collaborative Graph) ---
    print("Loading Engine B: LightGCN Graph Neural Network...")
    try:
        with open("models/lightgcn_embeddings.pkl", "rb") as f:
            graph_data = pickle.load(f)
            
        movie_embeddings = torch.tensor(graph_data['movie_embeddings'])
        title_to_idx = graph_data['title_to_idx']
        idx_to_title = graph_data['idx_to_title']
        
        graph_lower_to_idx = {title.lower(): idx for title, idx in title_to_idx.items()}
        print("✅ Engine B Loaded Successfully!")
    except Exception as e:
        print(f"❌ Failed to load LightGCN: {e}")
# --- ENDPOINT A: CONTENT MATCH (Old Logic) ---
@app.get("/api/recommend/content/{search_query}")
async def get_content_recommendations(search_query: str, top_k: int = 5):
    query_lower = search_query.lower().strip()
    
    if query_lower not in content_indices:
        raise HTTPException(status_code=404, detail="Movie not found in content database.")
        
    idx = content_indices[query_lower]
    
    # If a movie has multiple entries, grab the first one
    if isinstance(idx, pd.Series):
        idx = idx.iloc[0]
        
    # Cosine Similarity Math
    sim_scores = list(enumerate(cosine_similarity(tfidf_matrix[idx], tfidf_matrix)[0]))
    sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
    sim_scores = sim_scores[1:top_k+1] # Skip the movie itself
    
    movie_indices = [i[0] for i in sim_scores]
    raw_scores = [i[1] for i in sim_scores]
    
    recommendations = []
    for i, m_idx in enumerate(movie_indices):
        title = tmdb_df.iloc[m_idx]['title']
        score = int(raw_scores[i] * 100)
        
        db_movie = db.movies.find_one({"title": title})
        poster = db_movie.get("poster_path", "https://via.placeholder.com/500x750") if db_movie else "https://via.placeholder.com/500x750"
        if poster.startswith("/"): poster = f"https://image.tmdb.org/t/p/w500{poster}"
            
        recommendations.append({
            "id": int(m_idx), "title": title, "score": score, 
            "reason": "Plot/Genre Match", "poster": poster
        })
        
    return {"results": recommendations}


# --- ENDPOINT B: GRAPH MATCH (New Logic) ---
@app.get("/api/recommend/graph/{search_query}")
async def get_graph_recommendations(search_query: str, top_k: int = 5):
    query_lower = search_query.lower().strip()
    
    if query_lower not in graph_lower_to_idx:
        raise HTTPException(status_code=404, detail="Movie not found in graph database.")
        
    target_idx = graph_lower_to_idx[query_lower]
    target_vector = movie_embeddings[target_idx]
    
    # Dot Product Math
    scores = torch.matmul(movie_embeddings, target_vector)
    top_scores, top_indices = torch.topk(scores, top_k + 1)
    
    recommendations = []
    for i in range(len(top_indices)):
        m_idx = top_indices[i].item()
        if m_idx == target_idx: continue
            
        title = idx_to_title[m_idx]
        raw_score = top_scores[i].item()
        match_percentage = min(99, max(75, int(raw_score * 10) + 70)) 
        
        db_movie = db.movies.find_one({"title": title})
        poster = db_movie.get("poster_path", "https://via.placeholder.com/500x750") if db_movie else "https://via.placeholder.com/500x750"
        if poster.startswith("/"): poster = f"https://image.tmdb.org/t/p/w500{poster}"
            
        recommendations.append({
            "id": m_idx, "title": title, "score": match_percentage, 
            "reason": "Audience Behavior Match", "poster": poster
        })
        if len(recommendations) == top_k: break
            
    return {"results": recommendations}