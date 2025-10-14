import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import axios from 'axios';

const HandSimulator = ({ deckList, isOpen, onClose }) => {
  const [hand, setHand] = useState([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [hasBasic, setHasBasic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cardCache, setCardCache] = useState({});

  // Fetch card data from Pokemon TCG API
  const fetchCardData = async (setCode, cardNumber) => {
    const cacheKey = `${setCode}-${cardNumber}`;
    
    // Check cache first
    if (cardCache[cacheKey]) {
      return cardCache[cacheKey];
    }
    
    try {
      const response = await axios.get(
        `https://api.pokemontcg.io/v2/cards/${setCode.toLowerCase()}-${cardNumber}`
      );
      
      const card = response.data.data;
      const cardData = {
        name: card.name,
        image: card.images.small,
        supertype: card.supertype, // "Pokémon", "Trainer", "Energy"
        subtypes: card.subtypes || [], // ["Basic"], ["Stage 1"], ["Stage 2"], ["Item"], etc.
        isBasic: card.supertype === 'Pokémon' && card.subtypes?.includes('Basic'),
        isPokemon: card.supertype === 'Pokémon',
        isTrainer: card.supertype === 'Trainer',
        isEnergy: card.supertype === 'Energy'
      };
      
      // Cache the result
      setCardCache(prev => ({ ...prev, [cacheKey]: cardData }));
      
      return cardData;
    } catch (error) {
      console.error('Error fetching card:', error);
      // Return fallback data
      return {
        name: 'Unknown Card',
        image: null,
        supertype: 'Unknown',
        subtypes: [],
        isBasic: false,
        isPokemon: false,
        isTrainer: false,
        isEnergy: false
      };
    }
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
  const drawHand = async (isMulligan = false) => {
    setIsLoading(true);
    
    try {
      const cards = parseDeckList(deckList);
      const shuffled = shuffle(cards);
      const drawnHand = shuffled.slice(0, 7);
      
      // Fetch card data for each card in hand
      const handWithData = await Promise.all(
        drawnHand.map(async (card) => {
          const cardData = await fetchCardData(card.setCode, card.cardNumber);
          return {
            ...card,
            data: cardData
          };
        })
      );
      
      const hasBasicPokemon = handWithData.some(card => card.data?.isBasic);
      
      setHand(handWithData);
      setHasBasic(hasBasicPokemon);
      
      if (isMulligan) {
        setMulliganCount(prev => prev + 1);
      } else {
        setMulliganCount(0);
      }
    } catch (error) {
      console.error('Error drawing hand:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset simulator
  const reset = () => {
    setHand([]);
    setMulliganCount(0);
    setHasBasic(false);
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
              <h3 className="font-semibold text-blue-400 mb-2">Pokemon TCG Mulligan Rule</h3>
              <p className="text-sm text-gray-300">
                If you don't have a Basic Pokemon in your opening hand, you must mulligan (shuffle and redraw).
                Your opponent draws 1 card for each mulligan.
              </p>
            </div>
            
            <div className="bg-[#0f0f10] rounded-xl p-4">
              <h3 className="font-semibold mb-3">Card Type Legend</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span>Basic Pokemon</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  <span>Evolved Pokemon</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span>Trainer Cards</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span>Energy Cards</span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="draw-hand-btn"
              onClick={() => drawHand(false)}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
            >
              {isLoading ? 'Loading Cards...' : 'Draw Opening Hand'}
            </Button>
            
            {hand.length > 0 && !hasBasic && !isLoading && (
              <Button
                data-testid="mulligan-btn"
                onClick={() => drawHand(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl"
              >
                Mulligan
              </Button>
            )}
            
            {hand.length > 0 && !isLoading && (
              <Button
                onClick={reset}
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800 rounded-xl"
              >
                Reset
              </Button>
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

          {/* Hand Display */}
          {hand.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">Your Hand (7 cards)</h3>
                <div className={`px-4 py-2 rounded-xl font-semibold ${
                  hasBasic 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {hasBasic ? '✓ Has Basic Pokemon' : '✗ No Basic Pokemon'}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {hand.map((card, index) => {
                  const cardData = card.data;
                  const isBasic = cardData?.isBasic;
                  const isPokemon = cardData?.isPokemon;
                  const isTrainer = cardData?.isTrainer;
                  const isEnergy = cardData?.isEnergy;
                  const isEvolved = isPokemon && !isBasic;
                  
                  return (
                    <div
                      key={card.id}
                      data-testid={`hand-card-${index}`}
                      className={`rounded-xl overflow-hidden border-4 transition-all hover:scale-105 ${
                        isBasic 
                          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' 
                          : isEvolved
                          ? 'border-purple-500 shadow-lg shadow-purple-500/20'
                          : isTrainer
                          ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                          : isEnergy
                          ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
                          : 'border-gray-700'
                      }`}
                    >
                      {/* Card Image */}
                      {cardData?.image ? (
                        <img 
                          src={cardData.image} 
                          alt={cardData.name}
                          className="w-full h-auto"
                        />
                      ) : (
                        <div className="aspect-[2.5/3.5] bg-[#0f0f10] flex items-center justify-center p-4">
                          <div className="text-center">
                            <p className="text-sm font-medium break-words">{card.name}</p>
                            <p className="text-xs text-gray-500 mt-2">{card.setCode} {card.cardNumber}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Card Type Badge */}
                      <div className="absolute top-2 right-2">
                        {isBasic && (
                          <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded-full font-bold shadow-lg">
                            BASIC
                          </span>
                        )}
                        {isEvolved && cardData?.subtypes && (
                          <span className="text-xs bg-purple-500 text-white px-2 py-1 rounded-full font-bold shadow-lg">
                            {cardData.subtypes.join(' ')}
                          </span>
                        )}
                        {isTrainer && (
                          <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full font-bold shadow-lg">
                            TRAINER
                          </span>
                        )}
                        {isEnergy && (
                          <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded-full font-bold shadow-lg">
                            ENERGY
                          </span>
                        )}
                      </div>
                      
                      {/* Card Number */}
                      <div className="absolute top-2 left-2">
                        <span className="text-xs bg-black/80 text-white px-2 py-1 rounded-full font-bold">
                          #{index + 1}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Statistics */}
              <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Basic Pokemon</div>
                  <div className="text-2xl font-bold text-emerald-500">
                    {hand.filter(c => c.isBasic).length}
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Evolved</div>
                  <div className="text-2xl font-bold text-purple-400">
                    {hand.filter(c => !c.isBasic && !c.isTrainer && !c.isEnergy).length}
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Trainers</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {hand.filter(c => c.isTrainer).length}
                  </div>
                </div>
                <div className="bg-[#0f0f10] rounded-xl p-4">
                  <div className="text-sm text-gray-400 mb-1">Energy</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {hand.filter(c => c.isEnergy).length}
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
