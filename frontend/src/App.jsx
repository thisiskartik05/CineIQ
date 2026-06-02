import { useState } from 'react';

export default function App() {
  const [theme, setTheme] = useState('premium'); 
  const [isAnimating, setIsAnimating] = useState(false);
  
  // App States
  const [searchQuery, setSearchQuery] = useState("");
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // --- NEW: Engine Selection State ---
  const [engine, setEngine] = useState('graph'); // 'graph' or 'content'

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Dynamically switch the endpoint based on the selected engine
      const endpoint = engine === 'graph' 
        ? `https://ubiquitous-space-spoon-r4w99549qj6q25jrj-8000.app.github.dev/api/recommend/graph/${encodeURIComponent(searchQuery)}`
        : `https://ubiquitous-space-spoon-r4w99549qj6q25jrj-8000.app.github.dev/api/recommend/content/${encodeURIComponent(searchQuery)}`;

      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error("Movie not found in the database. Try another classic!");
      }
      
      const data = await response.json();
      setRecommendations(data.results);
    } catch (err) {
      setError(err.message);
      setRecommendations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleThemeSwitch = (newTheme) => {
    if (newTheme === theme) return;
    setIsAnimating(true);
    setTimeout(() => {
      setTheme(newTheme);
      setIsAnimating(false);
    }, 150); 
  };

  const renderMovies = () => {
    if (isLoading) return <div className="text-xl font-bold text-red-500 animate-pulse col-span-full text-center py-12">Running {engine === 'graph' ? 'Neural Network' : 'TF-IDF Content'} inference...</div>;
    if (error) return <div className="text-xl font-bold text-red-500 col-span-full text-center py-12">{error}</div>;
    if (recommendations.length === 0) return null;

    return recommendations.map((movie) => (
      <div key={movie.id} className="min-w-[240px] md:min-w-[280px] snap-start group cursor-pointer flex-shrink-0">
        <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-4 shadow-xl transition-all duration-300 group-hover:scale-105 group-hover:ring-2 ring-red-600 bg-zinc-900">
          <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />
          <div className="absolute top-3 right-3 bg-black/90 backdrop-blur-sm px-2.5 py-1 rounded-md text-sm font-bold text-red-500 border border-red-900/50 shadow-lg">
            {movie.score}% Match
          </div>
        </div>
        <h3 className="font-bold text-lg text-zinc-100 group-hover:text-red-400 transition-colors">{movie.title}</h3>
        <p className="text-sm text-zinc-500 line-clamp-1">{movie.reason}</p>
      </div>
    ));
  };

  return (
    <div className={`min-h-screen w-full overflow-x-hidden transition-colors duration-300 font-sans ${
      theme === 'premium' ? 'bg-zinc-950 text-white' : 'bg-[#14181c] text-slate-300'
    }`}>
      
      {/* THEME TOGGLE */}
      <div className="fixed top-4 right-4 z-50">
        <div className="bg-black/80 backdrop-blur-md p-1 rounded-full border border-white/10 flex gap-1 shadow-xl">
          <button onClick={() => handleThemeSwitch('premium')} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${theme === 'premium' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Premium</button>
          <button onClick={() => handleThemeSwitch('minimalist')} className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${theme === 'minimalist' ? 'bg-[#00e054] text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Minimalist</button>
        </div>
      </div>

      <div className={`transition-opacity duration-300 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
        
        {/* THEME 1: PREMIUM */}
        {theme === 'premium' && (
          <div className="w-full">
            <div className="relative h-[65vh] flex items-center justify-center bg-gradient-to-b from-zinc-900 to-zinc-950">
              <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600 rounded-full mix-blend-screen filter blur-[128px]"></div>
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[128px]"></div>
              </div>
              
              <div className="relative z-10 w-full max-w-3xl px-6 text-center mt-12">
                <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-4">Cine<span className="text-red-600">IQ</span></h1>
                <p className="text-xl text-zinc-400 mb-8">Advanced dual-engine movie recommendations.</p>
                
                <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto mb-6">
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter a movie you love..."
                    className="w-full bg-zinc-900/80 backdrop-blur border border-zinc-800 text-white px-6 py-4 rounded-xl focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all text-lg"
                  />
                  <button onClick={handleSearch} className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-xl font-bold transition-colors text-lg whitespace-nowrap shadow-lg shadow-red-900/20">
                    Analyze
                  </button>
                </div>

                {/* ENGINE TOGGLE */}
                <div className="flex justify-center items-center gap-4 text-sm font-bold text-zinc-400">
                  <span>Engine:</span>
                  <div className="bg-zinc-900 rounded-lg p-1 border border-zinc-800 flex">
                    <button 
                      onClick={() => setEngine('content')}
                      className={`px-4 py-2 rounded-md transition-all ${engine === 'content' ? 'bg-zinc-700 text-white' : 'hover:text-zinc-200'}`}
                    >
                      TF-IDF (Plots/Genres)
                    </button>
                    <button 
                      onClick={() => setEngine('graph')}
                      className={`px-4 py-2 rounded-md transition-all ${engine === 'graph' ? 'bg-zinc-700 text-white' : 'hover:text-zinc-200'}`}
                    >
                      LightGCN (User Behavior)
                    </button>
                  </div>
                </div>

              </div>
            </div>

            <div className="max-w-[1400px] mx-auto px-6 pb-24">
              {recommendations.length > 0 && (
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <span className="w-1.5 h-6 bg-red-600 rounded-full"></span>
                  Top {engine === 'graph' ? 'Graph' : 'Content'} Matches
                </h2>
              )}
              <div className="flex gap-6 overflow-x-auto pb-8 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                {renderMovies()}
              </div>
            </div>
          </div>
        )}

        {/* THEME 3: MINIMALIST (Simplified for brevity, uses same engine logic) */}
        {theme === 'minimalist' && (
          <div className="w-full max-w-6xl mx-auto px-6 pt-20 pb-24">
            <div className="flex flex-col items-center border-b border-slate-800 pb-12 mb-12">
              <h1 className="text-5xl font-serif font-bold text-white mb-10 tracking-wide">CineIQ<span className="text-[#00e054]">.</span></h1>
              
              <div className="w-full max-w-2xl relative mb-6">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Name a film..."
                  className="w-full bg-[#2c3440] text-white px-6 py-4 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00e054] transition-all font-serif text-lg placeholder-slate-500 shadow-inner"
                />
                <button onClick={handleSearch} className="absolute right-2 top-2 bottom-2 bg-[#445566] hover:bg-[#00e054] hover:text-black text-white px-8 rounded transition-colors font-bold text-sm tracking-wider uppercase">
                  Search
                </button>
              </div>

              {/* MINIMALIST ENGINE TOGGLE */}
              <div className="flex justify-center items-center gap-4 text-xs tracking-widest uppercase font-bold text-slate-500">
                <button 
                  onClick={() => setEngine('content')}
                  className={`transition-all ${engine === 'content' ? 'text-[#00e054] border-b border-[#00e054]' : 'hover:text-slate-300'}`}
                >
                  Content Analysis
                </button>
                <span>|</span>
                <button 
                  onClick={() => setEngine('graph')}
                  className={`transition-all ${engine === 'graph' ? 'text-[#00e054] border-b border-[#00e054]' : 'hover:text-slate-300'}`}
                >
                  Behavioral Graph
                </button>
              </div>
            </div>

            <div className="w-full">
              {recommendations.length > 0 && (
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-8 border-b border-slate-800 pb-3 inline-block">
                  {engine === 'graph' ? 'Graph Network' : 'Text Vector'} Predictions
                </h2>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                 {renderMovies()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}