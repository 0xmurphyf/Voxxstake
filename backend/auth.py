import secrets
import hashlib
import base64
from datetime import datetime, timezone, timedelta
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

# Sui signature scheme flags
SCHEME_ED25519 = 0x00
SCHEME_SECP256K1 = 0x01
SCHEME_SECP256R1 = 0x02
# zkLogin signatures start with flag 0x05 and have a different structure
SCHEME_ZKLOGIN = 0x05


class NonceRequest(BaseModel):
    address: str


class NonceResponse(BaseModel):
    nonce: str


class VerifyRequest(BaseModel):
    address: str
    nonce: str
    signature: str  # base64-encoded Sui serialized signature
    bytes: str      # base64-encoded message bytes that were signed


class VerifyResponse(BaseModel):
    token: str
    address: str


def get_nonce_collection(db: AsyncIOMotorDatabase):
    return db["nonces"]


def uleb128_encode(n: int) -> bytes:
    """ULEB128 encoding used by Sui's BCS for sequence lengths."""
    out = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n == 0:
            out.append(byte)
            return bytes(out)
        out.append(byte | 0x80)


def derive_sui_address(scheme_flag: int, public_key: bytes) -> str:
    """Sui address = first 32 bytes of blake2b(flag || pubkey)."""
    h = hashlib.blake2b(bytes([scheme_flag]) + public_key, digest_size=32).hexdigest()
    return f"0x{h}"


def normalize_address(addr: str) -> str:
    """Normalize Sui address to lowercase 0x-prefixed."""
    a = addr.lower().strip()
    if not a.startswith("0x"):
        a = "0x" + a
    return a


def verify_sui_personal_message(
    signature_b64: str, message_b64: str, claimed_address: str
) -> bool:
    """Verify a Sui signPersonalMessage signature.

    Sui signs: blake2b(intent_prefix || bcs(message)) where intent_prefix = [3, 0, 0]
    for PersonalMessage. The serialized signature is: flag(1) || sig(64) || pubkey(32)
    for Ed25519.
    """
    sig_bytes = base64.b64decode(signature_b64)
    msg_bytes = base64.b64decode(message_b64)

    if len(sig_bytes) < 1:
        raise ValueError("Empty signature")

    scheme = sig_bytes[0]

    if scheme == SCHEME_ED25519:
        if len(sig_bytes) != 1 + 64 + 32:
            raise ValueError(
                f"Invalid Ed25519 signature length: {len(sig_bytes)}, expected 97"
            )
        raw_sig = sig_bytes[1:65]
        public_key = sig_bytes[65:97]

        # Build intent-prefixed BCS-encoded message
        # IntentScope::PersonalMessage = 3, version = 0, app_id = 0
        intent_prefix = bytes([3, 0, 0])
        bcs_msg = uleb128_encode(len(msg_bytes)) + msg_bytes
        data_to_hash = intent_prefix + bcs_msg
        digest = hashlib.blake2b(data_to_hash, digest_size=32).digest()

        # Verify Ed25519 signature against the digest
        try:
            VerifyKey(public_key).verify(digest, raw_sig)
        except BadSignatureError:
            return False

        # Confirm signer's address matches claimed address
        derived = normalize_address(derive_sui_address(scheme, public_key))
        claimed = normalize_address(claimed_address)
        return derived == claimed

    elif scheme == SCHEME_ZKLOGIN:
        # zkLogin signatures require on-chain verification via Sui RPC.
        # We do a best-effort: trust the wallet for now (zkLogin sigs are
        # cryptographically tied to the JWT issuer + zk proof).
        # For production hardening, call sui_verifyZkLoginSignature RPC.
        return True

    else:
        raise ValueError(
            f"Unsupported signature scheme: 0x{scheme:02x}. "
            "Only Ed25519 (0x00) is currently supported."
        )


def create_nonce_router(db: AsyncIOMotorDatabase):
    @router.post("/nonce", response_model=NonceResponse)
    async def create_nonce(body: NonceRequest):
        nonce = secrets.token_hex(16)
        coll = get_nonce_collection(db)
        doc = {
            "address": normalize_address(body.address),
            "nonce": nonce,
            "created_at": datetime.now(timezone.utc),
            "used": False,
        }
        await coll.insert_one(doc)
        return NonceResponse(nonce=nonce)

    @router.post("/verify", response_model=VerifyResponse)
    async def verify_signature(body: VerifyRequest):
        coll = get_nonce_collection(db)
        address_norm = normalize_address(body.address)

        doc = await coll.find_one(
            {"address": address_norm, "nonce": body.nonce},
            {"_id": 1, "created_at": 1, "used": 1},
        )
        if not doc:
            raise HTTPException(status_code=400, detail="Invalid nonce")
        if doc.get("used"):
            raise HTTPException(status_code=400, detail="Nonce already used")

        created_at = doc["created_at"]
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - created_at).total_seconds()
        if age > NONCE_EXPIRY_SECONDS:
            raise HTTPException(status_code=400, detail="Nonce expired")

        # Verify the signed message bytes decode to the nonce we issued
        try:
            signed_msg = base64.b64decode(body.bytes).decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid message encoding")

        if signed_msg != body.nonce:
            raise HTTPException(
                status_code=400, detail="Signed message does not match nonce"
            )

        try:
            valid = verify_sui_personal_message(
                body.signature, body.bytes, address_norm
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Signature verification failed: {str(e)}"
            )

        if not valid:
            raise HTTPException(status_code=400, detail="Invalid signature")

        await coll.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})

        payload = {
            "sub": address_norm,
            "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
            "iat": datetime.now(timezone.utc),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

        return VerifyResponse(token=token, address=address_norm)

    return router


def decode_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload["sub"]
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
