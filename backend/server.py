from fastapi import FastAPI, APIRouter, HTTPException, Response, Cookie, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    picture: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Deck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    deck_name: str
    deck_list: str  # PTCGL format text
    card_data: Optional[dict] = None  # Cached card data from Pokemon TCG API
    test_results: Optional[dict] = None  # Hand simulator test results
    stats: Optional[dict] = None  # Basic stats for dashboard (calculated on-demand)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Match(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    deck_id: str
    user_id: str
    result: str  # "win" or "loss"
    opponent_deck_name: str
    went_first: bool
    bad_game: bool = False
    mulligan_count: int = 0
    notes: Optional[str] = None
    match_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Input Models
class SessionRequest(BaseModel):
    session_id: str

class SessionResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: str

class DeckCreate(BaseModel):
    deck_name: str
    deck_list: str
    card_data: Optional[dict] = None

class DeckUpdate(BaseModel):
    deck_name: Optional[str] = None
    deck_list: Optional[str] = None
    card_data: Optional[dict] = None

class MatchCreate(BaseModel):
    deck_id: str
    result: str
    opponent_deck_name: str
    went_first: bool
    bad_game: bool = False
    mulligan_count: int = 0
    notes: Optional[str] = None

class MatchUpdate(BaseModel):
    result: Optional[str] = None
    opponent_deck_name: Optional[str] = None
    went_first: Optional[bool] = None
    bad_game: Optional[bool] = None
    mulligan_count: Optional[int] = None
    notes: Optional[str] = None

class DeckStats(BaseModel):
    total_matches: int
    wins: int
    losses: int
    win_rate: float
    bad_games: int
    went_first_wins: int
    went_first_losses: int
    went_second_wins: int
    went_second_losses: int
    avg_mulligans: float
    total_mulligans: int
    opponent_stats: dict

# Helper function to get user from session
async def get_current_user(request: Request) -> Optional[User]:
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Fallback to Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.replace("Bearer ", "")
    
    if not session_token:
        return None
    
    # Find session in database
    session = await db.sessions.find_one({
        "session_token": session_token,
        "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}
    }, {"_id": 0})
    
    if not session:
        return None
    
    # Get user
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        return None
    
    # Convert datetime strings back to datetime objects
    if isinstance(user.get('created_at'), str):
        user['created_at'] = datetime.fromisoformat(user['created_at'])
    
    return User(**user)

# Auth Routes
@api_router.post("/auth/session", response_model=SessionResponse)
async def create_session(session_req: SessionRequest, response: Response):
    """Process session_id from Google OAuth and create session"""
    try:
        # Call Emergent auth API to get user data
        auth_service_url = os.environ.get('AUTH_SERVICE_URL', 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data')
        async with httpx.AsyncClient() as client:
            auth_response = await client.get(
                auth_service_url,
                headers={"X-Session-ID": session_req.session_id},
                timeout=10.0
            )
            auth_response.raise_for_status()
            user_data = auth_response.json()
        
        # Check if user exists
        existing_user = await db.users.find_one({"email": user_data["email"]}, {"_id": 0})
        
        if not existing_user:
            # Create new user
            new_user = User(
                email=user_data["email"],
                name=user_data["name"],
                picture=user_data["picture"]
            )
            user_doc = new_user.model_dump()
            user_doc['created_at'] = user_doc['created_at'].isoformat()
            await db.users.insert_one(user_doc)
            user = new_user
        else:
            if isinstance(existing_user.get('created_at'), str):
                existing_user['created_at'] = datetime.fromisoformat(existing_user['created_at'])
            user = User(**existing_user)
        
        # Create session
        session_token = user_data["session_token"]
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        new_session = Session(
            user_id=user.id,
            session_token=session_token,
            expires_at=expires_at
        )
        
        session_doc = new_session.model_dump()
        session_doc['expires_at'] = session_doc['expires_at'].isoformat()
        session_doc['created_at'] = session_doc['created_at'].isoformat()
        await db.sessions.insert_one(session_doc)
        
        # Set httpOnly cookie
        response.set_cookie(
            key="session_token",
            value=session_token,
            httponly=True,
            secure=True,
            samesite="none",
            max_age=7 * 24 * 60 * 60,  # 7 days
            path="/"
        )
        
        return SessionResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            picture=user.picture
        )
    
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=f"Failed to authenticate: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@api_router.get("/auth/me", response_model=SessionResponse)
async def get_me(request: Request):
    """Get current user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return SessionResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture
    )

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    
    if session_token:
        # Delete session from database
        await db.sessions.delete_one({"session_token": session_token})
    
    # Clear cookie
    response.delete_cookie(key="session_token", path="/")
    
    return {"message": "Logged out successfully"}

# Deck Routes
@api_router.post("/decks", response_model=Deck)
async def create_deck(deck_data: DeckCreate, request: Request):
    """Create a new deck"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    new_deck = Deck(
        user_id=user.id,
        deck_name=deck_data.deck_name,
        deck_list=deck_data.deck_list,
        card_data=deck_data.card_data
    )
    
    deck_doc = new_deck.model_dump()
    deck_doc['created_at'] = deck_doc['created_at'].isoformat()
    deck_doc['updated_at'] = deck_doc['updated_at'].isoformat()
    await db.decks.insert_one(deck_doc)
    
    return new_deck

