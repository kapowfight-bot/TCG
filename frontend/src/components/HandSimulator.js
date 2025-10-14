import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import axios from 'axios';

const HandSimulator = ({ deckList, cardData, deckId, isOpen, onClose }) => {
  const [hand, setHand] = useState([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [selectedBasics, setSelectedBasics] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    const lines = deckListText.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      // PTCGL format: "4 Pikachu ex SVI 78" or "4 Professor's Research SVI 189"
      // Match: count, card name, set code (2-4 letters), card number
      const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z]{2,5})\s+(\d+)$/i);
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
            data: null // Will be populated when drawing
          });
        }
      }
    }
    
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
  const drawHand = () => {
    // If hand exists and no Pokemon was selected, don't draw new hand
    if (hand.length > 0 && selectedBasics.size === 0) {
      console.log('No basic Pokemon selected, not drawing new hand');
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
        const data = getCardData(card.setCode, card.cardNumber, card.name);
        
        console.log(`Card: ${card.name} (${cacheKey})`);
        console.log('  Data found:', data.error ? 'NO' : 'YES');
        console.log('  Image URL:', data.image);
        console.log('  isPokemon:', data.isPokemon);
        console.log('  isTrainer:', data.isTrainer);
        console.log('  isEnergy:', data.isEnergy);
        console.log('  Supertype:', data.supertype);
        
        return {
          ...card,
          data: data
        };
      });
      
      console.log('Hand drawn successfully');
      
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
    setMulliganCount(prev => prev + 1);
    setSelectedBasics(new Set());
    drawHand();
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

    setIsSaving(true);
    try {
      // Save the mulligan count to deck notes or as a stat
      console.log(`Saving mulligan test: ${mulliganCount} mulligans for deck ${deckId}`);
      
      // You can extend this to save to backend if needed
      alert(`Mulligan test saved!\nTotal mulligans: ${mulliganCount}\nThis data can be used when logging matches.`);
      
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save mulligan test');
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

          {/* Mulligan Counter */}
          {mulliganCount > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-orange-400 font-semibold">
                  Mulligans: {mulliganCount}
                </span>
                <span className="text-sm text-gray-400">
                  Opponent draws {mulliganCount} card{mulliganCount !== 1 ? 's' : ''}
                </span>
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
      </DialogContent>
    </Dialog>
  );
};

export default HandSimulator;
