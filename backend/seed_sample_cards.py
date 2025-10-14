"""
Quick seed of popular Pokemon TCG cards for testing
"""
import asyncio
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

# Sample popular cards to seed
SAMPLE_CARDS = [
    {
        'card_id': 'sv1-1',
        'set_code': 'SV1',
        'card_number': '1',
        'name': 'Sprigatito',
        'supertype': 'Pokémon',
        'subtypes': ['Basic'],
        'hp': '70',
        'types': ['Grass'],
        'image_small': 'https://images.pokemontcg.io/sv1/1.png',
        'image_large': 'https://images.pokemontcg.io/sv1/1_hires.png',
        'set_name': 'Scarlet & Violet',
        'rarity': 'Common',
    },
    {
        'card_id': 'sv1-25',
        'set_code': 'SV1',
        'card_number': '25',
        'name': 'Charizard ex',
        'supertype': 'Pokémon',
        'subtypes': ['Stage 2', 'ex'],
        'hp': '330',
        'types': ['Fire'],
        'image_small': 'https://images.pokemontcg.io/sv1/25.png',
        'image_large': 'https://images.pokemontcg.io/sv1/25_hires.png',
        'set_name': 'Scarlet & Violet',
        'rarity': 'Double Rare',
    },
    {
        'card_id': 'sv1-108',
        'set_code': 'SV1',
        'card_number': '108',
        'name': 'Professor\'s Research',
        'supertype': 'Trainer',
        'subtypes': ['Supporter'],
        'image_small': 'https://images.pokemontcg.io/sv1/108.png',
        'image_large': 'https://images.pokemontcg.io/sv1/108_hires.png',
        'set_name': 'Scarlet & Violet',
        'rarity': 'Uncommon',
    },
    {
        'card_id': 'sve-1',
        'set_code': 'SVE',
        'card_number': '1',
        'name': 'Grass Energy',
        'supertype': 'Energy',
        'subtypes': ['Basic'],
        'types': ['Grass'],
        'image_small': 'https://images.pokemontcg.io/sve/1.png',
        'image_large': 'https://images.pokemontcg.io/sve/1_hires.png',
        'set_name': 'Scarlet & Violet Energies',
        'rarity': 'Common',
    },
]

async def seed_sample_cards():
    """Seed sample cards for testing"""
    
    print("=== Seeding Sample Cards ===\n")
    
    for card in SAMPLE_CARDS:
        await db.pokemon_cards.update_one(
            {'card_id': card['card_id']},
            {'$set': card},
            upsert=True
        )
        print(f"✓ {card['name']} ({card['card_id']})")
    
    # Create indexes
    await db.pokemon_cards.create_index([('set_code', 1), ('card_number', 1)])
    await db.pokemon_cards.create_index('card_id')
    
    count = await db.pokemon_cards.count_documents({})
    print(f"\n=== Complete ===")
    print(f"Total cards in database: {count}")

if __name__ == "__main__":
    asyncio.run(seed_sample_cards())
