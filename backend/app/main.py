from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import select, func, desc
from typing import Optional
import asyncio, os, random, string

from .database import Base, engine, get_session
from . import models
from .auth import hash_password, verify_password, create_access_token, decode_token
from .utils import generate_words
from .race import HUB, run_bot

app = FastAPI(title="Typing Racer — Prod Bots", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

Base.metadata.create_all(bind=engine)

def codegen(n=6):
    import random, string
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))

# --------- Auth ---------
@app.post("/api/auth/register")
def register(username: str, email: str, password: str, db: Session = Depends(get_session)):
    if db.scalar(select(models.User).where((models.User.username==username) | (models.User.email==email))):
        raise HTTPException(status_code=400, detail="Username or email exists")
    u = models.User(username=username, email=email, password_hash=hash_password(password))
    db.add(u); db.commit()
    return {"ok": True}

@app.post("/api/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_session)):
    u = db.scalar(select(models.User).where(models.User.username==form.username))
    if not u or not verify_password(form.password, u.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    token = create_access_token(str(u.id))
    return {"access_token": token, "token_type": "bearer"}

@app.get("/api/me")
def me(token: str = Depends(oauth2_scheme), db: Session = Depends(get_session)):
    try:
        payload = decode_token(token); uid = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    u = db.get(models.User, uid)
    return {"id": u.id, "username": u.username, "email": u.email}

# --------- Text & Stats ---------
@app.get("/api/text")
def text(words: int = Query(200, ge=50, le=1200)):
    return {"text": generate_words(words)}

@app.post("/api/tests")
def save_test(wpm: float, accuracy: float, duration_sec: int, chars_typed: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_session)):
    uid = int(decode_token(token).get("sub"))
    t = models.TypingTest(user_id=uid, wpm=wpm, accuracy=accuracy, duration_sec=duration_sec, chars_typed=chars_typed)
    db.add(t); db.commit()
    return {"ok": True}

@app.get("/api/tests/my")
def my_tests(token: str = Depends(oauth2_scheme), db: Session = Depends(get_session)):
    uid = int(decode_token(token).get("sub"))
    rows = db.execute(select(models.TypingTest).where(models.TypingTest.user_id==uid).order_by(desc(models.TypingTest.created_at))).scalars().all()
    return [{"wpm": r.wpm, "accuracy": r.accuracy, "duration_sec": r.duration_sec, "chars_typed": r.chars_typed, "created_at": r.created_at.isoformat()} for r in rows]

@app.get("/api/leaderboard/top")
def leaderboard(limit: int = 20, db: Session = Depends(get_session)):
    subq = select(models.TypingTest.user_id, func.max(models.TypingTest.wpm).label("best_wpm")).group_by(models.TypingTest.user_id).subquery()
    q = select(models.User.username, subq.c.best_wpm).join_from(subq, models.User, models.User.id==subq.c.user_id).order_by(desc(subq.c.best_wpm)).limit(limit)
    rows = db.execute(q).all()
    return [{"username": r[0], "best_wpm": r[1]} for r in rows]

# --------- Races ---------
@app.post("/api/race/create")
def race_create(token: str = Depends(oauth2_scheme), db: Session = Depends(get_session)):
    uid = int(decode_token(token).get("sub"))
    code = codegen(6)
    r = models.Race(race_code=code, created_by=uid, status="waiting")
    db.add(r); db.commit()
    return {"race_code": code}

@app.post("/api/race/start")
async def race_start(race_code: str):
    room = HUB.get_or_create(race_code)
    asyncio.create_task(room.start_countdown(3))
    return {"ok": True}

@app.websocket("/ws/race/{race_code}")
async def ws_race(websocket: WebSocket, race_code: str, token: Optional[str] = None, name: str = "Guest", bots: int = 0, difficulty: str = "medium"):
    await websocket.accept()
    # parse user from token if provided
    try:
        uid = int(decode_token(token).get("sub")) if token else None
    except Exception:
        uid = None
    pid = str(uid or random.randint(100000, 999999))
    room = HUB.get_or_create(race_code)
    await room.join(pid, name, websocket, is_bot=False)
    await websocket.send_json({"event": "text:new", "data": {"text": generate_words(220)}})

    # spawn bots if requested (only once per room start)
    try:
        bnum = int(bots)
    except Exception:
        bnum = 0
    if bnum > 0:
        # Simple difficulty mapping
        if difficulty == "easy":
            wpm_range = (35, 55)
            err = 0.05
        elif difficulty == "hard":
            wpm_range = (70, 110)
            err = 0.02
        else:
            wpm_range = (55, 80)
            err = 0.03
        for i in range(bnum):
            bpid = f"BOT{random.randint(1000,9999)}"
            await room.join(bpid, f"Bot-{i+1}", None, is_bot=True)
            # fire-and-forget coroutine
            async def bot_task(code= race_code, bot_id=bpid, wpm_rng=wpm_range, er=err):
                room_local = HUB.get_or_create(code)
                # wait for start
                while not room_local.started:
                    await asyncio.sleep(0.2)
                await run_bot(room_local, bot_id, wpm_target=random.randint(*wpm_rng), error_rate=er)
            asyncio.create_task(bot_task())

    try:
        while True:
            data = await websocket.receive_json()
            event = data.get("event")
            payload = data.get("data", {})
            if event == "player:update":
                await room.update(pid, payload.get("progress", 0), payload.get("wpm", 0), payload.get("accuracy", 100))
            elif event == "room:start":
                asyncio.create_task(room.start_countdown(int(payload.get("seconds", 3))))
            elif event == "text:more":
                await websocket.send_json({"event": "text:new", "data": {"text": generate_words(160)}})
    except WebSocketDisconnect:
        await room.leave(pid)
    except Exception:
        await room.leave(pid)
        try: await websocket.close()
        except: pass
