import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from nacl.signing import VerifyKey
from nacl.exceptions import BadSignatureError
from pydantic import BaseModel
import jwt
import os

router = APIRouter(prefix="/auth", tags=["auth"])

NONCE_EXPIRY_SECONDS = 300
JWT_SECRET = os.getenv("JWT_SECRET", "sui-nft-staking-secret-key-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 12

class NonceRequest(BaseModel):
    address: str

class NonceResponse(BaseModel):
    nonce: str

class VerifyRequest(BaseModel):
    address: str
    nonce: str
    signature: list[int]
    signedMessage: list[int]
    publicKey: list[int]

class VerifyResponse(BaseModel):
    token: str
    address: str

def get_nonce_collection(db: AsyncIOMotorDatabase):
    return db["nonces"]

def create_nonce_router(db: AsyncIOMotorDatabase):
    @router.post("/nonce", response_model=NonceResponse)
    async def create_nonce(body: NonceRequest):
        nonce = secrets.token_hex(16)
        coll = get_nonce_collection(db)
        doc = {
            "address": body.address,
            "nonce": nonce,
            "created_at": datetime.now(timezone.utc),
            "used": False,
        }
        await coll.insert_one(doc)
        return NonceResponse(nonce=nonce)

    @router.post("/verify", response_model=VerifyResponse)
    async def verify_signature(body: VerifyRequest):
        coll = get_nonce_collection(db)
        doc = await coll.find_one({"address": body.address, "nonce": body.nonce}, {"_id": 1, "created_at": 1, "used": 1})
        if not doc:
            raise HTTPException(status_code=400, detail="Invalid nonce")
        if doc.get("used"):
            raise HTTPException(status_code=400, detail="Nonce already used")

        age = (datetime.now(timezone.utc) - doc["created_at"]).total_seconds()
        if age > NONCE_EXPIRY_SECONDS:
            raise HTTPException(status_code=400, detail="Nonce expired")

        message_bytes = bytes(body.signedMessage)
        signature_bytes = bytes(body.signature)
        public_key_bytes = bytes(body.publicKey)

        try:
            verify_key = VerifyKey(public_key_bytes)
            verify_key.verify(message_bytes, signature_bytes)
        except BadSignatureError:
            raise HTTPException(status_code=400, detail="Invalid signature")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Signature verification failed: {str(e)}")

        await coll.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})

        from datetime import timedelta
        payload = {
            "sub": body.address,
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        return VerifyResponse(token=token, address=body.address)

    return router

def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
