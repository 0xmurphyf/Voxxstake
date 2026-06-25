import httpx
from fastapi import HTTPException
import os

SUI_RPC_URL = os.getenv("SUI_RPC_URL", "https://fullnode.devnet.sui.io:443")
VOXX_TYPE = "0xdca282f30ff2acc0083c5c90969ae97c59a638a6a50ab9112f7ea17507cdd2b7::voxx__inc_::Nft"

async def get_object(object_id: str) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "sui_getObject",
        "params": [
            object_id,
            {"showType": True, "showOwner": True, "showContent": True},
        ],
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(SUI_RPC_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"]["message"])
        return data.get("result", {})

async def verify_voxx_ownership(address: str, object_id: str) -> bool:
    try:
        obj = await get_object(object_id)
        obj_data = obj.get("data", {})
        type_ = obj_data.get("type")
        owner_info = obj_data.get("owner")

        if type_ != VOXX_TYPE:
            return False

        owner_address = None
        if isinstance(owner_info, dict) and "AddressOwner" in owner_info:
            owner_address = owner_info["AddressOwner"]

        return owner_address == address
    except Exception:
        return False

async def get_owned_objects(address: str, type_filter: str = None) -> list:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "suix_getOwnedObjects",
        "params": [
            address,
            {
                "filter": {"StructType": type_filter} if type_filter else None,
                "options": {"showType": True, "showOwner": True, "showContent": True}
            }
        ],
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(SUI_RPC_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return []
        result = data.get("result", {})
        return result.get("data", [])
