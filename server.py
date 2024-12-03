from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
from pydantic import BaseModel
from passlib.hash import bcrypt
import uuid
import secrets
import json


app = FastAPI()

print("FastAPI uygulaması başlatılıyor...")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

lobbies: Dict[str, dict] = {}
lobby_tokens: Dict[str, str] = {}

# Pydantic Models for Request Data
class LobbyData(BaseModel):
    name: str
    username: str
    password: str = ""

class JoinLobbyData(BaseModel):
    name: str
    username: str
    password: str = ""

@app.get("/lobbies")
def get_lobbies():
    print(f"Mevcut lobiler: {lobbies}")
    return [{"name": name, "has_password": bool(lobby["password"])} for name, lobby in lobbies.items()]

@app.post("/create_lobby")
def create_lobby(data: LobbyData):
    if not data.name or not data.username:
        return {"error": "Lobi adı ve kullanıcı adı boş olamaz"}

    if data.name in lobbies:
        return {"error": "Lobi zaten mevcut"}

    # Aynı kullanıcı adını kontrol et
    for lobby in lobbies.values():
        if data.username in lobby["users"]:
            return {"error": "Bu kullanıcı adı zaten başka bir lobide mevcut. Lütfen başka bir kullanıcı adı seçin."}

    hashed_password = bcrypt.hash(data.password) if data.password else ""
    lobbies[data.name] = {
        "users": [data.username],
        "password": hashed_password,
        "canvas": [],
        "redo_stack": [],
        "connections": []
    }
    print(f"Lobi oluşturuldu: {data.name}")
    return {"message": "Lobi oluşturuldu", "lobby_name": data.name}

@app.post("/get_lobby_token")
def get_lobby_token(data: JoinLobbyData):
    if data.name not in lobbies:
        return {"error": "Lobi bulunamadı"}

    lobby = lobbies[data.name]

    # Kullanıcı adı kontrolü
    if any(connection["username"] == data.username for connection in lobby["connections"]):
        return {"error": "Bu kullanıcı adı zaten lobide mevcut."}

    # Şifre doğrulaması
    if lobby["password"]:
        if not data.password:  # Şifre boşsa hemen hata döndür
            return {"error": "Şifre gerekli"}
        if not bcrypt.verify(data.password, lobby["password"]):
            return {"error": "Şifre yanlış"}

    # Token oluştur ve kaydet
    token = secrets.token_urlsafe(16)
    lobby_tokens[token] = data.name
    return {"token": token}

async def broadcast_user_list(lobby_name: str):
    """Lobideki tüm kullanıcılara kullanıcı listesini gönderir."""
    lobby = lobbies[lobby_name]
    users = [connection["username"] for connection in lobby["connections"]]
    print(f"Lobi '{lobby_name}' için kullanıcı listesi gönderiliyor: {users}")  # Debug log
    for connection in lobby["connections"]:
        try:
            await connection["websocket"].send_json({"type": "users", "users": users})
            print(f"Kullanıcı listesi gönderildi: {connection['username']}")  # Debug log
        except Exception as e:
            print(f"Hata: Kullanıcı listesi gönderilemedi: {connection['username']}, Hata: {e}")


@app.websocket("/ws/{lobby_name}")
async def websocket_endpoint(websocket: WebSocket, lobby_name: str):
    if lobby_name not in lobbies:
        await websocket.close(code=403)
        print(f"Hata: Lobi bulunamadı: {lobby_name}")
        return

    query_params = websocket.query_params
    token = query_params.get("token", "")
    username = query_params.get("username", "")
    session_id = query_params.get("session_id", str(uuid.uuid4()))

    if not username:
        await websocket.close(code=403)
        print(f"Hata: Eksik kullanıcı adı: {lobby_name}")
        return

    lobby = lobbies[lobby_name]

    # Aynı kullanıcı adı varsa yeni girişe izin verme
    for connection in lobby["connections"]:
        if connection["username"] == username:
            await websocket.close(code=403)
            print(f"Hata: Kullanıcı adı zaten kullanılıyor: {username}")
            return

    await websocket.accept()
    lobby["users"].append(username)
    lobby["connections"].append({"username": username, "websocket": websocket, "session_id": session_id})
    print(f"WebSocket bağlantısı kabul edildi: {lobby_name} - Kullanıcı: {username} - Session ID: {session_id}")

    # Kullanıcı listesi tüm kullanıcılara gönderilir
    await broadcast_user_list(lobby_name)

    # Mevcut çizim geçmişini yeni bağlanan kullanıcıya gönder
    for line in lobby["canvas"]:
        await websocket.send_json(line)

    try:
        while True:
            # WebSocket mesajını alırken kontrol et ve hata yönetimi yap
            try:
                data = await websocket.receive_text()
                if not data.strip():
                    continue  # Boş mesajları yok say
                data_json = json.loads(data)
            except json.JSONDecodeError:
                print(f"Hata: Geçersiz JSON verisi alındı: {data}")
                continue

            print(f"Gelen çizim verisi: {data_json}")

            if data_json["type"] == "clear":
                lobby["canvas"] = []
                lobby["redo_stack"] = []
            elif data_json["type"] == "undo":
                if lobby["canvas"]:
                    last_action = lobby["canvas"].pop()
                    lobby["redo_stack"].append(last_action)
            elif data_json["type"] == "redo":
                if lobby["redo_stack"]:
                    redo_action = lobby["redo_stack"].pop()
                    lobby["canvas"].append(redo_action)
                    for connection in lobby["connections"]:
                        if connection["websocket"] != websocket:
                            await connection["websocket"].send_json(redo_action)
            else:
                lobby["redo_stack"] = []
                lobby["canvas"].append(data_json)

            for connection in lobby["connections"]:
                if connection["websocket"] != websocket:
                    await connection["websocket"].send_json(data_json)

    except WebSocketDisconnect:
        print(f"WebSocket bağlantısı kesildi: {lobby_name} - Kullanıcı: {username}")
        lobby["connections"] = [
            conn for conn in lobby["connections"] if conn["websocket"] != websocket
        ]
        if username in lobby["users"]:
            lobby["users"].remove(username)

        # Kullanıcı listesi güncellenir
        await broadcast_user_list(lobby_name)

        if not lobby["connections"]:
            print(f"Lobi siliniyor: {lobby_name}")
            del lobbies[lobby_name]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)


# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

#http://10.200.42.130:8000/static/index.html
#http://127.0.0.1:8000/static/index.html

