import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../App';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';

const Dashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckList, setDeckList] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const response = await axios.get(`${API}/decks`, {
        withCredentials: true,
      });
      setDecks(response.data);
    } catch (error) {
      console.error('Error fetching decks:', error);
      toast.error('Failed to load decks');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCardDataForDeck = async (deckListText) => {
    const cardDataMap = {};
    const lines = deckListText.split('\n');
    
    console.log('=== Starting card fetch from local database ===');
    console.log('Total lines:', lines.length);
    
    // Parse all unique cards first, tracking their sections
    const uniqueCards = new Map();
    let currentSection = 'unknown';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check for section headers
      if (trimmedLine.match(/^Pokémon:/i) || trimmedLine.match(/^Pokemon:/i)) {
        currentSection = 'pokemon';
        continue;
      }
      if (trimmedLine.match(/^Trainer:/i)) {
        currentSection = 'trainer';
        continue;
      }
      if (trimmedLine.match(/^Energy:/i)) {
        currentSection = 'energy';
        continue;
      }
      
      const match = trimmedLine.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,5})\s+(\d+)$/i);
      if (match) {
        const cardName = match[2].trim();
        const setCode = match[3].toUpperCase();
        const cardNumber = match[4];
        const cacheKey = `${setCode}-${cardNumber}`;
        
        if (!uniqueCards.has(cacheKey)) {
          uniqueCards.set(cacheKey, { cardName, setCode, cardNumber, section: currentSection });
        }
      }
    }
    
    console.log(`Found ${uniqueCards.size} unique cards to fetch`);
    
    // Fetch all cards in parallel from our database
    const fetchPromises = Array.from(uniqueCards.entries()).map(async ([cacheKey, { cardName, setCode, cardNumber }]) => {
      try {
        // Try our local database first
        const response = await axios.get(
          `${API}/cards/${setCode}/${cardNumber}`,
          { withCredentials: true, timeout: 5000 }
        );
        
        const card = response.data;
        console.log(`✓ ${card.name} (${cacheKey}) from local DB`);
        
        return {
          cacheKey,
          data: {
            name: card.name,
            image: card.image_small || null,
            supertype: card.supertype,
            subtypes: card.subtypes || [],
            hp: card.hp || null,
            types: card.types || [],
            abilities: card.abilities || [],
            attacks: card.attacks || [],
            weaknesses: card.weaknesses || [],
            resistances: card.resistances || [],
            retreatCost: card.retreat_cost || [],
            rules: card.rules || [],
            isBasic: card.supertype === 'Pokémon' && card.subtypes?.includes('Basic'),
            isPokemon: card.supertype === 'Pokémon',
            isTrainer: card.supertype === 'Trainer',
            isEnergy: card.supertype === 'Energy'
          }
        };
      } catch (error) {
        // Fallback to external API if not in our database
        console.log(`  → Not in local DB, trying external API for ${cacheKey}`);
        
        try {
          let apiUrl = `https://api.pokemontcg.io/v2/cards/${setCode.toLowerCase()}-${cardNumber}`;
          let apiResponse;
          
          try {
            apiResponse = await axios.get(apiUrl, { timeout: 5000 });
          } catch (firstError) {
            if (firstError.response?.status === 404) {
              apiUrl = `https://api.pokemontcg.io/v2/cards/${setCode}-${cardNumber}`;
              apiResponse = await axios.get(apiUrl, { timeout: 5000 });
            } else {
              throw firstError;
            }
          }
          
          const card = apiResponse.data.data;
          console.log(`✓ ${card.name} (${cacheKey}) from external API`);
          
          return {
            cacheKey,
            data: {
              name: card.name,
              image: card.images?.small || null,
              supertype: card.supertype,
              subtypes: card.subtypes || [],
              hp: card.hp || null,
              types: card.types || [],
              abilities: card.abilities || [],
              attacks: card.attacks || [],
              weaknesses: card.weaknesses || [],
              resistances: card.resistances || [],
              retreatCost: card.retreatCost || [],
              rules: card.rules || [],
              isBasic: card.supertype === 'Pokémon' && card.subtypes?.includes('Basic'),
              isPokemon: card.supertype === 'Pokémon',
              isTrainer: card.supertype === 'Trainer',
              isEnergy: card.supertype === 'Energy'
            }
          };
        } catch (apiError) {
          console.error(`✗ Failed: ${cacheKey} - ${apiError.message}`);
          return null;
        }
      }
    });
    
    // Wait for all fetches to complete
    const results = await Promise.all(fetchPromises);
    
    // Build the card data map
    results.forEach(result => {
      if (result) {
        cardDataMap[result.cacheKey] = result.data;
      }
    });
    
    console.log(`=== Fetch complete: ${Object.keys(cardDataMap).length}/${uniqueCards.size} cards fetched ===`);
    return cardDataMap;
  };

  const handleImportDeck = async () => {
    if (!deckName.trim() || !deckList.trim()) {
      toast.error('Please enter both deck name and deck list');
      return;
    }

    setIsSubmitting(true);
    try {
      // Count unique cards
      const lines = deckList.split('\n').filter(line => line.trim());
      const uniqueCards = new Set();
      lines.forEach(line => {
        const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,5})\s+(\d+)$/i);
        if (match) {
          uniqueCards.add(`${match[3]}-${match[4]}`);
        }
      });
      
      // Fetch card data before saving
      toast.info(`Fetching ${uniqueCards.size} unique cards in parallel...`);
      const startTime = Date.now();
      const cardData = await fetchCardDataForDeck(deckList);
      const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      toast.success(`Fetched ${Object.keys(cardData).length} cards in ${fetchTime}s`);
      
      await axios.post(
        `${API}/decks`,
        {
          deck_name: deckName,
          deck_list: deckList,
          card_data: cardData,
        },
        { withCredentials: true }
      );

      toast.success('Deck imported successfully!');
      setDeckName('');
      setDeckList('');
      setIsImportOpen(false);
      fetchDecks();
    } catch (error) {
      console.error('Error importing deck:', error);
      toast.error('Failed to import deck');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      toast.success('Logged out successfully');
      onLogout();
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b]">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0f0f10]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold">TCG Tracker</h1>
            </div>

            <div className="flex items-center space-x-4">
              {user && (
                <div className="flex items-center space-x-3">
                  <Avatar>
                    <AvatarImage src={user.picture} />
                    <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-gray-400 hidden sm:inline">{user.name}</span>
                </div>
              )}
              <Button
                data-testid="logout-btn"
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">My Decks</h2>
            <p className="text-gray-400">Manage and track your Pokemon TCG decks</p>
          </div>

          <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
            <DialogTrigger asChild>
              <Button
                data-testid="import-deck-btn"
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 shadow-lg shadow-emerald-500/20"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Import Deck
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1a1a1b] border-gray-800 text-white sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="text-2xl">Import Deck</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label htmlFor="deck-name" className="text-gray-300 mb-2 block">
                    Deck Name
                  </Label>
                  <Input
                    id="deck-name"
                    data-testid="deck-name-input"
                    placeholder="e.g., Charizard ex"
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    className="bg-[#0f0f10] border-gray-700 text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="deck-list" className="text-gray-300 mb-2 block">
                    Deck List (PTCGL Format)
                  </Label>
                  <Textarea
                    id="deck-list"
                    data-testid="deck-list-textarea"
                    placeholder="Paste your PTCGL deck list here...&#10;e.g.,&#10;4 Pikachu ex MEW 123&#10;3 Raichu VMAX SHF 45&#10;..."
                    value={deckList}
                    onChange={(e) => setDeckList(e.target.value)}
                    className="bg-[#0f0f10] border-gray-700 text-white min-h-[200px] font-mono text-sm"
                  />
                </div>
                <Button
                  data-testid="submit-deck-btn"
                  onClick={handleImportDeck}
                  disabled={isSubmitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                >
                  {isSubmitting ? 'Importing...' : 'Import Deck'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Decks Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 bg-gray-800/50 rounded-2xl flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">No decks yet</h3>
            <p className="text-gray-500 mb-6">Import your first deck to start tracking</p>
            <Button
              onClick={() => setIsImportOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6"
            >
              Import Your First Deck
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map((deck) => (
              <div
                key={deck.id}
                data-testid={`deck-card-${deck.id}`}
                onClick={() => navigate(`/deck/${deck.id}`)}
                className="glass rounded-2xl p-6 cursor-pointer card-hover animate-fadeIn"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1 text-white">{deck.deck_name}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(deck.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-teal-600/20 rounded-xl flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                </div>

                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 line-clamp-3 font-mono">
                    {deck.deck_list.split('\n').slice(0, 3).join('\n')}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Click to view details →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;