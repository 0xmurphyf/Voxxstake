from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

from auth import create_nonce_router
from staking import create_staking_router
from admin import create_admin_router

auth_router = create_nonce_router(db)
staking_router = create_staking_router(db)
admin_router = create_admin_router(db)

api_router.include_router(auth_router)
api_router.include_router(staking_router)
api_router.include_router(admin_router)

@api_router.get("/")
async def root():
    return {"message": "Sui NFT Staking API"}

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "service": "sui-nft-staking"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
