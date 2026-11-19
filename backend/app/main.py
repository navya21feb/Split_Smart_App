from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import Base, engine
from app.routers import auth, groups, bills

settings = get_settings()

_PLACEHOLDER_SECRETS = ("unsafe_default", "replace_with")
if settings.JWT_SECRET_KEY.startswith(_PLACEHOLDER_SECRETS):
    if settings.ENVIRONMENT.lower() == "production":
        raise RuntimeError("JWT_SECRET_KEY is still a placeholder. Set a long random value in .env.")
    print(
        "WARNING: JWT_SECRET_KEY is a placeholder value. Fine for local testing, "
        "but set a long random secret in .env before sharing or deploying."
    )

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="AI-Powered Receipt OCR & Natural Language Expense Splitting API",
)

app.state.limiter = bills.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


app.include_router(auth.router, prefix="/api/v1")
app.include_router(groups.router, prefix="/api/v1")
app.include_router(bills.router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "ai_configured": bool(
            settings.GEMINI_API_KEY
            and settings.GEMINI_API_KEY != "your_google_gemini_api_key_here"
        ),
    }
