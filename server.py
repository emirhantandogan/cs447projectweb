from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List

app = FastAPI()

# CORS izinleri
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Gerekirse belirli bir frontend URL'sini ekleyin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static dosyaları sunmak için middleware
app.mount("/static", StaticFiles(directory="static"), name="static")

# Lobi veri yapısı
lobbies: Dict[str, dict] = {}

@app.get("/lobbies")
def get_lobbies():
    """
    Mevcut lobileri döndür.
    """
    print(lobbies)
    return [{"name": name, "has_password": bool(lobby["password"])} for name, lobby in lobbies.items()]

@app.post("/create_lobby")
def create_lobby(name: str, username: str, password: str = ""):
    """
    Yeni bir lobi oluştur.
    """
    if name in lobbies:
        return {"error": "Lobi zaten mevcut"}
    lobbies[name] = {"users": [username], "password": password, "canvas": []}
    return {"message": "Lobi oluşturuldu", "lobby_name": name}

@app.post("/join_lobby")
def join_lobby(name: str, username: str, password: str = ""):
    """
    Var olan bir lobiye katıl.
    """
    if name not in lobbies:
        return {"error": "Lobi bulunamadı"}
    lobby = lobbies[name]
    if lobby["password"] and lobby["password"] != password:
        return {"error": "Şifre yanlış"}
    if username in lobby["users"]:
        return {"error": "Kullanıcı zaten lobide"}
    lobby["users"].append(username)
    return {"message": "Lobiye katıldınız", "lobby_name": name}

@app.websocket("/ws/{lobby_name}")
async def websocket_endpoint(websocket: WebSocket, lobby_name: str):
    """
    Beyaz tahta WebSocket bağlantısı.
    """
    if lobby_name not in lobbies:
        await websocket.close()
        return

    lobby = lobbies[lobby_name]
    await websocket.accept()
    lobby.setdefault("connections", []).append(websocket)

    # Lobiye bağlanana mevcut canvas durumunu gönder
    for line in lobby["canvas"]:
        await websocket.send_json(line)

    try:
        while True:
            data = await websocket.receive_json()

            # Gelen çizim verisini lobinin canvas'ına kaydet
            lobby["canvas"].append(data)

            # Tüm bağlantılara gönder (Broadcast)
            for connection in lobby["connections"]:
                if connection != websocket:
                    await connection.send_json(data)
    except WebSocketDisconnect:
        # Bağlantı kesildiğinde kullanıcıyı bağlantı listesinden çıkar
        lobby["connections"].remove(websocket)

        # Eğer lobide başka kullanıcı kalmadıysa lobi silinebilir (isteğe bağlı)
        if not lobby["connections"]:
            del lobbies[lobby_name]
