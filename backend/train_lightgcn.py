import torch
import torch.nn as nn
from torch_geometric.nn import LGConv
from pymongo import MongoClient
import random
import pickle

# 1. Database Setup
MONGO_URI = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"

def load_data():
    print("Connecting to MongoDB...")
    client = MongoClient(MONGO_URI)
    db = client.cineiq

    users = list(db.users.find({}))
    movies = list(db.movies.find({}, {"title": 1}))

    user_to_idx = {user['username']: i for i, user in enumerate(users)}
    
    unique_titles = list(set([movie['title'] for movie in movies]))
    title_to_idx = {title: i for i, title in enumerate(unique_titles)}
    idx_to_title = {i: title for title, i in title_to_idx.items()}

    user_indices, movie_indices = [], []
    user_watchlists = {} # Keep track of what users watched for negative sampling

    for user in users:
        u_idx = user_to_idx[user['username']]
        user_watchlists[u_idx] = set()
        
        for title in user['watchlist']:
            if title in title_to_idx:
                m_idx = title_to_idx[title]
                user_indices.append(u_idx)
                movie_indices.append(m_idx)
                user_watchlists[u_idx].add(m_idx)

    edge_index = torch.tensor([user_indices, movie_indices], dtype=torch.long)
    return edge_index, len(user_to_idx), len(title_to_idx), user_watchlists, user_to_idx, title_to_idx, idx_to_title

# 2. The LightGCN Architecture
class LightGCN(nn.Module):
    def __init__(self, num_users, num_movies, embedding_dim=64, num_layers=3):
        super().__init__()
        self.num_users = num_users
        self.num_movies = num_movies
        self.num_layers = num_layers
        
        # Layer 0 Embeddings
        self.user_embedding = nn.Embedding(num_users, embedding_dim)
        self.movie_embedding = nn.Embedding(num_movies, embedding_dim)
        nn.init.normal_(self.user_embedding.weight, std=0.1)
        nn.init.normal_(self.movie_embedding.weight, std=0.1)

        self.conv = LGConv()

    def forward(self, edge_index):
        x = torch.cat([self.user_embedding.weight, self.movie_embedding.weight], dim=0)
        all_layer_embeddings = [x]

        for _ in range(self.num_layers):
            x = self.conv(x, edge_index)
            all_layer_embeddings.append(x)

        all_layer_embeddings = torch.stack(all_layer_embeddings, dim=1)
        final_embeddings = torch.mean(all_layer_embeddings, dim=1)

        final_user_emb, final_movie_emb = torch.split(final_embeddings, [self.num_users, self.num_movies])
        return final_user_emb, final_movie_emb

# 3. BPR Loss Function
def bpr_loss(user_emb, pos_item_emb, neg_item_emb):
    pos_scores = (user_emb * pos_item_emb).sum(dim=1)
    neg_scores = (user_emb * neg_item_emb).sum(dim=1)
    loss = -torch.nn.functional.logsigmoid(pos_scores - neg_scores).mean()
    return loss

# 4. Training Execution
def train_model():
    edge_index, num_users, num_movies, user_watchlists, user_to_idx, title_to_idx, idx_to_title = load_data()
    
    print(f"Graph Shape: {edge_index.shape}. Initializing Model...")
    model = LightGCN(num_users, num_movies)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    epochs = 20 # Keep it short for our first run
    print("Starting Training Loop...")

    for epoch in range(epochs):
        model.train()
        optimizer.zero_grad()

        # Generate the graph embeddings for this epoch
        user_emb, movie_emb = model(edge_index)

        # Sample Triplets (User, Positive Movie, Negative Movie)
        users = []
        pos_items = []
        neg_items = []

        for u_idx in range(num_users):
            if not user_watchlists[u_idx]: continue
            
            # 1 Positive Item (Something they watched)
            pos_item = random.choice(list(user_watchlists[u_idx]))
            
            # 1 Negative Item (Something they HAVEN'T watched)
            neg_item = random.randint(0, num_movies - 1)
            while neg_item in user_watchlists[u_idx]:
                neg_item = random.randint(0, num_movies - 1)
            
            users.append(u_idx)
            pos_items.append(pos_item)
            neg_items.append(neg_item)

        # Compute Loss
        u_e = user_emb[users]
        p_e = movie_emb[pos_items]
        n_e = movie_emb[neg_items]

        loss = bpr_loss(u_e, p_e, n_e)
        
        # Backpropagation (The actual learning part)
        loss.backward()
        optimizer.step()

        print(f"Epoch {epoch+1}/{epochs} | Loss: {loss.item():.4f}")

    print("✅ Training Complete!")
    
    # 5. Save the learned embeddings for FastAPI!
    print("Saving learned embeddings...")
    with torch.no_grad():
        final_u, final_m = model(edge_index)
        
    data_to_save = {
        "user_embeddings": final_u.numpy(),
        "movie_embeddings": final_m.numpy(),
        "user_to_idx": user_to_idx,
        "title_to_idx": title_to_idx,
        "idx_to_title": idx_to_title
    }
    
    with open("models/lightgcn_embeddings.pkl", "wb") as f:
        pickle.dump(data_to_save, f)
        
    print("✅ Saved to models/lightgcn_embeddings.pkl")

if __name__ == "__main__":
    train_model()