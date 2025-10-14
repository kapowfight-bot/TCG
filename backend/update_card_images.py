"""
Update existing cards in database with images from LimitlessTCG
"""
import asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

async def fetch_image_from_limitless(set_code, card_number):
    """Fetch card image URL from LimitlessTCG"""
    try:
        limitless_url = f"https://limitlesstcg.com/cards/{set_code.upper()}/{card_number}"
        
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(limitless_url)
            response.raise_for_status()
            
            html = response.text
            
            # Extract image URL from HTML
            pattern = r'https://limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com/tpci/[^"]+\.png'
            matches = re.findall(pattern, html)
            
            if matches:
                # Get the large image (LG suffix)
                large_images = [m for m in matches if '_LG.png' in m or '_R_EN_LG.png' in m]
                if large_images:
                    return large_images[0]
                # Fallback to any image found
                return matches[0]
            
            return None
            
    except Exception as e:
        print(f"  Error fetching image: {str(e)}")
        return None

async def update_all_card_images():
    """Update all cards in database with images"""
    
    print("=== Updating Card Images from LimitlessTCG ===\n")
    
    # Get all cards without images
    cards = await db.pokemon_cards.find({
        "$or": [
            {"image_small": None},
            {"image_small": {"$exists": False}}
        ]
    }).to_list(length=None)
    
    print(f"Found {len(cards)} cards without images\n")
    
    updated_count = 0
    failed_count = 0
    
    for card in cards:
        set_code = card.get('set_code')
        card_number = card.get('card_number')
        card_name = card.get('name', 'Unknown')
        
        if not set_code or not card_number:
            print(f"✗ Skipping {card_name} - missing set_code or card_number")
            continue
        
        print(f"Fetching image for {card_name} ({set_code}-{card_number})...")
        
        image_url = await fetch_image_from_limitless(set_code, card_number)
        
        if image_url:
            # Update card with image
            await db.pokemon_cards.update_one(
                {"_id": card["_id"]},
                {"$set": {"image_small": image_url}}
            )
            print(f"  ✓ Updated with image")
            updated_count += 1
        else:
            print(f"  ✗ No image found")
            failed_count += 1
        
        # Small delay to avoid rate limiting
        await asyncio.sleep(0.5)
    
    print(f"\n=== Update Complete ===")
    print(f"Updated: {updated_count}")
    print(f"Failed: {failed_count}")
    print(f"Total: {len(cards)}")

if __name__ == "__main__":
    asyncio.run(update_all_card_images())
    client.close()
