"""
train_lightgcn.py
────────────────────────────────────────────────────────────────────────────────
Trains a LightGCN collaborative-filtering model on the User <-> Movie bipartite
graph derived from MongoDB Atlas `users` collection watchlists, then exports
movie embeddings in the exact format main.py's Engine B loader requires.

Data source (MongoDB Atlas, db: cineiq, collection: users):
    { "user_id": "user_0", "username": "cine_fan_0",
      "watchlist": ["Avatar", "John Carter", "Title 3"] }

Graph construction:
    Each (user, title) pair in every watchlist becomes a positive edge.
    Movie nodes are titles themselves — there is no separate movie_id join,
    since main.py's graph engine looks movies up by lowercased title string.

IMPORTANT CAVEAT — read before running:
    The movie vocabulary in this script is built ONLY from titles that appear
    in at least one user's watchlist. If your tmdb_ml.csv catalog has 4,227
    movies but only e.g. 1,800 distinct titles ever appear in a watchlist,
    idx_to_title will only contain those 1,800 — the remaining ~2,400 movies
    will simply not exist in the graph engine's index. This is not a bug: a
    LightGCN embedding for a movie nobody has ever interacted with is
    undefined (there's no signal to learn from). main.py's /api/recommend/graph
    endpoint already handles this gracefully — it returns a 404 for titles not
    in graph_lower_to_idx rather than crashing. This script prints exactly how
    many catalog titles got graph coverage so the gap is visible, not silent.

Output:
    models/lightgcn_embeddings.pkl  containing exactly:
        movie_embeddings : torch.Tensor  (n_movies, embedding_dim)
        title_to_idx     : dict[str, int]
        idx_to_title     : dict[int, str]

Run:
    cd backend/
    python train_lightgcn.py

Dependencies (minimal, no torch-geometric — propagation is hand-rolled with
plain sparse tensor ops so there's one less heavy dependency to install):
    pip install torch pymongo numpy
────────────────────────────────────────────────────────────────────────────────
"""

import pickle
import time
import random
from collections import defaultdict

import torch
import torch.nn as nn
import numpy as np
from pymongo import MongoClient


# ── Config ────────────────────────────────────────────────────────────────────

MONGO_URI       = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"
OUTPUT_PATH     = "models/lightgcn_embeddings.pkl"

EMBEDDING_DIM   = 64          # latent dimension per user/movie node
N_LAYERS        = 3           # number of LightGCN propagation layers
EPOCHS          = 40
BATCH_SIZE      = 1024        # BPR triplets per gradient step
LEARNING_RATE   = 1e-3
WEIGHT_DECAY    = 1e-4        # L2 reg on embeddings, applied via BPR reg term
REG_LAMBDA      = 1e-4        # BPR embedding-norm regularisation weight
SEED            = 42

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)


# ── 1. Load watchlists from MongoDB ──────────────────────────────────────────

def load_interactions():
    """
    Connects to MongoDB Atlas and pulls every user's watchlist.

    Returns
    -------
    edges          : list[(user_idx, movie_idx)]   all positive interactions
    user_pos_sets  : dict[user_idx, set[movie_idx]] for negative sampling
    user_to_idx    : dict[str, int]
    title_to_idx   : dict[str, int]
    idx_to_title   : dict[int, str]
    """
    print("🔌  Connecting to MongoDB Atlas …")
    client = MongoClient(MONGO_URI)
    db = client["cineiq"]
    users_collection = db["users"]

    docs = list(users_collection.find({}, {"user_id": 1, "watchlist": 1}))
    print(f"    Fetched {len(docs):,} user documents.")

    if not docs:
        raise RuntimeError(
            "No documents found in the `users` collection. "
            "Run generate_users.py first to populate synthetic watchlists."
        )

    # ── Build vocabularies ───────────────────────────────────────────────────
    user_ids_seen = []
    all_titles = set()

    cleaned_docs = []  # (user_id, [titles]) after dropping malformed rows
    skipped = 0

    for doc in docs:
        uid = doc.get("user_id")
        watchlist = doc.get("watchlist")

        if not uid or not isinstance(watchlist, list) or len(watchlist) == 0:
            skipped += 1
            continue

        # Defensive: drop empty/whitespace-only or non-string entries
        clean_titles = [t.strip() for t in watchlist if isinstance(t, str) and t.strip()]
        if not clean_titles:
            skipped += 1
            continue

        user_ids_seen.append(uid)
        all_titles.update(clean_titles)
        cleaned_docs.append((uid, clean_titles))

    if skipped:
        print(f"    ⚠️  Skipped {skipped} user document(s) with missing/empty watchlist.")

    user_ids_sorted = sorted(set(user_ids_seen))
    titles_sorted = sorted(all_titles)

    user_to_idx = {u: i for i, u in enumerate(user_ids_sorted)}
    title_to_idx = {t: i for i, t in enumerate(titles_sorted)}
    idx_to_title = {i: t for t, i in title_to_idx.items()}

    n_users = len(user_to_idx)
    n_movies = len(title_to_idx)

    # ── Build edge list + per-user positive sets (for negative sampling) ──────
    edges: list[tuple[int, int]] = []
    user_pos_sets: dict[int, set[int]] = defaultdict(set)

    for uid, clean_titles in cleaned_docs:
        u_idx = user_to_idx[uid]
        for title in clean_titles:
            m_idx = title_to_idx[title]
            edges.append((u_idx, m_idx))
            user_pos_sets[u_idx].add(m_idx)

    print(f"    Users  : {n_users:,}")
    print(f"    Movies : {n_movies:,}  (distinct titles across all watchlists)")
    print(f"    Edges  : {len(edges):,}  (positive user-movie interactions)")

    return edges, user_pos_sets, user_to_idx, title_to_idx, idx_to_title