@api_router.get("/decks", response_model=List[Deck])
async def get_decks(request: Request):
    """Get all decks for current user with stats"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    decks = await db.decks.find({"user_id": user.id}, {"_id": 0}).to_list(1000)
    
    # Convert datetime strings and add stats for each deck
    for deck in decks:
        if isinstance(deck.get('created_at'), str):
            deck['created_at'] = datetime.fromisoformat(deck['created_at'])
        if isinstance(deck.get('updated_at'), str):
            deck['updated_at'] = datetime.fromisoformat(deck['updated_at'])
        
        # Calculate basic stats for dashboard display
        matches = await db.matches.find({"deck_id": deck["id"]}, {"_id": 0}).to_list(1000)
        total_matches = len(matches)
        
        if total_matches > 0:
            wins = sum(1 for m in matches if m["result"] == "win")
            losses = total_matches - wins
            win_rate = round((wins / total_matches) * 100, 1) if total_matches > 0 else 0
            
            deck['stats'] = {
                'total_matches': total_matches,
                'wins': wins,
                'losses': losses,
                'win_rate': win_rate
            }
        else:
            deck['stats'] = {
                'total_matches': 0,
                'wins': 0,
                'losses': 0,
                'win_rate': 0
            }
    
    return decks

@api_router.get("/decks/{deck_id}", response_model=Deck)
async def get_deck(deck_id: str, request: Request):
    """Get a specific deck"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    deck = await db.decks.find_one({"id": deck_id, "user_id": user.id}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    if isinstance(deck.get('created_at'), str):
        deck['created_at'] = datetime.fromisoformat(deck['created_at'])
    if isinstance(deck.get('updated_at'), str):
        deck['updated_at'] = datetime.fromisoformat(deck['updated_at'])
    
    return Deck(**deck)

@api_router.put("/decks/{deck_id}", response_model=Deck)
async def update_deck(deck_id: str, deck_update: DeckUpdate, request: Request):
    """Update a deck - resets test_results if deck_list changes"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if deck exists and belongs to user
    existing_deck = await db.decks.find_one({"id": deck_id, "user_id": user.id}, {"_id": 0})
    if not existing_deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # Prepare update data
    update_data = {k: v for k, v in deck_update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # If deck_list is being updated, reset test_results
    # (user needs to re-run hand simulator with new deck)
    if deck_update.deck_list is not None:
        update_data['test_results'] = None
    
    await db.decks.update_one({"id": deck_id}, {"$set": update_data})
    
    # Get updated deck
    updated_deck = await db.decks.find_one({"id": deck_id}, {"_id": 0})
    if isinstance(updated_deck.get('created_at'), str):
        updated_deck['created_at'] = datetime.fromisoformat(updated_deck['created_at'])
    if isinstance(updated_deck.get('updated_at'), str):
        updated_deck['updated_at'] = datetime.fromisoformat(updated_deck['updated_at'])
    
    return Deck(**updated_deck)

@api_router.delete("/decks/{deck_id}")
async def delete_deck(deck_id: str, request: Request):
    """Delete a deck"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.decks.delete_one({"id": deck_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # Also delete all matches for this deck
    await db.matches.delete_many({"deck_id": deck_id})
    
    return {"message": "Deck deleted successfully"}

