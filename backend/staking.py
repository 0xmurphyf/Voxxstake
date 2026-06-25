from fastapi import APIRouter, HTTPException, Header
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional, List
from auth import decode_token
from sui_client import get_owned_objects, get_nft_metadata, VOXX_TYPE

router = APIRouter(prefix="/staking", tags=["staking"])

BASE_POINTS_PER_DAY = 10.0

# Field projection for stakes queries (smaller payload)
STAKE_PROJECTION = {
    "_id": 0,
    "address": 1,
    "object_id": 1,
    "status": 1,
    "total_staked_seconds": 1,
    "current_session_start": 1,
    "name": 1,
    "image_url": 1,
    "created_at": 1,
    "last_synced": 1,
}


class StakingPosition(BaseModel):
    object_id: str
    name: Optional[str] = None
    image_url: Optional[str] = None
    created_at: Optional[str] = None
    total_staked_seconds: float
    current_session_start: Optional[str] = None
    status: str
    lore_points: float
    duration_days: float
    tier: str
    is_owned: bool


class StakingStats(BaseModel):
    total_active: int
    total_paused: int
    total_lore_points: float
    positions: List[StakingPosition]
    sell_alerts: List[str]


def get_stakes_collection(db: AsyncIOMotorDatabase):
    return db["stakes"]


def get_tiers_collection(db: AsyncIOMotorDatabase):
    return db["tiers"]


def default_tiers():
    return [
        {"name": "Bronze", "multiplier": 1.0, "min_days": 0},
        {"name": "Silver", "multiplier": 1.5, "min_days": 7},
        {"name": "Gold", "multiplier": 2.0, "min_days": 30},
        {"name": "Platinum", "multiplier": 3.0, "min_days": 90},
    ]


def get_tier_for_duration(duration_days: float, tiers: list) -> dict:
    sorted_tiers = sorted(tiers, key=lambda x: x["min_days"], reverse=True)
    for tier in sorted_tiers:
        if duration_days >= tier["min_days"]:
            return tier
    return sorted_tiers[-1] if sorted_tiers else default_tiers()[0]


def compute_total_active_seconds(stake: dict, now: datetime) -> float:
    total = stake.get("total_staked_seconds", 0.0)
    if stake.get("status") == "active" and stake.get("current_session_start"):
        session_start = datetime.fromisoformat(stake["current_session_start"])
        total += max(0.0, (now - session_start).total_seconds())
    return total


def compute_points(total_active_seconds: float, tiers: list) -> tuple:
    duration_days = total_active_seconds / 86400
    tier = get_tier_for_duration(duration_days, tiers)
    points = duration_days * BASE_POINTS_PER_DAY * tier["multiplier"]
    return points, duration_days, tier


def _build_position_from_stake(stake: dict, tiers: list, owned_set: Optional[set]) -> StakingPosition:
    now = datetime.now(timezone.utc)
    total_active_seconds = compute_total_active_seconds(stake, now)
    points, duration_days, tier = compute_points(total_active_seconds, tiers)
    return StakingPosition(
        object_id=stake["object_id"],
        name=stake.get("name"),
        image_url=stake.get("image_url"),
        created_at=stake.get("created_at"),
        total_staked_seconds=total_active_seconds,
        current_session_start=stake.get("current_session_start"),
        status=stake.get("status", "paused"),
        lore_points=points,
        duration_days=duration_days,
        tier=tier["name"],
        is_owned=(stake["object_id"] in owned_set) if owned_set is not None else (stake.get("status") == "active"),
    )


async def _build_from_db(db, address: str) -> StakingStats:
    """FAST: read DB-only, no RPC. Returns last-known state."""
    coll = get_stakes_collection(db)
    tiers_coll = get_tiers_collection(db)

    tiers = await tiers_coll.find({}, {"_id": 0}).limit(20).to_list(20)
    if not tiers:
        tiers = default_tiers()

    stakes = await coll.find({"address": address}, STAKE_PROJECTION).limit(500).to_list(500)

    positions = [_build_position_from_stake(s, tiers, None) for s in stakes]
    positions.sort(key=lambda p: (0 if p.status == "active" else 1, -p.lore_points))

    active_count = sum(1 for p in positions if p.status == "active")
    paused_count = len(positions) - active_count
    total_points = sum(p.lore_points for p in positions)

    return StakingStats(
        total_active=active_count,
        total_paused=paused_count,
        total_lore_points=total_points,
        positions=positions,
        sell_alerts=[],
    )