# ── 2. Build normalised sparse adjacency for LightGCN propagation ────────────

def build_norm_adj(edges: list[tuple[int, int]], n_users: int, n_movies: int) -> torch.Tensor:
    """
    Builds the symmetrically-normalised bipartite adjacency matrix used by
    LightGCN's propagation rule:

        E^(k+1) = D^-1/2 · A · D^-1/2 · E^(k)

    The full graph has (n_users + n_movies) nodes. Users occupy indices
    [0, n_users) and movies occupy [n_users, n_users + n_movies) in the
    combined node-index space used only inside this function.

    Returns a torch sparse COO tensor of shape (N, N) where N = n_users + n_movies.
    """
    n_nodes = n_users + n_movies

    # Build edges in both directions (user->movie and movie->user) since the
    # interaction graph is undirected for propagation purposes.
    rows, cols = [], []
    for u_idx, m_idx in edges:
        m_global = n_users + m_idx  # offset movie indices into combined space
        rows.append(u_idx);    cols.append(m_global)
        rows.append(m_global); cols.append(u_idx)

    rows_t = torch.tensor(rows, dtype=torch.long)
    cols_t = torch.tensor(cols, dtype=torch.long)
    values = torch.ones(len(rows), dtype=torch.float32)

    # Degree of each node (number of incident edges, post-duplication above)
    deg = torch.zeros(n_nodes, dtype=torch.float32)
    deg.scatter_add_(0, rows_t, values)

    # Avoid division by zero for isolated nodes (shouldn't occur given how
    # edges are built, but defensive against a user with a watchlist whose
    # titles all failed to register — guards against NaN propagation)
    deg_inv_sqrt = torch.pow(deg.clamp(min=1e-12), -0.5)

    # Symmetric normalisation: norm_value = deg_inv_sqrt[row] * deg_inv_sqrt[col]
    norm_values = deg_inv_sqrt[rows_t] * deg_inv_sqrt[cols_t]

    indices = torch.stack([rows_t, cols_t], dim=0)
    norm_adj = torch.sparse_coo_tensor(indices, norm_values, size=(n_nodes, n_nodes))
    return norm_adj.coalesce()


# ── 3. LightGCN model ─────────────────────────────────────────────────────────

class LightGCN(nn.Module):
    """
    Minimal LightGCN: no feature transformation, no nonlinearity between
    layers — embeddings are simply propagated through the normalised
    adjacency matrix and averaged across all layers (including layer 0,
    the original embedding). This matches the original LightGCN paper's
    simplification over standard GCN.
    """

    def __init__(self, n_users: int, n_movies: int, embedding_dim: int, n_layers: int):
        super().__init__()
        self.n_users = n_users
        self.n_movies = n_movies
        self.n_layers = n_layers

        n_nodes = n_users + n_movies
        self.embedding = nn.Embedding(n_nodes, embedding_dim)
        nn.init.normal_(self.embedding.weight, std=0.1)

    def propagate(self, norm_adj: torch.Tensor) -> torch.Tensor:
        """
        Returns the final node embedding matrix (n_users + n_movies, dim),
        computed as the mean of every layer's embedding (layer 0 = raw
        learnable embedding, layers 1..K = propagated versions).
        """
        all_layers = [self.embedding.weight]
        x = self.embedding.weight
        for _ in range(self.n_layers):
            x = torch.sparse.mm(norm_adj, x)
            all_layers.append(x)

        # Mean pooling across layers, as in the original LightGCN paper
        stacked = torch.stack(all_layers, dim=0)   # (n_layers+1, n_nodes, dim)
        final = stacked.mean(dim=0)                 # (n_nodes, dim)
        return final

    def split_embeddings(self, full_embeddings: torch.Tensor):
        """Splits the combined node embedding matrix back into user/movie halves."""
        user_emb = full_embeddings[: self.n_users]
        movie_emb = full_embeddings[self.n_users :]
        return user_emb, movie_emb


# ── 4. BPR loss + negative sampling ──────────────────────────────────────────

