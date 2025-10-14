"""
Seed Pokemon TCG Standard format cards into the database
This script fetches cards from the Pokemon TCG API and stores them locally
"""
import asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Standard format sets (as of 2024-2025)
STANDARD_SETS = [
    'sv1', 'sv2', 'sv3', 'sv4', 'sv5', 'sv6', 'sv7',  # Scarlet & Violet series
    'sve',  # Scarlet & Violet Energies
    'svp',  # Scarlet & Violet Promos
]

async def fetch_and_store_cards():
    """Fetch cards from Pokemon TCG API and store in database"""
    
    print("=== Starting Pokemon TCG Card Database Seeding ===\n")
    
    total_cards = 0
    
    for set_code in STANDARD_SETS:
        print(f"Fetching set: {set_code.upper()}")
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as http_client:
                # Fetch all cards from this set
                response = await http_client.get(
                    f"https://api.pokemontcg.io/v2/cards?q=set.id:{set_code}&pageSize=250"
                )
                response.raise_for_status()
                data = response.json()
                
                cards = data.get('data', [])
                print(f"  Found {len(cards)} cards")
                
                for card in cards:
                    # Create card document
                    card_doc = {
                        'card_id': card['id'],  # e.g., "sv1-1"
                        'set_code': card['set']['id'].upper(),
                        'card_number': card['number'],
                        'name': card['name'],
                        'supertype': card['supertype'],
                        'subtypes': card.get('subtypes', []),
                        'hp': card.get('hp'),
                        'types': card.get('types', []),
                        'image_small': card['images']['small'],
                        'image_large': card['images']['large'],
                        'abilities': card.get('abilities', []),
                        'attacks': card.get('attacks', []),
                        'weaknesses': card.get('weaknesses', []),
                        'resistances': card.get('resistances', []),
                        'retreat_cost': card.get('retreatCost', []),
                        'rules': card.get('rules', []),
                        'set_name': card['set']['name'],
                        'rarity': card.get('rarity'),
                    }
                    
                    # Upsert (insert or update)
                    await db.pokemon_cards.update_one(
                        {'card_id': card_doc['card_id']},
                        {'$set': card_doc},
                        upsert=True
                    )
                    
                    total_cards += 1
                
                print(f"  ✓ Stored {len(cards)} cards from {set_code.upper()}")
                
        except Exception as e:
            print(f"  ✗ Error fetching {set_code}: {e}")
            continue
    
    # Create index for faster lookups
    await db.pokemon_cards.create_index([('set_code', 1), ('card_number', 1)])
    await db.pokemon_cards.create_index('card_id')
    await db.pokemon_cards.create_index('name')
    
    print(f"\n=== Seeding Complete ===")
    print(f"Total cards stored: {total_cards}")
    print(f"Database ready for use!")

if __name__ == "__main__":
    asyncio.run(fetch_and_store_cards())
