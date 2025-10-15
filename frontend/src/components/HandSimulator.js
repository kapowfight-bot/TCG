import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import axios from 'axios';
import { toast } from 'sonner';
import { API } from '../App';

const HandSimulator = ({ deckList, cardData, deckId, isOpen, onClose, onDeckUpdate }) => {
  const [hand, setHand] = useState([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [selectedBasics, setSelectedBasics] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  
  // Test statistics tracking
  const [testStats, setTestStats] = useState({
    totalHandsDrawn: 0,
    totalPokemon: 0,
    totalTrainer: 0,
    totalEnergy: 0,
    totalCards: 0,
    totalBasicPokemon: 0
  });

  // Fetch card data for the deck
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
        // Fallback to external Pokemon TCG API if not in local database
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
            fromExternalAPI: true,  // Mark this card for database saving
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
          const lines = deckList.split('\n');
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

  // Handle refreshing card data for old decks
  const handleRefreshCardData = async () => {
    setIsRefreshing(true);
    try {
      toast.info('Fetching card data...');
      const newCardData = await fetchCardDataForDeck(deckList);
      
      if (Object.keys(newCardData).length === 0) {
        toast.error('Failed to fetch card data');
        setIsRefreshing(false);
        return;
      }
      
      toast.success(`Fetched ${Object.keys(newCardData).length} cards`);
      
      // Update deck with new card data
      await axios.put(
        `${API}/decks/${deckId}`,
        { card_data: newCardData },
        { withCredentials: true }
      );
      
      toast.success('Card data updated! Closing simulator...');
      
      // Notify parent to refresh deck data
      if (onDeckUpdate) {
        onDeckUpdate();
      }
      
      // Close and let parent refresh
      setTimeout(() => {
        onClose();
      }, 1000);
      
    } catch (error) {
      console.error('Error refreshing card data:', error);
      toast.error('Failed to refresh card data');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get card data from cached data
  const getCardData = (setCode, cardNumber, cardName) => {
    const cacheKey = `${setCode}-${cardNumber}`;
    
    console.log(`Getting card data for ${cacheKey}`, {
      hasCardData: !!cardData,
      keysAvailable: cardData ? Object.keys(cardData).length : 0,
      thisCardExists: cardData && cardData[cacheKey] ? 'YES' : 'NO'
    });
    
    // Get from cached data passed from parent
    if (cardData && cardData[cacheKey]) {
      const data = cardData[cacheKey];
      console.log(`  Found in cache:`, {
        name: data.name,
        supertype: data.supertype,
        isPokemon: data.isPokemon,
        isTrainer: data.isTrainer,
        isEnergy: data.isEnergy
      });
      return data;
    }
    
    console.log(`  NOT FOUND - using fallback`);
    
    // Return fallback if not found - try to guess type from card name
    const isPokemon = !cardName.toLowerCase().includes('energy') && 
                     !cardName.toLowerCase().match(/(professor|boss|iono|arven|nest ball|ultra ball|rare candy|switch|research)/);
    const isTrainer = cardName.toLowerCase().match(/(professor|boss|iono|arven|nest ball|ultra ball|rare candy|switch|research|supporter|item|stadium|tool)/);
    const isEnergy = cardName.toLowerCase().includes('energy');
    
    return {
      name: cardName,
      image: null,
      supertype: isPokemon ? 'Pokémon' : (isTrainer ? 'Trainer' : (isEnergy ? 'Energy' : 'Unknown')),
      subtypes: [],
      hp: null,
      types: [],
      abilities: [],
      attacks: [],
      weaknesses: [],
      resistances: [],
      retreatCost: [],
      rules: [],
      isBasic: false,
      isPokemon: isPokemon,
      isTrainer: isTrainer,
      isEnergy: isEnergy,
      error: true
    };
  };

  // Parse deck list into card objects with set codes
  const parseDeckList = (deckListText) => {
    const cards = [];
    const lines = deckListText.split('\n');
    
    let currentSection = 'unknown'; // pokemon, trainer, or energy
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check for section headers
      if (trimmedLine.match(/^Pokémon:/i) || trimmedLine.match(/^Pokemon:/i)) {
        currentSection = 'pokemon';
        console.log('Found Pokemon section');
        continue;
      }
      if (trimmedLine.match(/^Trainer:/i)) {
        currentSection = 'trainer';
        console.log('Found Trainer section');
        continue;
      }
      if (trimmedLine.match(/^Energy:/i)) {
        currentSection = 'energy';
        console.log('Found Energy section');
        continue;
      }
      
      // PTCGL format: "4 Pikachu ex SVI 78" or "4 Professor's Research SVI 189"
      const match = trimmedLine.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,5})\s+(\d+)$/i);
      if (match) {
        const count = parseInt(match[1]);
        const cardName = match[2].trim();
        const setCode = match[3].toUpperCase();
        const cardNumber = match[4];
        
        for (let i = 0; i < count; i++) {
          cards.push({
            name: cardName,
            setCode: setCode,
            cardNumber: cardNumber,
            id: `${setCode}-${cardNumber}-${i}`,
            section: currentSection, // Store which section this card is from
            data: null // Will be populated when drawing
          });
        }
      }
    }
    
    console.log(`Parsed ${cards.length} cards:`, {
      pokemon: cards.filter(c => c.section === 'pokemon').length,
      trainer: cards.filter(c => c.section === 'trainer').length,
      energy: cards.filter(c => c.section === 'energy').length
    });
    
    return cards;
  };

  // Shuffle array
  const shuffle = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Draw opening hand
  const drawHand = (forceDraw = false) => {
    // If hand exists and no Pokemon was selected, don't draw new hand (unless forced)
    // This enforces: you must select at least one basic Pokemon before continuing
    if (!forceDraw && hand.length > 0 && selectedBasics.size === 0) {
      console.log('No basic Pokemon selected, not drawing new hand');
      toast.error('Please select at least one Basic Pokemon before drawing a new hand!');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const cards = parseDeckList(deckList);
      
      if (cards.length === 0) {
        alert('No cards found in deck list. Make sure the format is correct (e.g., "4 Pikachu SVI 78")');
        setIsLoading(false);
        return;
      }
      
      const shuffled = shuffle(cards);
      const drawnHand = shuffled.slice(0, 7);
      
      // Get card data from cache for each card in hand
      console.log('=== Drawing Hand ===');
      console.log('Available cardData keys:', cardData ? Object.keys(cardData) : 'No cardData');
      
      const handWithData = drawnHand.map(card => {
        const cacheKey = `${card.setCode}-${card.cardNumber}`;
        const cachedData = getCardData(card.setCode, card.cardNumber, card.name);
        
        // Merge cached image data with section-based type info
        const isPokemon = card.section === 'pokemon';
        const isTrainer = card.section === 'trainer';
        const isEnergy = card.section === 'energy';
        
        const data = {
          ...cachedData,
          // Override type info from deck list sections (more reliable)
          isPokemon: isPokemon,
          isTrainer: isTrainer,
          isEnergy: isEnergy,
          supertype: isPokemon ? 'Pokémon' : (isTrainer ? 'Trainer' : (isEnergy ? 'Energy' : cachedData.supertype))
        };
        
        console.log(`Card: ${card.name} (${cacheKey})`);
        console.log('  Section:', card.section);
        console.log('  Image URL:', data.image);
        console.log('  Type:', { isPokemon, isTrainer, isEnergy });
        
        return {
          ...card,
          data: data
        };
      });
      
      console.log('Hand drawn successfully');
      
      // Count basic Pokemon from previously selected cards (before reset)
      // Only count if there was a previous hand (not the first draw)
      const basicPokemonCount = hand.length > 0 ? selectedBasics.size : 0;
      
      // Update test statistics
      const pokemonCount = handWithData.filter(c => c.data?.isPokemon).length;
      const trainerCount = handWithData.filter(c => c.data?.isTrainer).length;
      const energyCount = handWithData.filter(c => c.data?.isEnergy).length;
      
      setTestStats(prev => ({
        totalHandsDrawn: prev.totalHandsDrawn + 1,
        totalPokemon: prev.totalPokemon + pokemonCount,
        totalTrainer: prev.totalTrainer + trainerCount,
        totalEnergy: prev.totalEnergy + energyCount,
        totalCards: prev.totalCards + 7,
        totalBasicPokemon: prev.totalBasicPokemon + basicPokemonCount
      }));
      
      console.log('Test stats updated:', {
        handsDrawn: testStats.totalHandsDrawn + 1,
        pokemon: pokemonCount,
        trainer: trainerCount,
        energy: energyCount,
        basicPokemonFromSelection: basicPokemonCount,
        selectedBasicsSize: selectedBasics.size
      });
      
      setHand(handWithData);
      setSelectedBasics(new Set()); // Reset selections
    } catch (error) {
      console.error('Error drawing hand:', error);
      alert('Error drawing hand: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle mulligan (no basic Pokemon in hand)
  const handleMulligan = () => {
    console.log('Mulligan clicked - redrawing hand');
    setMulliganCount(prev => prev + 1);
    setSelectedBasics(new Set());
    drawHand(true); // Force redraw regardless of selections
  };

  // Toggle Pokemon as basic
  const toggleBasicSelection = (cardId, cardName) => {
    console.log(`Toggling card: ${cardName} (${cardId})`);
    setSelectedBasics(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        console.log(`  Removing from selection`);
        newSet.delete(cardId);
      } else {
        console.log(`  Adding to selection`);
        newSet.add(cardId);
      }
      console.log(`  Total selected: ${newSet.size}`);
      return newSet;
    });
  };

  // Save mulligan test results
  const handleSave = async () => {
    if (!deckId) {
      alert('Deck ID not found');
      return;
    }

    if (testStats.totalHandsDrawn === 0) {
      alert('No hands drawn yet. Draw some hands before saving!');
      return;
    }

    // Check if current hand has no selected basics
    if (hand.length > 0 && selectedBasics.size === 0) {
      const confirmed = window.confirm(
        '⚠️ Are you sure there are NO Basic Pokémon in this hand?\n\n' +
        'Click "OK" to confirm (will count as a mulligan)\n' +
        'Click "Cancel" to go back and select Basic Pokémon'
      );
      
      if (!confirmed) {
        // User wants to go back and select basics
        toast.info('Please select Basic Pokémon cards and save again');
        return;
      }
      
      // User confirmed no basics - count as mulligan
      setMulliganCount(prev => prev + 1);
      toast.warning('Counted as mulligan (no basic Pokémon)');
    }

    setIsSaving(true);
    try {
      // Calculate test metrics
      // Note: Use updated mulliganCount if we just incremented it
      const finalMulliganCount = (hand.length > 0 && selectedBasics.size === 0) 
        ? mulliganCount + 1 
        : mulliganCount;
      
      const mulliganPercentage = testStats.totalHandsDrawn > 0 
        ? ((finalMulliganCount / testStats.totalHandsDrawn) * 100).toFixed(1)
        : 0;
      
      const avgPokemon = (testStats.totalPokemon / testStats.totalHandsDrawn).toFixed(1);
      const avgTrainer = (testStats.totalTrainer / testStats.totalHandsDrawn).toFixed(1);
      const avgEnergy = (testStats.totalEnergy / testStats.totalHandsDrawn).toFixed(1);
      const avgBasicPokemon = (testStats.totalBasicPokemon / testStats.totalHandsDrawn).toFixed(1);
      
      console.log('Saving test results:', {
        deckId,
        totalHandsDrawn: testStats.totalHandsDrawn,
        mulliganCount,
        mulliganPercentage,
        avgPokemon,
        avgTrainer,
        avgEnergy,
        avgBasicPokemon
      });
      
      // Save to backend
      const response = await axios.post(
        `${API}/decks/${deckId}/test-results`,
        {
          total_hands: testStats.totalHandsDrawn,
          mulligan_count: mulliganCount,
          mulligan_percentage: parseFloat(mulliganPercentage),
          avg_pokemon: parseFloat(avgPokemon),
          avg_trainer: parseFloat(avgTrainer),
          avg_energy: parseFloat(avgEnergy),
          avg_basic_pokemon: parseFloat(avgBasicPokemon)
        },
        { withCredentials: true }
      );
      
      // Show accumulated totals in success message
      const totalHands = response.data.total_hands;
      const totalMulliganPct = response.data.mulligan_percentage;
      
      toast.success(
        `Test saved! Session: ${testStats.totalHandsDrawn} hands\nTotal accumulated: ${totalHands} hands • ${totalMulliganPct}% mulligan rate`
      );
      
      // Reset test stats
      setTestStats({
        totalHandsDrawn: 0,
        totalPokemon: 0,
        totalTrainer: 0,
        totalEnergy: 0,
        totalCards: 0,
        totalBasicPokemon: 0
      });
      setMulliganCount(0);
      
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Failed to save test results');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset simulator
  const reset = () => {
    setHand([]);
    setMulliganCount(0);
    setSelectedBasics(new Set());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1a1a1b] border-gray-800 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Opening Hand Simulator</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Instructions */}
          <div className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <h3 className="font-semibold text-blue-400 mb-2">How to Use</h3>
              <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                <li>Click "Draw Opening Hand" to draw 7 cards</li>
                <li>Click on Pokemon cards that are Basic Pokemon</li>
                <li>If no Basic Pokemon: Click "Mulligan" button</li>
                <li>If you have Basic Pokemon: Click "Draw Opening Hand" again to continue</li>
                <li>When done testing: Click "Save" to store mulligan count</li>
              </ol>
            </div>
            
            <div className="bg-[#0f0f10] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Card Type Colors</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Pokemon</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Trainer</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span>Energy</span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="draw-hand-btn"
              onClick={drawHand}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
            >
              {isLoading ? 'Loading...' : 'Draw Opening Hand'}
            </Button>
            
            {hand.length > 0 && !isLoading && (
              <>
                <Button
                  data-testid="mulligan-btn"
                  onClick={handleMulligan}
                  className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl"
                >
                  Mulligan (No Basic)
                </Button>
                
                <Button
                  data-testid="save-btn"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                >
                  {isSaving ? 'Saving...' : 'Save Test'}
                </Button>
                
                <Button
                  onClick={reset}
                  variant="outline"
                  className="border-gray-700 text-gray-300 hover:bg-gray-800 rounded-xl"
                >
                  Reset
                </Button>
              </>
            )}
          </div>

          {/* Test Statistics */}
          {testStats.totalHandsDrawn > 0 && (
            <div className="bg-[#0f0f10] border border-gray-700 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Current Test Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-sm text-gray-400">Hands Drawn</div>
                  <div className="text-2xl font-bold text-white">{testStats.totalHandsDrawn}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Mulligans</div>
                  <div className="text-2xl font-bold text-orange-400">{mulliganCount}</div>
                  <div className="text-xs text-gray-500">
                    {testStats.totalHandsDrawn > 0 
                      ? ((mulliganCount / testStats.totalHandsDrawn) * 100).toFixed(1)
                      : 0}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Avg Pokemon</div>
                  <div className="text-2xl font-bold text-green-400">
                    {(testStats.totalPokemon / testStats.totalHandsDrawn).toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Avg Trainer</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {(testStats.totalTrainer / testStats.totalHandsDrawn).toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-400">Avg Energy</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {(testStats.totalEnergy / testStats.totalHandsDrawn).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-500 mx-auto mb-4"></div>
                <p className="text-gray-400 text-lg">Drawing hand...</p>
              </div>
            </div>
          )}

          {/* Hand Display */}
          {hand.length > 0 && !isLoading && (
            <div>
              {/* Warning if no card data */}
              {(!cardData || Object.keys(cardData).length === 0) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
                  <h4 className="font-bold text-red-400 mb-2">⚠️ Card Data Not Available</h4>
                  <p className="text-sm text-gray-300 mb-3">
                    This deck was imported before the card database was set up. 
                    Click the button below to fetch card data without losing your match history.
                  </p>
                  <Button
                    onClick={handleRefreshCardData}
                    disabled={isRefreshing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isRefreshing ? 'Fetching Card Data...' : 'Refresh Card Data'}
                  </Button>
                </div>
              )}
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">Your Hand (7 cards)</h3>
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-xl font-semibold ${
                    selectedBasics.size > 0
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-orange-500/20 text-orange-400'
                  }`}>
                    {selectedBasics.size > 0 
                      ? `✓ ${selectedBasics.size} Basic Pokemon Selected` 
                      : '⚠ Click Basic Pokemon'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {hand.map((card, index) => {
                  const cardData = card.data;
                  const isPokemon = cardData?.isPokemon === true;
                  const isTrainer = cardData?.isTrainer === true;
                  const isEnergy = cardData?.isEnergy === true;
                  const isSelected = selectedBasics.has(card.id);
                  
                  console.log(`Rendering card ${index}: ${card.name}`, {
                    isPokemon,
                    isTrainer,
                    isEnergy,
                    supertype: cardData?.supertype,
                    isSelected
                  });
                  
                  // Get border color based on type
                  const getBorderColor = () => {
                    if (isPokemon) return isSelected ? 'border-emerald-500 shadow-emerald-500/50' : 'border-green-500 shadow-green-500/50';
                    if (isTrainer) return 'border-blue-500 shadow-blue-500/50';
                    if (isEnergy) return 'border-yellow-500 shadow-yellow-500/50';
                    return 'border-gray-600 shadow-gray-600/50';
                  };
                  
                  // Get type label
                  const getTypeLabel = () => {
                    if (isPokemon) return { text: 'POKEMON', color: isSelected ? 'bg-emerald-500' : 'bg-green-500' };
                    if (isTrainer) return { text: 'TRAINER', color: 'bg-blue-500' };
                    if (isEnergy) return { text: 'ENERGY', color: 'bg-yellow-500' };
                    return { text: 'UNKNOWN', color: 'bg-gray-600' };
                  };
                  
                  const typeLabel = getTypeLabel();
                  
                  return (
                    <div
                      key={card.id}
                      data-testid={`hand-card-${index}`}
                      onClick={(e) => {
                        console.log(`Card clicked:`, card.name, { isPokemon, isTrainer, isEnergy });
                        if (isPokemon) {
                          toggleBasicSelection(card.id, card.name);
                        } else {
                          console.log(`  Not a Pokemon, ignoring click`);
                        }
                      }}
                      onMouseEnter={() => setHoveredCard(card)}
                      onMouseLeave={() => setHoveredCard(null)}
                      className={`relative rounded-xl border-4 ${getBorderColor()} transition-all hover:scale-105 shadow-lg overflow-hidden bg-[#0a0a0b] ${
                        isPokemon ? 'cursor-pointer hover:border-emerald-400' : 'cursor-default'
                      }`}
                    >
                      {/* Selected Indicator */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-emerald-500/20 pointer-events-none z-10 flex items-center justify-center">
                          <div className="bg-emerald-500 text-white rounded-full p-3 shadow-lg">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-8 w-8"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                      
                      {/* Card Image */}
                      {cardData?.image ? (
                        <img 
                          src={cardData.image}
                          alt={cardData.name || card.name}
                          className="w-full h-auto"
                          loading="lazy"
                        />
                      ) : (
                        <div className="aspect-[2.5/3.5] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-4">
                          <div className="text-center">
                            <div className="w-12 h-12 mx-auto mb-3 bg-gray-700 rounded-lg flex items-center justify-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6 text-gray-500"
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
                            <p className="text-sm font-medium text-white break-words mb-2">
                              {card.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {card.setCode} {card.cardNumber}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Image not available
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Overlay badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
                        {/* Card Number */}
                        <span className="text-xs bg-black/90 text-white px-2 py-1 rounded-full font-bold shadow-lg">
                          #{index + 1}
                        </span>
                        
                        {/* Type Badge */}
                        <span className={`text-xs ${typeLabel.color} text-white px-2 py-1 rounded-full font-bold shadow-lg`}>
                          {typeLabel.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Statistics */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Pokemon</div>
                  <div className="text-2xl font-bold text-green-400">
                    {hand.filter(c => c.data?.isPokemon).length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {selectedBasics.size} marked basic
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Trainers</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {hand.filter(c => c.data?.isTrainer).length}
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Energy</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {hand.filter(c => c.data?.isEnergy).length}
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Mulligans</div>
                  <div className="text-2xl font-bold text-orange-400">{mulliganCount}</div>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {hand.length === 0 && (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 bg-gray-800/50 rounded-2xl flex items-center justify-center">
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
              <p className="text-gray-400 mb-4">Click "Draw Opening Hand" to test your deck's consistency</p>
            </div>
          )}
        </div>
        
        {/* Hover Preview - Large Card Image */}
        {hoveredCard && hoveredCard.data?.image && (
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="bg-black/90 backdrop-blur-sm rounded-2xl p-4 shadow-2xl border border-gray-700">
              <img 
                src={hoveredCard.data.image}
                alt={hoveredCard.name}
                className="max-w-[300px] max-h-[420px] rounded-xl"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HandSimulator;