# Match Routes
@api_router.post("/matches", response_model=Match)
async def create_match(match_data: MatchCreate, request: Request):
    """Log a match"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify deck belongs to user
    deck = await db.decks.find_one({"id": match_data.deck_id, "user_id": user.id}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    new_match = Match(
        deck_id=match_data.deck_id,
        user_id=user.id,
        result=match_data.result,
        opponent_deck_name=match_data.opponent_deck_name,
        went_first=match_data.went_first,
        bad_game=match_data.bad_game,
        mulligan_count=match_data.mulligan_count,
        notes=match_data.notes
    )
    
    match_doc = new_match.model_dump()
    match_doc['match_date'] = match_doc['match_date'].isoformat()
    match_doc['created_at'] = match_doc['created_at'].isoformat()
    await db.matches.insert_one(match_doc)
    
    return new_match

@api_router.get("/matches/{deck_id}", response_model=List[Match])
async def get_matches(deck_id: str, request: Request):
    """Get all matches for a deck"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify deck belongs to user
    deck = await db.decks.find_one({"id": deck_id, "user_id": user.id}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    matches = await db.matches.find({"deck_id": deck_id}, {"_id": 0}).sort("match_date", -1).to_list(1000)
    
    # Convert datetime strings back to datetime objects
    for match in matches:
        if isinstance(match.get('match_date'), str):
            match['match_date'] = datetime.fromisoformat(match['match_date'])
        if isinstance(match.get('created_at'), str):
            match['created_at'] = datetime.fromisoformat(match['created_at'])
    
    return matches

@api_router.put("/matches/{match_id}", response_model=Match)
async def update_match(match_id: str, match_update: MatchUpdate, request: Request):
    """Update a match"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if match exists and belongs to user
    existing_match = await db.matches.find_one({"id": match_id, "user_id": user.id}, {"_id": 0})
    if not existing_match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    # Prepare update data
    update_data = {k: v for k, v in match_update.model_dump().items() if v is not None}
    
    await db.matches.update_one({"id": match_id}, {"$set": update_data})
    
    # Get updated match
    updated_match = await db.matches.find_one({"id": match_id}, {"_id": 0})
    if isinstance(updated_match.get('match_date'), str):
        updated_match['match_date'] = datetime.fromisoformat(updated_match['match_date'])
    if isinstance(updated_match.get('created_at'), str):
        updated_match['created_at'] = datetime.fromisoformat(updated_match['created_at'])
    
    return Match(**updated_match)

@api_router.delete("/matches/{match_id}")
async def delete_match(match_id: str, request: Request):
    """Delete a match"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    result = await db.matches.delete_one({"id": match_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Match not found")
    
    return {"message": "Match deleted successfully"}

