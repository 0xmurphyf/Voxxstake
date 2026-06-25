from fastapi import APIRouter, HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel
from typing import List
from auth import decode_token

router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_ADDRESSES = []

class Tier(BaseModel):
    name: str
    multiplier: float
    min_days: float
    apy: float

class TierUpdate(BaseModel):
    tiers: List[Tier]

class TiersResponse(BaseModel):
    tiers: List[Tier]

class AllStakesStats(BaseModel):
    total_users: int
    total_stakes: int
    total_active_stakes: int
    total_points_distributed: float

def get_tiers_collection(db: AsyncIOMotorDatabase):
    return db["tiers"]

def get_stakes_collection(db: AsyncIOMotorDatabase):
    return db["stakes"]

def is_admin(address: str) -> bool:
    return True

def create_admin_router(db: AsyncIOMotorDatabase):
    @router.get("/tiers", response_model=TiersResponse)
    async def get_tiers():
        coll = get_tiers_collection(db)
        tiers = await coll.find({}, {"_id": 0}).to_list(100)
        
        if not tiers:
            tiers = [
                {"name": "Bronze", "multiplier": 1.0, "min_days": 0, "apy": 10.0},
                {"name": "Silver", "multiplier": 1.5, "min_days": 7, "apy": 15.0},
                {"name": "Gold", "multiplier": 2.0, "min_days": 30, "apy": 20.0},
                {"name": "Platinum", "multiplier": 3.0, "min_days": 90, "apy": 30.0},
            ]
        
        return TiersResponse(tiers=[Tier(**t) for t in tiers])

    @router.post("/tiers", response_model=TiersResponse)
    async def update_tiers(body: TierUpdate, authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        
        if not is_admin(address):
            raise HTTPException(status_code=403, detail="Admin access required")

        coll = get_tiers_collection(db)
        await coll.delete_many({})
        
        tier_docs = [tier.model_dump() for tier in body.tiers]
        if tier_docs:
            await coll.insert_many(tier_docs)
        
        return TiersResponse(tiers=body.tiers)

    @router.get("/stats", response_model=AllStakesStats)
    async def get_admin_stats(authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        
        if not is_admin(address):
            raise HTTPException(status_code=403, detail="Admin access required")

        coll = get_stakes_collection(db)
        
        all_stakes = await coll.find({}, {"_id": 0, "address": 1, "status": 1, "points_earned": 1}).to_list(10000)
        
        unique_users = len(set(stake["address"] for stake in all_stakes))
        total_stakes = len(all_stakes)
        active_stakes = len([s for s in all_stakes if s["status"] == "staked"])
        total_points = sum(stake.get("points_earned", 0.0) for stake in all_stakes)

        return AllStakesStats(
            total_users=unique_users,
            total_stakes=total_stakes,
            total_active_stakes=active_stakes,
            total_points_distributed=total_points
        )

    return router