async def _sync_user_stakes(db, address: str) -> StakingStats:
    """SLOW: full RPC + DB sync. Returns updated positions and sell alerts."""
    coll = get_stakes_collection(db)
    tiers_coll = get_tiers_collection(db)
    now = datetime.now(timezone.utc)

    tiers = await tiers_coll.find({}, {"_id": 0}).limit(20).to_list(20)
    if not tiers:
        tiers = default_tiers()

    # Lite RPC payload: only showType + showDisplay
    owned_nfts = await get_owned_objects(address, VOXX_TYPE, lite=True)
    owned_map = {}
    for nft in owned_nfts:
        obj_data = nft.get("data", {})
        obj_id = obj_data.get("objectId")
        if not obj_id:
            continue
        display = (obj_data.get("display") or {}).get("data") or {}
        owned_map[obj_id] = {
            "name": display.get("name") or f"VOXX #{obj_id[-6:]}",
            "image_url": display.get("image_url"),
        }

    existing_stakes = await coll.find({"address": address}).limit(500).to_list(500)
    existing_map = {s["object_id"]: s for s in existing_stakes}

    sell_alerts = []

    # 1) For each owned NFT: ensure active stake
    for obj_id, meta in owned_map.items():
        if obj_id in existing_map:
            stake = existing_map[obj_id]
            if stake.get("status") == "paused":
                await coll.update_one(
                    {"_id": stake["_id"]},
                    {"$set": {
                        "status": "active",
                        "current_session_start": now.isoformat(),
                        "name": meta["name"],
                        "image_url": meta["image_url"],
                        "last_synced": now.isoformat(),
                    }},
                )
            else:
                await coll.update_one(
                    {"_id": stake["_id"]},
                    {"$set": {
                        "name": meta["name"],
                        "image_url": meta["image_url"],
                        "last_synced": now.isoformat(),
                    }},
                )
        else:
            new_stake = {
                "address": address,
                "object_id": obj_id,
                "name": meta["name"],
                "image_url": meta["image_url"],
                "created_at": now.isoformat(),
                "total_staked_seconds": 0.0,
                "current_session_start": now.isoformat(),
                "status": "active",
                "last_synced": now.isoformat(),
            }
            await coll.insert_one(new_stake)

    # 2) Pause stakes for NFTs no longer in wallet
    for obj_id, stake in existing_map.items():
        if obj_id not in owned_map and stake.get("status") == "active":
            session_start_str = stake.get("current_session_start")
            session_seconds = 0.0
            if session_start_str:
                session_start = datetime.fromisoformat(session_start_str)
                session_seconds = max(0.0, (now - session_start).total_seconds())
            new_total = stake.get("total_staked_seconds", 0.0) + session_seconds
            await coll.update_one(
                {"_id": stake["_id"]},
                {"$set": {
                    "status": "paused",
                    "current_session_start": None,
                    "total_staked_seconds": new_total,
                    "last_synced": now.isoformat(),
                }},
            )
            sell_alerts.append(stake.get("name") or f"VOXX #{obj_id[-6:]}")

    # 3) Build response from fresh DB state
    fresh_stakes = await coll.find({"address": address}, STAKE_PROJECTION).limit(500).to_list(500)
    owned_set = set(owned_map.keys())
    positions = [_build_position_from_stake(s, tiers, owned_set) for s in fresh_stakes]
    positions.sort(key=lambda p: (0 if p.status == "active" else 1, -p.lore_points))

    active_count = sum(1 for p in positions if p.status == "active")
    paused_count = len(positions) - active_count
    total_points = sum(p.lore_points for p in positions)

    return StakingStats(
        total_active=active_count,
        total_paused=paused_count,
        total_lore_points=total_points,
        positions=positions,
        sell_alerts=sell_alerts,
    )


def create_staking_router(db: AsyncIOMotorDatabase):
    @router.get("/cached", response_model=StakingStats)
    async def get_cached_positions(authorization: str = Header(None)):
        """FAST endpoint — DB-only, no RPC. Use for instant UI on page load."""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        return await _build_from_db(db, address)

    @router.post("/sync", response_model=StakingStats)
    async def sync_stakes(authorization: str = Header(None)):
        """SLOW endpoint — full RPC sync. Call in background after /cached."""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        return await _sync_user_stakes(db, address)

    @router.get("/positions", response_model=StakingStats)
    async def get_staking_positions(authorization: str = Header(None)):
        """Backward-compat: same as /sync."""
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)
        return await _sync_user_stakes(db, address)

    @router.get("/nft/{object_id}")
    async def get_nft_detail(object_id: str, authorization: str = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
        token = authorization.replace("Bearer ", "")
        address = decode_token(token)

        metadata = await get_nft_metadata(object_id)

        coll = get_stakes_collection(db)
        tiers_coll = get_tiers_collection(db)
        stake = await coll.find_one(
            {"address": address, "object_id": object_id}, STAKE_PROJECTION
        )

        tiers = await tiers_coll.find({}, {"_id": 0}).limit(20).to_list(20)
        if not tiers:
            tiers = default_tiers()

        position = None
        if stake:
            now = datetime.now(timezone.utc)
            total_active_seconds = compute_total_active_seconds(stake, now)
            points, duration_days, tier = compute_points(total_active_seconds, tiers)
            position = {
                "status": stake.get("status"),
                "lore_points": points,
                "duration_days": duration_days,
                "tier": tier["name"],
                "tier_multiplier": tier["multiplier"],
                "created_at": stake.get("created_at"),
                "current_session_start": stake.get("current_session_start"),
            }

        return {"metadata": metadata, "position": position}

    return router