@api_router.get("/decks/{deck_id}/stats", response_model=DeckStats)
async def get_deck_stats(deck_id: str, request: Request):
    """Get statistics for a deck"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Verify deck belongs to user
    deck = await db.decks.find_one({"id": deck_id, "user_id": user.id}, {"_id": 0})
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    
    # Get all matches for this deck
    matches = await db.matches.find({"deck_id": deck_id}, {"_id": 0}).to_list(1000)
    
    # Calculate stats
    total_matches = len(matches)
    wins = sum(1 for m in matches if m["result"] == "win")
    losses = total_matches - wins
    win_rate = (wins / total_matches * 100) if total_matches > 0 else 0
    bad_games = sum(1 for m in matches if m.get("bad_game", False))
    
    went_first_wins = sum(1 for m in matches if m["result"] == "win" and m["went_first"])
    went_first_losses = sum(1 for m in matches if m["result"] == "loss" and m["went_first"])
    went_second_wins = sum(1 for m in matches if m["result"] == "win" and not m["went_first"])
    went_second_losses = sum(1 for m in matches if m["result"] == "loss" and not m["went_first"])
    
    # Calculate mulligan stats
    total_mulligans = sum(m.get("mulligan_count", 0) for m in matches)
    avg_mulligans = (total_mulligans / total_matches) if total_matches > 0 else 0
    
    # Calculate opponent stats
    opponent_stats = {}
    for match in matches:
        opp = match["opponent_deck_name"]
        if opp not in opponent_stats:
            opponent_stats[opp] = {"wins": 0, "losses": 0, "total": 0}
        
        opponent_stats[opp]["total"] += 1
        if match["result"] == "win":
            opponent_stats[opp]["wins"] += 1
        else:
            opponent_stats[opp]["losses"] += 1
    
    return DeckStats(
        total_matches=total_matches,
        wins=wins,
        losses=losses,
        win_rate=round(win_rate, 2),
        bad_games=bad_games,
        went_first_wins=went_first_wins,
        went_first_losses=went_first_losses,
        went_second_wins=went_second_wins,
        went_second_losses=went_second_losses,
        avg_mulligans=round(avg_mulligans, 2),
        total_mulligans=total_mulligans,
        opponent_stats=opponent_stats
    )

@api_router.get("/cards/{set_code}/{card_number}")
async def get_card_from_db(set_code: str, card_number: str):
    """Get card from local database"""
    # Try exact match first
    card = await db.pokemon_cards.find_one(
        {
            "set_code": set_code.upper(),
            "card_number": card_number
        },
        {"_id": 0}
    )
    
    if not card:
        # Try with card_id format
        card_id = f"{set_code.lower()}-{card_number}"
        card = await db.pokemon_cards.find_one(
            {"card_id": card_id},
            {"_id": 0}
        )
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found in database")
    
    return card

@api_router.get("/cards/count")
async def get_cards_count():
    """Get total number of cards in database"""
    count = await db.pokemon_cards.count_documents({})
    return {"count": count}

@api_router.get("/cards/image/{set_code}/{card_number}")
async def get_card_image_from_limitless(set_code: str, card_number: str):
    """Fetch card image URL from LimitlessTCG"""
    try:
        # LimitlessTCG URL pattern
        limitless_url = f"https://limitlesstcg.com/cards/{set_code.upper()}/{card_number}"
        
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(limitless_url)
            response.raise_for_status()
            
            html = response.text
            
            # Extract image URL from HTML
            # Look for the large card image in the page
            import re
            
            # Pattern: limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{NUM}_*_EN_LG.png
            pattern = r'https://limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com/tpci/[^"]+\.png'
            matches = re.findall(pattern, html)
            
            if matches:
                # Get the large image (LG suffix)
                large_images = [m for m in matches if '_LG.png' in m or '_R_EN_LG.png' in m]
                if large_images:
                    return {"image_url": large_images[0]}
                # Fallback to any image found
                return {"image_url": matches[0]}
            
            return {"image_url": None, "error": "Image not found in page"}
            
    except Exception as e:
        logger.error(f"Error fetching image from LimitlessTCG: {str(e)}")
        return {"image_url": None, "error": str(e)}

@api_router.post("/cards/batch")
async def save_cards_batch(cards: dict):
    """Save multiple cards to database in batch (progressive population)"""
    try:
        saved_count = 0
        skipped_count = 0
        
        for cache_key, card_data in cards.items():
            # Extract set_code and card_number from cache_key (e.g., "MEW-123")
            parts = cache_key.split('-')
            if len(parts) < 2:
                continue
            
            set_code = parts[0].upper()
            card_number = '-'.join(parts[1:])  # Handle card numbers with dashes
            card_id = f"{set_code.lower()}-{card_number}"
            
            # Check if card already exists
            existing = await db.pokemon_cards.find_one({
                "$or": [
                    {"set_code": set_code, "card_number": card_number},
                    {"card_id": card_id}
                ]
            })
            
            if existing:
                skipped_count += 1
                continue
            
            # Prepare card document for database
            card_doc = {
                "card_id": card_id,
                "set_code": set_code,
                "card_number": card_number,
                "name": card_data.get("name"),
                "supertype": card_data.get("supertype"),
                "subtypes": card_data.get("subtypes", []),
                "hp": card_data.get("hp"),
                "types": card_data.get("types", []),
                "abilities": card_data.get("abilities", []),
                "attacks": card_data.get("attacks", []),
                "weaknesses": card_data.get("weaknesses", []),
                "resistances": card_data.get("resistances", []),
                "retreat_cost": card_data.get("retreatCost", []),
                "rules": card_data.get("rules", []),
                "image_small": card_data.get("image"),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.pokemon_cards.insert_one(card_doc)
            saved_count += 1
        
        return {
            "message": "Cards saved successfully",
            "saved": saved_count,
            "skipped": skipped_count,
            "total": saved_count + skipped_count
        }
    except Exception as e:
        logger.error(f"Error saving cards batch: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save cards: {str(e)}")

class TestResults(BaseModel):
    total_hands: int
    mulligan_count: int
    mulligan_percentage: float
    avg_pokemon: float
    avg_trainer: float
    avg_energy: float
    avg_basic_pokemon: float = 0.0  # Optional for backward compatibility

@api_router.post("/decks/{deck_id}/test-results")
async def save_test_results(deck_id: str, test_results: TestResults, request: Request):
    """Save hand simulator test results to deck (accumulative)"""
    try:
        user = await get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Verify deck belongs to user
        deck = await db.decks.find_one({"id": deck_id, "user_id": user.id}, {"_id": 0})
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Get existing test results (if any) - ensure it's a dict, not None
        existing_results = deck.get("test_results") or {}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in save_test_results (initial): {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error loading deck: {str(e)}")
    
    try:
        # Calculate accumulated totals - handle None/missing values
        old_total_hands = existing_results.get("total_hands", 0) if existing_results else 0
        old_mulligan_count = existing_results.get("mulligan_count", 0) if existing_results else 0
        old_total_pokemon = (existing_results.get("avg_pokemon", 0) if existing_results else 0) * old_total_hands
        old_total_trainer = (existing_results.get("avg_trainer", 0) if existing_results else 0) * old_total_hands
        old_total_energy = (existing_results.get("avg_energy", 0) if existing_results else 0) * old_total_hands
        old_total_basic_pokemon = (existing_results.get("avg_basic_pokemon", 0) if existing_results else 0) * old_total_hands
        
        # Add new test results to existing
        new_total_hands = old_total_hands + test_results.total_hands
        new_mulligan_count = old_mulligan_count + test_results.mulligan_count
        new_total_pokemon = old_total_pokemon + (test_results.avg_pokemon * test_results.total_hands)
        new_total_trainer = old_total_trainer + (test_results.avg_trainer * test_results.total_hands)
        new_total_energy = old_total_energy + (test_results.avg_energy * test_results.total_hands)
        new_total_basic_pokemon = old_total_basic_pokemon + (test_results.avg_basic_pokemon * test_results.total_hands)
        
        # Calculate new averages
        new_mulligan_percentage = (new_mulligan_count / new_total_hands * 100) if new_total_hands > 0 else 0
        new_avg_pokemon = new_total_pokemon / new_total_hands if new_total_hands > 0 else 0
        new_avg_trainer = new_total_trainer / new_total_hands if new_total_hands > 0 else 0
        new_avg_energy = new_total_energy / new_total_hands if new_total_hands > 0 else 0
        new_avg_basic_pokemon = new_total_basic_pokemon / new_total_hands if new_total_hands > 0 else 0
        
        # Update deck with accumulated test results
        await db.decks.update_one(
            {"id": deck_id},
            {"$set": {
                "test_results": {
                    "total_hands": new_total_hands,
                    "mulligan_count": new_mulligan_count,
                    "mulligan_percentage": round(new_mulligan_percentage, 1),
                    "avg_pokemon": round(new_avg_pokemon, 1),
                    "avg_trainer": round(new_avg_trainer, 1),
                    "avg_energy": round(new_avg_energy, 1),
                    "avg_basic_pokemon": round(new_avg_basic_pokemon, 1),
                    "last_tested": datetime.now(timezone.utc).isoformat()
                }
            }}
        )
        
        return {
            "message": "Test results saved successfully (accumulated)",
            "total_hands": new_total_hands,
            "mulligan_percentage": round(new_mulligan_percentage, 1)
        }
    except Exception as e:
        logger.error(f"Error in save_test_results (calculation/save): {str(e)}")
        logger.error(f"  existing_results: {existing_results}")
        logger.error(f"  test_results: {test_results}")
        raise HTTPException(status_code=500, detail=f"Error saving test results: {str(e)}")

@api_router.get("/meta-wizard/{deck_name}")
async def get_meta_wizard(deck_name: str):
    """Scrape TrainerHill meta data for deck matchups"""
    try:
        # Scrape TrainerHill meta page
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.get("https://www.trainerhill.com/meta?game=PTCG")
            response.raise_for_status()
            
            html = response.text
            
        # Parse HTML to find matchup data
        # TrainerHill uses tables with deck matchups
        import re
        from bs4 import BeautifulSoup
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Normalize deck name for matching (remove "EX", spaces, etc.)
        search_name = deck_name.lower().replace(' ex', '').replace('ex', '').strip()
        
        # Find the deck row in the meta table
        matchups = []
        
        # Look for tables with matchup data
        tables = soup.find_all('table')
        
        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) > 0:
                    # Check if this row contains our deck
                    first_cell_text = cells[0].get_text().lower().strip()
                    if search_name in first_cell_text or first_cell_text in search_name:
                        # Found our deck, parse matchup data
                        # Extract matchup percentages from remaining cells
                        for i, cell in enumerate(cells[1:], 1):
                            cell_text = cell.get_text().strip()
                            # Look for percentage patterns (e.g., "65%", "45.5%")
                            percentage_match = re.search(r'(\d+(?:\.\d+)?)\s*%', cell_text)
                            if percentage_match:
                                win_rate = float(percentage_match.group(1))
                                # Get opponent name from header or context
                                matchups.append({
                                    'opponent': f'Matchup {i}',
                                    'win_rate': win_rate
                                })
        
        # If no structured data found, return mock data for now
        if not matchups:
            logger.warning(f"No matchup data found for {deck_name} on TrainerHill")
            return {
                'deck_name': deck_name,
                'best_matchups': [
                    {'opponent': 'Data not available', 'win_rate': 0}
                ],
                'worst_matchups': [
                    {'opponent': 'Data not available', 'win_rate': 0}
                ],
                'source': 'TrainerHill',
                'note': 'Unable to parse matchup data. Deck may not be in current meta.'
            }
        
        # Sort matchups by win rate
        sorted_matchups = sorted(matchups, key=lambda x: x['win_rate'], reverse=True)
        
        # Get best 3 and worst 3
        best_3 = sorted_matchups[:3] if len(sorted_matchups) >= 3 else sorted_matchups
        worst_3 = sorted_matchups[-3:] if len(sorted_matchups) >= 3 else sorted_matchups
        worst_3.reverse()  # Show worst first
        
        return {
            'deck_name': deck_name,
            'best_matchups': best_3,
            'worst_matchups': worst_3,
            'source': 'TrainerHill',
            'total_matchups': len(matchups)
        }
        
    except Exception as e:
        logger.error(f"Error fetching meta data from TrainerHill: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch meta data: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()