from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel

app = FastAPI(
    title="Planner API",
    description="smart-planner",
    version="1.0.0"
)

