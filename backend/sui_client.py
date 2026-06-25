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
            {"showType": True, "showOwner": True, "showContent": True, "showDisplay": True},
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


async def get_nft_metadata(object_id: str) -> dict:
    obj = await get_object(object_id)
    obj_data = obj.get("data", {})
    display = obj_data.get("display", {}).get("data", {}) or {}
    content = obj_data.get("content", {}).get("fields", {}) or {}

    return {
        "object_id": object_id,
        "type": obj_data.get("type"),
        "owner": obj_data.get("owner"),
        "name": display.get("name") or content.get("name") or f"VOXX #{object_id[-6:]}",
        "description": display.get("description") or content.get("description") or "VOXX Inc. Genesis NFT",
        "image_url": display.get("image_url") or content.get("image_url") or content.get("url"),
        "project_url": display.get("project_url"),
        "attributes": content.get("attributes") or {},
        "raw_content": content,
    }


async def get_owned_objects(address: str, type_filter: str = None) -> list:
    all_objects = []
    cursor = None
    
    while True:
        params = [
            address,
            {
                "filter": {"StructType": type_filter} if type_filter else None,
                "options": {"showType": True, "showOwner": True, "showContent": True, "showDisplay": True}
            }
        ]
        if cursor:
            params.append(cursor)
        
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "suix_getOwnedObjects",
            "params": params,
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(SUI_RPC_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                return all_objects
            result = data.get("result", {})
            all_objects.extend(result.get("data", []))
            
            if not result.get("hasNextPage"):
                break
            cursor = result.get("nextCursor")
            if not cursor:
                break
    
    return all_objects
