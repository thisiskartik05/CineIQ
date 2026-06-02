import { useState } from "react";

function App() {
  const [movie, setMovie] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // This will be updated to your Render URL later
  const BACKEND_URL = "https://thisiskartik05-cineiq-api.hf.space";

  const getRecommendations = async () => {
    if (!movie) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: movie }),
      });

      if (!response.ok) throw new Error("Movie not found");

      const data = await response.json();
      setRecommendations(data.recommendations);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">🎬 CineIQ</h1>
        <p className="text-gray-400 mb-8">
          Explainable movie recommendations powered by ML
        </p>

        <div className="flex gap-4 mb-8">
          <input
            type="text"
            value={movie}
            onChange={(e) => setMovie(e.target.value)}
            placeholder="e.g. Interstellar"
            className="flex-1 p-3 rounded bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={getRecommendations}
            className="bg-blue-600 px-6 py-3 rounded font-semibold hover:bg-blue-700 transition"
          >
            {loading ? "Searching..." : "Recommend"}
          </button>
        </div>

        {error && <div className="text-red-400 mb-4">{error}</div>}

        <div className="space-y-4">
          {recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="bg-gray-800 p-6 rounded-lg border border-gray-700"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold">{rec.title}</h3>
                <span className="bg-blue-900 text-blue-200 px-3 py-1 rounded-full text-sm">
                  {rec.score}★
                </span>
              </div>
              <p className="text-sm text-green-400 mb-3">{rec.reason}</p>
              <p className="text-gray-400 text-sm">{rec.overview}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
