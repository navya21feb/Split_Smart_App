# SplitSmart AI

Receipt scanner and shared-expense splitter. Take a photo of a bill, tell the app in plain
English who had what ("Amit and I split the pizza, Priya had the coffee"), and it calculates
each person's share including tax and discount.

- **Backend:** FastAPI + SQLAlchemy + SQLite (Python)
- **Frontend:** React + Vite + Tailwind CSS
- **AI:** Google Gemini (reads receipt photos, understands split instructions)
- **Money math:** done in plain code (`math_engine.py`), never by the AI

## Project structure

```text
SplitSmart_FullStack/
├── .env.example        # copy to .env and fill in
├── docker-compose.yml  # optional Docker launch
├── backend/app/
│   ├── main.py         # entry point: CORS, rate limits, routers
│   ├── config.py       # reads .env from the project root
│   ├── database.py, models.py, schemas.py, security.py
│   ├── routers/        # auth.py, groups.py, bills.py
│   └── services/       # ai_service.py (Gemini), math_engine.py
└── frontend/src/       # main.jsx, App.jsx, api/client.js
```

## Requirements

| Tool | Version | Check with |
|---|---|---|
| Python | 3.11 or 3.12 (avoid 3.13+, some pinned packages may not install) | `python --version` |
| Node.js | 20 LTS or newer | `node --version` |
| Gemini API key | free at https://aistudio.google.com | - |

No database server is needed. SQLite creates `backend/splitsmart.db` automatically on first start.

## Setup (Windows, PowerShell, in VS Code: Terminal > New Terminal)

### 1. Create your `.env` (project root, once)
```powershell
copy .env.example .env
notepad .env
```
Set `GEMINI_API_KEY` to your key and `JWT_SECRET_KEY` to a random value. To generate one:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```
Never share or commit `.env`.

### 2. Backend (Terminal 1)
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Expected: a line saying `Uvicorn running on http://127.0.0.1:8000`.
Always run `uvicorn` from inside the `backend` folder.

### 3. Frontend (Terminal 2, a second terminal)
```powershell
cd frontend
npm install
npm run dev
```
Expected: `Local: http://localhost:5173/`.

### 4. Open and verify
- http://localhost:8000/health should show `"status":"healthy"` and `"ai_configured":true`
- http://localhost:8000/docs lists the API (the Authorize button there does not work, use the app instead)
- http://localhost:5173 is the app: create an account, upload a receipt, assign items, save, check the Ledger tab

macOS/Linux: use `cp .env.example .env` and `source venv/bin/activate`.

## Common problems

| Problem | Fix |
|---|---|
| `venv\Scripts\activate` is blocked | Run `Set-ExecutionPolicy -Scope Process Bypass`, then activate again |
| `python` is not recognized | Reinstall Python and tick "Add python.exe to PATH" |
| `pip install` fails on a package | Check `python --version`; use 3.11 or 3.12 |
| `No module named 'app'` | You ran `uvicorn` outside the `backend` folder |
| `ai_configured` is `false` | `.env` is missing, not in the project root, or the key is still the placeholder. Restart the backend after editing |
| 503 "GEMINI_API_KEY is not configured" | Same as above |
| 502 "AI ... failed" | Read the message: invalid key, quota exceeded, or model unavailable. Check `GEMINI_MODEL` in `.env` |
| Browser shows "Network Error" or CORS error | Backend is not running, or the frontend URL is not in `ALLOWED_ORIGINS` |
| Port already in use | Close the other program, or use `--port 8001` and update `VITE_API_BASE_URL` in `.env` |
| Logged out unexpectedly | Login tokens last 24 hours (`ACCESS_TOKEN_EXPIRE_MINUTES`). Sign in again |
| Voice button says unsupported | Use Chrome or Edge, or type the instruction |
| Reset all data | Stop the backend and delete `backend/splitsmart.db` (deletes all accounts and bills) |

## Docker (optional)
```powershell
copy .env.example .env
docker compose up --build
```
