from fastapi import APIRouter, HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List
from auth import decode_token
from sui_client import verify_voxx_ownership, get_owned_objects, VOXX_TYPE

router = APIRouter(prefix="/staking", tags=["staking"])

class StakeRequest(BaseModel):
    object_id: str

class StakeResponse(BaseModel):
    success: bool
    status: str
    staked_at: str

class UnstakeRequest(BaseModel):
    object_id: str

class UnstakeResponse(BaseModel):
    success: bool
    status: str
    points_earned: float

class StakingPosition(BaseModel):
    object_id: str
    staked_at: str
    unstaked_at: Optional[str]
    status: str
    points_earned: float
    duration_days: float
    tier: str

class StakingStats(BaseModel):
    total_staked: int
    total_points: float
    positions: List[StakingPosition]

class UserNFTsResponse(BaseModel):
    nfts: List[dict]
    count: int

def get_stakes_collection(db: AsyncIOMotorDatabase):
    return db["stakes"]

def get_tiers_collection(db: AsyncIOMotorDatabase):
    return db["tiers"]

def calculate_points(staked_at: datetime, unstaked_at: datetime, tier_multiplier: float) -> float:
    duration = (unstaked_at - staked_at).total_seconds() / 86400
    base_points_per_day = 10.0
    return duration * base_points_per_day * tier_multiplier

def get_tier_for_duration(duration_days: float, tiers: list) -> dict:
    sorted_tiers = sorted(tiers, key=lambda x: x["min_days"], reverse=True)
    for tier in sorted_tiers:
        if duration_days >= tier["min_days"]:
            return tier
    return sorted_tiers[-1] if sorted_tiers else {"name": "Bronze", "multiplier": 1.0, "min_days": 0}

def create_staking_router(db: AsyncIOMotorDatabase):
    @router.post("/stake", response_model=StakeResponse)
    async def stake_nft(body: StakeRequest, authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        coll = get_stakes_collection(db)

        existing = await coll.find_one({"address": address, "object_id": body.object_id, "status": "staked"}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="NFT already staked")

        owns = await verify_voxx_ownership(address, body.object_id)
        if not owns:
            raise HTTPException(status_code=400, detail="You do not own this VOXX NFT or it does not exist")

        staked_at = datetime.now(timezone.utc)
        doc = {
            "address": address,
            "object_id": body.object_id,
            "staked_at": staked_at.isoformat(),
            "unstaked_at": None,
            "status": "staked",
            "points_earned": 0.0,
        }
        await coll.insert_one(doc)
        return StakeResponse(success=True, status="staked", staked_at=staked_at.isoformat())

    @router.post("/unstake", response_model=UnstakeResponse)
    async def unstake_nft(body: UnstakeRequest, authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        coll = get_stakes_collection(db)
        tiers_coll = get_tiers_collection(db)

        existing = await coll.find_one({"address": address, "object_id": body.object_id, "status": "staked"}, {"_id": 1, "staked_at": 1})
        if not existing:
            raise HTTPException(status_code=400, detail="No active stake found for this NFT")

        unstaked_at = datetime.now(timezone.utc)
        staked_at = datetime.fromisoformat(existing["staked_at"])
        duration_days = (unstaked_at - staked_at).total_seconds() / 86400

        tiers = await tiers_coll.find({}, {"_id": 0}).to_list(100)
        if not tiers:
            tiers = [
                {"name": "Bronze", "multiplier": 1.0, "min_days": 0},
                {"name": "Silver", "multiplier": 1.5, "min_days": 7},
                {"name": "Gold", "multiplier": 2.0, "min_days": 30},
                {"name": "Platinum", "multiplier": 3.0, "min_days": 90},
            ]

        tier = get_tier_for_duration(duration_days, tiers)
        points = calculate_points(staked_at, unstaked_at, tier["multiplier"])

        await coll.update_one(
            {"_id": existing["_id"]},
            {"$set": {"status": "unstaked", "unstaked_at": unstaked_at.isoformat(), "points_earned": points}},
        )
        return UnstakeResponse(success=True, status="unstaked", points_earned=points)

    @router.get("/positions", response_model=StakingStats)
    async def get_staking_positions(authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        coll = get_stakes_collection(db)
        tiers_coll = get_tiers_collection(db)

        stakes = await coll.find({"address": address}, {"_id": 0}).to_list(1000)
        
        tiers = await tiers_coll.find({}, {"_id": 0}).to_list(100)
        if not tiers:
            tiers = [
                {"name": "Bronze", "multiplier": 1.0, "min_days": 0},
                {"name": "Silver", "multiplier": 1.5, "min_days": 7},
                {"name": "Gold", "multiplier": 2.0, "min_days": 30},
                {"name": "Platinum", "multiplier": 3.0, "min_days": 90},
            ]

        positions = []
        total_points = 0.0
        total_staked = 0

        for stake in stakes:
            staked_at = datetime.fromisoformat(stake["staked_at"])
            unstaked_at_str = stake.get("unstaked_at")
            
            if stake["status"] == "staked":
                total_staked += 1
                current_time = datetime.now(timezone.utc)
                duration_days = (current_time - staked_at).total_seconds() / 86400
            else:
                if unstaked_at_str:
                    unstaked_at = datetime.fromisoformat(unstaked_at_str)
                    duration_days = (unstaked_at - staked_at).total_seconds() / 86400
                else:
                    duration_days = 0

            tier = get_tier_for_duration(duration_days, tiers)
            points = stake.get("points_earned", 0.0)
            total_points += points

            positions.append(StakingPosition(
                object_id=stake["object_id"],
                staked_at=stake["staked_at"],
                unstaked_at=unstaked_at_str,
                status=stake["status"],
                points_earned=points,
                duration_days=duration_days,
                tier=tier["name"]
            ))

        return StakingStats(total_staked=total_staked, total_points=total_points, positions=positions)

    @router.get("/nfts", response_model=UserNFTsResponse)
    async def get_user_nfts(authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        
        nfts = await get_owned_objects(address, VOXX_TYPE)
        return UserNFTsResponse(nfts=nfts, count=len(nfts))

    return router