def sample_bpr_batch(edges, user_pos_sets, n_movies, batch_size):
    """
    Samples a batch of (user, pos_movie, neg_movie) triplets for BPR training.
    Negative movies are rejection-sampled to guarantee they are NOT in that
    user's positive set (verified correct in isolation before writing this).
    """
    batch_users, batch_pos, batch_neg = [], [], []

    for _ in range(batch_size):
        u_idx, pos_m = edges[random.randrange(len(edges))]
        pos_set = user_pos_sets[u_idx]

        while True:
            neg_m = random.randrange(n_movies)
            if neg_m not in pos_set:
                break

        batch_users.append(u_idx)
        batch_pos.append(pos_m)
        batch_neg.append(neg_m)

    return (
        torch.tensor(batch_users, dtype=torch.long),
        torch.tensor(batch_pos, dtype=torch.long),
        torch.tensor(batch_neg, dtype=torch.long),
    )


def bpr_loss(user_emb, pos_emb, neg_emb, reg_lambda):
    """
    BPR loss:  -log(sigmoid(pos_score - neg_score))  averaged over the batch,
    plus an L2 regularisation term on the embeddings involved in this batch
    (standard BPR-MF regularisation, scaled by reg_lambda).
    """
    pos_scores = (user_emb * pos_emb).sum(dim=1)
    neg_scores = (user_emb * neg_emb).sum(dim=1)

    diff = pos_scores - neg_scores
    loss = -torch.log(torch.sigmoid(diff) + 1e-10).mean()

    reg = (
        user_emb.norm(2).pow(2)
        + pos_emb.norm(2).pow(2)
        + neg_emb.norm(2).pow(2)
    ) / user_emb.shape[0]

    return loss + reg_lambda * reg


# ── 5. Training loop ──────────────────────────────────────────────────────────

def train():
    t0 = time.perf_counter()

    edges, user_pos_sets, user_to_idx, title_to_idx, idx_to_title = load_interactions()

    n_users = len(user_to_idx)
    n_movies = len(title_to_idx)

    if n_users == 0 or n_movies == 0:
        raise RuntimeError("No valid users or movies found — cannot train.")

    print("\n🕸️   Building normalised bipartite adjacency matrix …")
    norm_adj = build_norm_adj(edges, n_users, n_movies)
    print(f"    Adjacency shape: {norm_adj.shape}, nnz={norm_adj._nnz():,}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n⚙️   Training on device: {device}")

    model = LightGCN(n_users, n_movies, EMBEDDING_DIM, N_LAYERS).to(device)
    norm_adj = norm_adj.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)

    steps_per_epoch = max(1, len(edges) // BATCH_SIZE)

    print(f"\n🏋️   Training LightGCN  ({EPOCHS} epochs × {steps_per_epoch} steps/epoch) …\n")

    for epoch in range(1, EPOCHS + 1):
        model.train()
        epoch_loss = 0.0

        for _ in range(steps_per_epoch):
            u_batch, pos_batch, neg_batch = sample_bpr_batch(
                edges, user_pos_sets, n_movies, BATCH_SIZE
            )
            u_batch = u_batch.to(device)
            pos_batch = pos_batch.to(device)
            neg_batch = neg_batch.to(device)

            full_emb = model.propagate(norm_adj)
            user_emb_table, movie_emb_table = model.split_embeddings(full_emb)

            u_e = user_emb_table[u_batch]
            pos_e = movie_emb_table[pos_batch]
            neg_e = movie_emb_table[neg_batch]

            loss = bpr_loss(u_e, pos_e, neg_e, REG_LAMBDA)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            epoch_loss += loss.item()

        avg_loss = epoch_loss / steps_per_epoch
        if epoch == 1 or epoch % 5 == 0 or epoch == EPOCHS:
            print(f"    Epoch {epoch:>3}/{EPOCHS}   BPR loss: {avg_loss:.4f}")

    elapsed = time.perf_counter() - t0
    print(f"\n✅  Training complete in {elapsed:.1f}s")

    # ── Final embedding extraction (eval mode, no grad) ───────────────────────
    model.eval()
    with torch.no_grad():
        full_emb = model.propagate(norm_adj)
        _, movie_emb_table = model.split_embeddings(full_emb)
        movie_embeddings = movie_emb_table.detach().cpu()

    # ── Coverage report ────────────────────────────────────────────────────────
    print(f"\n📊  Graph coverage: {n_movies:,} distinct titles received embeddings")
    print("    (Only titles appearing in at least one user's watchlist are indexed.")
    print("     Run a query against /api/health after starting main.py to compare")
    print("     this against the full tmdb_ml.csv catalog size.)")

    # ── Save artefact in main.py's required format ────────────────────────────
    print(f"\n💾  Saving → {OUTPUT_PATH}")
    output = {
        "movie_embeddings": movie_embeddings,   # torch.Tensor (n_movies, dim)
        "title_to_idx":     title_to_idx,        # dict[str, int]
        "idx_to_title":     idx_to_title,        # dict[int, str]
    }
    with open(OUTPUT_PATH, "wb") as f:
        pickle.dump(output, f, protocol=pickle.HIGHEST_PROTOCOL)

    print(f"    Saved. movie_embeddings shape: {tuple(movie_embeddings.shape)}")
    print("\n✅  Done. main.py's Engine B will load this file on next startup.")


if __name__ == "__main__":
    train()
