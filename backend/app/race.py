from fastapi import WebSocket, WebSocketDisconnect
import asyncio, random
from typing import Dict

class PlayerState:
    def __init__(self, pid: str, name: str, is_bot: bool=False):
        self.id = pid
        self.name = name
        self.progress = 0
        self.wpm = 0
        self.accuracy = 100
        self.is_bot = is_bot

class Room:
    def __init__(self, code: str):
        self.code = code
        self.players: Dict[str, PlayerState] = {}
        self.sockets: Dict[str, WebSocket] = {}
        self.started = False
        self.countdown = -1
        self.lock = asyncio.Lock()

    def snapshot(self):
        return {
            "code": self.code,
            "started": self.started,
            "countdown": self.countdown,
            "players": [
                {"id": pid, "name": p.name, "progress": p.progress, "wpm": p.wpm, "accuracy": p.accuracy, "is_bot": p.is_bot}
                for pid, p in self.players.items()
            ]
        }

    async def broadcast(self, event: str, data: dict):
        dead = []
        for pid, ws in self.sockets.items():
            try:
                await ws.send_json({"event": event, "data": data})
            except Exception:
                dead.append(pid)
        for pid in dead:
            self.players.pop(pid, None)
            self.sockets.pop(pid, None)

    async def join(self, pid: str, name: str, ws: WebSocket | None, is_bot: bool=False):
        async with self.lock:
            self.players[pid] = PlayerState(pid, name, is_bot=is_bot)
            if ws:
                self.sockets[pid] = ws
        await self.broadcast("room:state", self.snapshot())

    async def leave(self, pid: str):
        async with self.lock:
            self.players.pop(pid, None)
            self.sockets.pop(pid, None)
        await self.broadcast("room:state", self.snapshot())

    async def update(self, pid: str, progress: int, wpm: int, accuracy: int):
        if pid in self.players:
            p = self.players[pid]
            p.progress = max(0, min(100, int(progress)))
            p.wpm = max(0, int(wpm))
            p.accuracy = max(0, min(100, int(accuracy)))
            await self.broadcast("room:state", self.snapshot())
            if p.progress >= 100 and self.started:
                await self.broadcast("room:winner", {"id": pid, "name": p.name})
                self.started = False
                self.countdown = -1

    async def start_countdown(self, seconds: int = 3):
        self.started = False
        for s in range(seconds, 0, -1):
            self.countdown = s
            await self.broadcast("room:state", self.snapshot())
            await asyncio.sleep(1)
        self.countdown = 0
        self.started = True
        await self.broadcast("room:started", {"code": self.code})

class Hub:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create(self, code: str) -> Room:
        if code not in self.rooms:
            self.rooms[code] = Room(code)
        return self.rooms[code]

HUB = Hub()

# ---- Bot logic ----
async def run_bot(room: Room, pid: str, wpm_target: int = 65, error_rate: float = 0.03):
    # Convert WPM to approx progress per second (assuming 100% progress ~ 900 chars typed)
    # We'll simulate percentage increments per tick.
    base_pps = max(0.2, min(2.5, wpm_target / 40.0))  # progress per second
    acc = max(85, int(100 - error_rate * 100))
    while pid in room.players and room.started:
        # human-like jitter
        jitter = random.uniform(0.7, 1.3)
        inc = base_pps * jitter
        p = room.players[pid]
        new_prog = min(100, p.progress + inc)
        new_wpm = max(20, int(wpm_target * random.uniform(0.9, 1.1)))
        await room.update(pid, int(new_prog), new_wpm, acc)
        await asyncio.sleep(random.uniform(0.4, 0.8))
