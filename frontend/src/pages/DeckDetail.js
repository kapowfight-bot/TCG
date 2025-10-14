import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../App';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import HandSimulator from '../components/HandSimulator';

const DeckDetail = ({ user, onLogout }) => {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [matches, setMatches] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [matchResult, setMatchResult] = useState('win');
  const [opponentDeck, setOpponentDeck] = useState('');
  const [wentFirst, setWentFirst] = useState(true);
  const [badGame, setBadGame] = useState(false);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [matchNotes, setMatchNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editDeckName, setEditDeckName] = useState('');
  const [editDeckList, setEditDeckList] = useState('');
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isTestResultsExpanded, setIsTestResultsExpanded] = useState(true);
  const [isMatchStatsExpanded, setIsMatchStatsExpanded] = useState(false);

  useEffect(() => {
    fetchDeckData();
  }, [deckId]);

  const fetchDeckData = async () => {
    try {
      const [deckRes, matchesRes, statsRes] = await Promise.all([
        axios.get(`${API}/decks/${deckId}`, { withCredentials: true }),
        axios.get(`${API}/matches/${deckId}`, { withCredentials: true }),
        axios.get(`${API}/decks/${deckId}/stats`, { withCredentials: true }),
      ]);

      setDeck(deckRes.data);
      setMatches(matchesRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error fetching deck data:', error);
      toast.error('Failed to load deck data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogMatch = async () => {
    if (!opponentDeck.trim()) {
      toast.error('Please enter opponent deck name');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(
        `${API}/matches`,
        {
          deck_id: deckId,
          result: matchResult,
          opponent_deck_name: opponentDeck,
          went_first: wentFirst,
          bad_game: badGame,
          mulligan_count: mulliganCount,
          notes: matchNotes || null,
        },
        { withCredentials: true }
      );

      toast.success('Match logged successfully!');
      setOpponentDeck('');
      setMatchNotes('');
      setBadGame(false);
      setMulliganCount(0);
      setIsMatchDialogOpen(false);
      fetchDeckData();
    } catch (error) {
      console.error('Error logging match:', error);
      toast.error('Failed to log match');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchCardDataForDeck = async (deckListText) => {
    const cardDataMap = {};
    const lines = deckListText.split('\n');
    
    const uniqueCards = new Map();
    let currentSection = 'unknown';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
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
        const setCode = match[3].toUpperCase();
        const cardNumber = match[4];
        const cacheKey = `${setCode}-${cardNumber}`;
        
        if (!uniqueCards.has(cacheKey)) {
          uniqueCards.set(cacheKey, { setCode, cardNumber, section: currentSection });
        }
      }
    }
    
    const fetchPromises = Array.from(uniqueCards.entries()).map(async ([cacheKey, { setCode, cardNumber, section }]) => {
      try {
        // Try local database first
        const response = await axios.get(
          `${API}/cards/${setCode}/${cardNumber}`,
          { withCredentials: true, timeout: 5000 }
        );
        
        const card = response.data;
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
            isPokemon: section === 'pokemon',
            isTrainer: section === 'trainer',
            isEnergy: section === 'energy',
            section: section
          }
        };
      } catch (localError) {
        // Fallback to external Pokemon TCG API
        console.log(`Card ${cacheKey} not in local DB, trying external API...`);
        
        try {
          const POKEMON_API = process.env.REACT_APP_POKEMON_API_URL || 'https://api.pokemontcg.io/v2';
          let apiUrl = `${POKEMON_API}/cards/${setCode.toLowerCase()}-${cardNumber}`;
          let apiResponse;
          
          try {
            apiResponse = await axios.get(apiUrl, { timeout: 5000 });
          } catch (firstError) {
            if (firstError.response?.status === 404) {
              apiUrl = `${POKEMON_API}/cards/${setCode}-${cardNumber}`;
              apiResponse = await axios.get(apiUrl, { timeout: 5000 });
            } else {
              throw firstError;
            }
          }
          
          const card = apiResponse.data.data;
          return {
            cacheKey,
            fromExternalAPI: true,  // Mark for database saving
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
              isPokemon: section === 'pokemon',
              isTrainer: section === 'trainer',
              isEnergy: section === 'energy',
              section: section
            }
          };
        } catch (apiError) {
          console.error(`Failed to fetch ${cacheKey} from both sources:`, apiError.message);
          console.log(`  → Creating basic card entry from deck list info`);
          
          // Extract card name from deck list
          const lines = deckListText.split('\n');
          let cardName = 'Unknown Card';
          for (const line of lines) {
            const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,5})\s+(\d+)$/i);
            if (match && `${match[3].toUpperCase()}-${match[4]}` === cacheKey) {
              cardName = match[2].trim();
              break;
            }
          }
          
          // Try to fetch image from LimitlessTCG
          let imageUrl = null;
          try {
            const imageResponse = await axios.get(
              `${API}/cards/image/${setCode}/${cardNumber}`,
              { withCredentials: true, timeout: 5000 }
            );
            imageUrl = imageResponse.data.image_url;
            if (imageUrl) {
              console.log(`  ✓ Got image from LimitlessTCG`);
            }
          } catch (imageError) {
            console.log(`  → No image available from LimitlessTCG`);
          }
          
          // Create basic card entry from deck list information
          const supertype = section === 'pokemon' ? 'Pokémon' : (section === 'trainer' ? 'Trainer' : 'Energy');
          
          return {
            cacheKey,
            fromDeckListOnly: true,  // Mark for database saving with basic info
            data: {
              name: cardName,
              image: imageUrl,  // Image from LimitlessTCG or null
              supertype: supertype,
              subtypes: [],
              hp: null,
              types: [],
              abilities: [],
              attacks: [],
              weaknesses: [],
              resistances: [],
              retreatCost: [],
              rules: [],
              isBasic: false,  // Can't determine without API
              isPokemon: section === 'pokemon',
              isTrainer: section === 'trainer',
              isEnergy: section === 'energy',
              section: section
            }
          };
        }
      }
    });
    
    const results = await Promise.all(fetchPromises);
    
    // Track which cards came from external API (need to be saved to DB)
    const cardsToSave = {};
    
    results.forEach(result => {
      if (result) {
        cardDataMap[result.cacheKey] = result.data;
        // If card has 'fromExternalAPI' or 'fromDeckListOnly' flag, add to batch save
        if (result.fromExternalAPI || result.fromDeckListOnly) {
          cardsToSave[result.cacheKey] = result.data;
        }
      }
    });
    
    // Save newly fetched cards to local database for future use
    if (Object.keys(cardsToSave).length > 0) {
      try {
        console.log(`Saving ${Object.keys(cardsToSave).length} new cards to local database...`);
        await axios.post(
          `${API}/cards/batch`,
          cardsToSave,
          { withCredentials: true, timeout: 10000 }
        );
        console.log('Cards saved to local database successfully');
      } catch (saveError) {
        console.error('Failed to save cards to database:', saveError);
        // Don't fail the whole operation if saving fails
      }
    }
    
    return cardDataMap;
  };

  const handleEditDeck = async () => {
    if (!editDeckName.trim() || !editDeckList.trim()) {
      toast.error('Please enter both deck name and deck list');
      return;
    }

    setIsEditSubmitting(true);
    try {
      // Fetch card data for the updated deck list
      const lines = editDeckList.split('\n').filter(line => line.trim());
      const uniqueCards = new Set();
      lines.forEach(line => {
        const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,5})\s+(\d+)$/i);
        if (match) {
          uniqueCards.add(`${match[3]}-${match[4]}`);
        }
      });
      
      toast.info(`Fetching ${uniqueCards.size} unique cards...`);
      const cardData = await fetchCardDataForDeck(editDeckList);
      toast.success(`Fetched ${Object.keys(cardData).length} cards`);
      
      // Update deck via API
      await axios.put(
        `${API}/decks/${deckId}`,
        {
          deck_name: editDeckName,
          deck_list: editDeckList,
          card_data: cardData,
        },
        { withCredentials: true }
      );

      toast.success('Deck updated successfully! Test results have been reset.');
      setIsEditDialogOpen(false);
      fetchDeckData();
    } catch (error) {
      console.error('Error updating deck:', error);
      toast.error('Failed to update deck');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleDeleteDeck = async () => {
    try {
      await axios.delete(`${API}/decks/${deckId}`, { withCredentials: true });
      toast.success('Deck deleted successfully');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error deleting deck:', error);
      toast.error('Failed to delete deck');
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!deck || !stats) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Deck not found</h2>
          <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b]">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0f0f10]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                data-testid="back-btn"
                onClick={() => navigate('/dashboard')}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
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
        {/* Deck Header */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-3xl font-bold mb-2">{deck.deck_name}</h2>
              <p className="text-gray-400">
                Created {new Date(deck.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex space-x-2">
              <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
                setIsEditDialogOpen(open);
                if (open) {
                  setEditDeckName(deck.deck_name);
                  setEditDeckList(deck.deck_list);
                }
              }}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="edit-deck-btn"
                    variant="outline"
                    className="border-gray-700 text-gray-300 hover:bg-gray-800 rounded-xl px-6"
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
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit Deck
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#1a1a1b] border-gray-800 text-white sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">Edit Deck</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-3">
                      <p className="text-sm text-yellow-200">
                        ⚠️ Note: Editing the deck will reset hand test statistics. Match history will remain unchanged.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="edit-deck-name" className="text-gray-300 mb-2 block">
                        Deck Name
                      </Label>
                      <Input
                        id="edit-deck-name"
                        data-testid="edit-deck-name-input"
                        placeholder="e.g., Charizard ex"
                        value={editDeckName}
                        onChange={(e) => setEditDeckName(e.target.value)}
                        className="bg-[#0f0f10] border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-deck-list" className="text-gray-300 mb-2 block">
                        Deck List (PTCGL Format)
                      </Label>
                      <Textarea
                        id="edit-deck-list"
                        data-testid="edit-deck-list-textarea"
                        placeholder="Paste your PTCGL deck list here..."
                        value={editDeckList}
                        onChange={(e) => setEditDeckList(e.target.value)}
                        className="bg-[#0f0f10] border-gray-700 text-white min-h-[200px] font-mono text-sm"
                      />
                    </div>
                    <Button
                      data-testid="submit-edit-btn"
                      onClick={handleEditDeck}
                      disabled={isEditSubmitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                    >
                      {isEditSubmitting ? 'Updating...' : 'Update Deck'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button
                data-testid="test-hand-btn"
                onClick={() => setIsSimulatorOpen(true)}
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800 rounded-xl px-6"
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                Test Hand
              </Button>

              <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="log-match-btn"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6"
                  >
                    Log Match
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#1a1a1b] border-gray-800 text-white sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">Log Match</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div>
                      <Label className="text-gray-300 mb-2 block">Result</Label>
                      <Select value={matchResult} onValueChange={setMatchResult}>
                        <SelectTrigger data-testid="match-result-select" className="bg-[#0f0f10] border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1b] border-gray-700 text-white">
                          <SelectItem value="win">Win</SelectItem>
                          <SelectItem value="loss">Loss</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="opponent-deck" className="text-gray-300 mb-2 block">
                        Opponent Deck
                      </Label>
                      <Input
                        id="opponent-deck"
                        data-testid="opponent-deck-input"
                        placeholder="e.g., Mewtwo ex"
                        value={opponentDeck}
                        onChange={(e) => setOpponentDeck(e.target.value)}
                        className="bg-[#0f0f10] border-gray-700 text-white"
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300 mb-2 block">Going First/Second</Label>
                      <Select value={wentFirst ? 'first' : 'second'} onValueChange={(v) => setWentFirst(v === 'first')}>
                        <SelectTrigger data-testid="went-first-select" className="bg-[#0f0f10] border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1a1b] border-gray-700 text-white">
                          <SelectItem value="first">First</SelectItem>
                          <SelectItem value="second">Second</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between bg-[#0f0f10] rounded-xl p-4">
                      <Label htmlFor="bad-game" className="text-gray-300">
                        Bad Game (couldn't play)
                      </Label>
                      <Switch
                        id="bad-game"
                        data-testid="bad-game-switch"
                        checked={badGame}
                        onCheckedChange={setBadGame}
                      />
                    </div>

                    <div>
                      <Label htmlFor="mulligan-count" className="text-gray-300 mb-2 block">
                        Mulligan Count
                      </Label>
                      <Input
                        id="mulligan-count"
                        data-testid="mulligan-count-input"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={mulliganCount}
                        onChange={(e) => setMulliganCount(parseInt(e.target.value) || 0)}
                        className="bg-[#0f0f10] border-gray-700 text-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">How many times did you mulligan?</p>
                    </div>

                    <div>
                      <Label htmlFor="notes" className="text-gray-300 mb-2 block">
                        Notes (optional)
                      </Label>
                      <Textarea
                        id="notes"
                        data-testid="match-notes-textarea"
                        placeholder="Add any notes about this match..."
                        value={matchNotes}
                        onChange={(e) => setMatchNotes(e.target.value)}
                        className="bg-[#0f0f10] border-gray-700 text-white"
                      />
                    </div>

                    <Button
                      data-testid="submit-match-btn"
                      onClick={handleLogMatch}
                      disabled={isSubmitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                    >
                      {isSubmitting ? 'Logging...' : 'Log Match'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    data-testid="delete-deck-btn"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl"
                  >
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#1a1a1b] border-gray-800 text-white">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription className="text-gray-400">
                      This will permanently delete this deck and all associated match history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="bg-[#0f0f10] border-gray-700 text-white hover:bg-gray-800">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      data-testid="confirm-delete-btn"
                      onClick={handleDeleteDeck}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Deck List */}
          <div className="bg-[#0f0f10] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">DECK LIST</h3>
            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
              {deck.deck_list}
            </pre>
          </div>
        </div>

        {/* Test Results */}
        {deck.test_results && (
          <div className="glass rounded-2xl p-6 mb-8">
            <div 
              className="flex items-center justify-between cursor-pointer mb-4"
              onClick={() => setIsTestResultsExpanded(!isTestResultsExpanded)}
            >
              <h3 className="text-xl font-bold">Hand Simulator Test Results</h3>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-6 w-6 transition-transform duration-200 ${isTestResultsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {isTestResultsExpanded && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Hands Tested</div>
                  <div className="text-2xl font-bold">{deck.test_results.total_hands}</div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Mulligan Rate</div>
                  <div className="text-2xl font-bold text-orange-400">{deck.test_results.mulligan_percentage}%</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {deck.test_results.mulligan_count} mulligans
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Avg Pokemon</div>
                  <div className="text-2xl font-bold text-green-400">{deck.test_results.avg_pokemon}</div>
                  <div className="text-xs text-gray-500 mt-1">per hand</div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Avg Basic Pokemon</div>
                  <div className="text-2xl font-bold text-emerald-400">{deck.test_results.avg_basic_pokemon || 0}</div>
                  <div className="text-xs text-gray-500 mt-1">per hand</div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Avg Trainer</div>
                  <div className="text-2xl font-bold text-blue-400">{deck.test_results.avg_trainer}</div>
                  <div className="text-xs text-gray-500 mt-1">per hand</div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Avg Energy</div>
                  <div className="text-2xl font-bold text-yellow-400">{deck.test_results.avg_energy}</div>
                  <div className="text-xs text-gray-500 mt-1">per hand</div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Last Tested</div>
                  <div className="text-sm font-bold">
                    {new Date(deck.test_results.last_tested).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Overview */}
        <div className="glass rounded-2xl p-6 mb-8">
          <div 
            className="flex items-center justify-between cursor-pointer mb-4"
            onClick={() => setIsMatchStatsExpanded(!isMatchStatsExpanded)}
          >
            <h3 className="text-xl font-bold">Match Statistics</h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-6 w-6 transition-transform duration-200 ${isMatchStatsExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {isMatchStatsExpanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              <div className="bg-[#0f0f10] rounded-2xl p-6">
                <div className="text-sm text-gray-400 mb-1">Total Matches</div>
                <div className="text-3xl font-bold">{stats.total_matches}</div>
              </div>
              <div className="bg-[#0f0f10] rounded-2xl p-6">
                <div className="text-sm text-gray-400 mb-1">Win Rate</div>
                <div className="text-3xl font-bold text-emerald-500">{stats.win_rate}%</div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.wins}W - {stats.losses}L
                </div>
              </div>
              <div className="bg-[#0f0f10] rounded-2xl p-6">
                <div className="text-sm text-gray-400 mb-1">Going First</div>
                <div className="text-xl font-bold text-blue-400">
                  {stats.went_first_wins}W - {stats.went_first_losses}L
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.went_first_wins + stats.went_first_losses > 0
                    ? Math.round((stats.went_first_wins / (stats.went_first_wins + stats.went_first_losses)) * 100)
                    : 0}% WR
                </div>
              </div>
              <div className="bg-[#0f0f10] rounded-2xl p-6">
                <div className="text-sm text-gray-400 mb-1">Going Second</div>
                <div className="text-xl font-bold text-purple-400">
                  {stats.went_second_wins}W - {stats.went_second_losses}L
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.went_second_wins + stats.went_second_losses > 0
                    ? Math.round((stats.went_second_wins / (stats.went_second_wins + stats.went_second_losses)) * 100)
                    : 0}% WR
                </div>
              </div>
              <div className="bg-[#0f0f10] rounded-2xl p-6">
                <div className="text-sm text-gray-400 mb-1">Avg Mulligans</div>
                <div className="text-3xl font-bold text-orange-400">{stats.avg_mulligans}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.total_mulligans} total
                </div>
              </div>
              <div className="bg-[#0f0f10] rounded-2xl p-6">
                <div className="text-sm text-gray-400 mb-1">Bad Games</div>
                <div className="text-3xl font-bold text-red-400">{stats.bad_games}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {stats.total_matches > 0 ? Math.round((stats.bad_games / stats.total_matches) * 100) : 0}% of matches
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Matchup Stats */}
        {Object.keys(stats.opponent_stats).length > 0 && (
          <div className="glass rounded-2xl p-6 mb-8">
            <h3 className="text-xl font-bold mb-4">Matchup Statistics</h3>
            <div className="space-y-3">
              {Object.entries(stats.opponent_stats).map(([opponent, opStats]) => (
                <div key={opponent} className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{opponent}</div>
                      <div className="text-sm text-gray-400">
                        {opStats.wins}W - {opStats.losses}L
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-500">
                        {Math.round((opStats.wins / opStats.total) * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">{opStats.total} matches</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Match History */}
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-4">Match History</h3>
          {matches.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No matches logged yet</p>
              <Button
                onClick={() => setIsMatchDialogOpen(true)}
                className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
              >
                Log Your First Match
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  data-testid={`match-${match.id}`}
                  className="bg-[#0f0f10] rounded-xl p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span
                          className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                            match.result === 'win'
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : 'bg-red-500/20 text-red-500'
                          }`}
                        >
                          {match.result === 'win' ? 'WIN' : 'LOSS'}
                        </span>
                        {match.bad_game && (
                          <span className="px-3 py-1 rounded-lg text-sm font-semibold bg-orange-500/20 text-orange-500">
                            Bad Game
                          </span>
                        )}
                        <span className="text-sm text-gray-500">
                          Went {match.went_first ? 'First' : 'Second'}
                        </span>
                      </div>
                      <div className="text-white font-semibold mb-1">vs {match.opponent_deck_name}</div>
                      {match.mulligan_count > 0 && (
                        <div className="text-sm text-orange-400 mt-1">
                          {match.mulligan_count} mulligan{match.mulligan_count !== 1 ? 's' : ''}
                        </div>
                      )}
                      {match.notes && <div className="text-sm text-gray-400 mt-2">{match.notes}</div>}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(match.match_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Hand Simulator */}
      {deck && (
        <HandSimulator
          deckList={deck.deck_list}
          cardData={deck.card_data || {}}
          deckId={deck.id}
          isOpen={isSimulatorOpen}
          onClose={() => {
            setIsSimulatorOpen(false);
            fetchDeckData(); // Refresh deck data to show updated test results
          }}
          onDeckUpdate={fetchDeckData}
        />
      )}
    </div>
  );
};

export default DeckDetail;