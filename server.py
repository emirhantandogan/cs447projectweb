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

print("FastAPI application is starting...")

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
    max_users: int = 0

class JoinLobbyData(BaseModel):
    name: str
    username: str
    password: str = ""

@app.get("/lobbies")
def get_lobbies():
    print(f"Current lobbies: {lobbies}")
    return [{
        "name": name,
        "has_password": bool(lobby["password"]),
        "current_users": len(lobby["connections"]),
        "max_users": lobby["max_users"] if lobby["max_users"] > 0 else "Unlimited"
    } for name, lobby in lobbies.items()]

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
        "connections": [],
        "max_users": data.max_users
    }
    print(f"Lobby is created: {data.name}")
    return {"message": "Lobi oluşturuldu", "lobby_name": data.name}

@app.post("/get_lobby_token")
def get_lobby_token(data: JoinLobbyData):
    if data.name not in lobbies:
        return {"error": "Lobi bulunamadı"}

    lobby = lobbies[data.name]

    # Kullanıcı limiti kontrolü
    if lobby["max_users"] > 0 and len(lobby["connections"]) >= lobby["max_users"]:
        return {"error": "Lobi dolu. Maksimum kullanıcı limitine ulaşıldı."}

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
    lobby_tokens[token] = {"lobby_name": data.name, "username": data.username}
    return {"token": token}



async def broadcast_user_list(lobby_name: str):
    """Lobideki tüm kullanıcılara kullanıcı listesini gönderir."""
    lobby = lobbies[lobby_name]
    users = [connection["username"] for connection in lobby["connections"]]
    print(f"Lobby '{lobby_name}' is sending user list for: {users}")  # Debug log
    for connection in lobby["connections"]:
        try:
            await connection["websocket"].send_json({"type": "users", "users": users})
            print(f"User list sent: {connection['username']}")  # Debug log
        except Exception as e:
            print(f"Error: Failed to send user list: {connection['username']}, Hata: {e}")


@app.websocket("/ws/{lobby_name}")
async def websocket_endpoint(websocket: WebSocket, lobby_name: str):
    if lobby_name not in lobbies:
        await websocket.close(code=403)
        print(f"Error: Lobby couldn't found: {lobby_name}")
        return

    query_params = websocket.query_params
    token = query_params.get("token", "")
    username = query_params.get("username", "")
    session_id = query_params.get("session_id", str(uuid.uuid4()))

    if not username:
        await websocket.close(code=403)
        print(f"Error: username is missing: {lobby_name}")
        return

    # Token doğrulaması
    if token not in lobby_tokens:
        await websocket.close(code=403)
        print(f"Error: invalid token: {token}")
        return

    token_data = lobby_tokens[token]
    if token_data["lobby_name"] != lobby_name or token_data["username"] != username:
        await websocket.close(code=403)
        print(f"Error: wrong token: {token_data}")
        return

    lobby = lobbies[lobby_name]

    # Maksimum kullanıcı limitine ulaşıldıysa bağlantıya izin verme
    if lobby["max_users"] > 0 and len(lobby["connections"]) >= lobby["max_users"]:
        await websocket.close(code=403)
        print(f"Error: lobby is full: {lobby_name}")
        return

    # Aynı kullanıcı adı varsa yeni girişe izin verme
    for connection in lobby["connections"]:
        if connection["username"] == username:
            await websocket.close(code=403)
            print(f"Error: Username is already in use: {username}")
            return

    await websocket.accept()
    lobby["users"].append(username)
    lobby["connections"].append({"username": username, "websocket": websocket, "session_id": session_id})
    print(f"WebSocket connection is accepted: {lobby_name} - Username: {username} - Session ID: {session_id}")

    # Kullanıcı listesi tüm kullanıcılara gönderilir
    await broadcast_user_list(lobby_name)

    # Mevcut çizim geçmişini yeni bağlanan kullanıcıya gönder
    for line in lobby["canvas"]:
        await websocket.send_json(line)

    try:
        while True:
            try:
                data = await websocket.receive_text()
                if not data.strip():
                    continue  # Boş mesajları yok say
                data_json = json.loads(data)
            except json.JSONDecodeError:
                print(f"Error: Invalid JSON data received: {data}")
                continue

            # Gelen çizim verisine username'i ekleyelim
            data_json["username"] = username
            print(f"Incoming drawing data: {data_json}")

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
                # Her 100 ms'de gelen çizim verilerini ayrı olarak canvas'a ekliyoruz
                lobby["canvas"].append(data_json)

            for connection in lobby["connections"]:
                if connection["websocket"] != websocket:
                    await connection["websocket"].send_json(data_json)

    except WebSocketDisconnect:
        print(f"WebSocket connection is closed: {lobby_name} - Kullanıcı: {username}")
        lobby["connections"] = [
            conn for conn in lobby["connections"] if conn["websocket"] != websocket
        ]
        if username in lobby["users"]:
            lobby["users"].remove(username)

        # Tokenı temizle
        for tok, data in list(lobby_tokens.items()):
            if data["username"] == username and data["lobby_name"] == lobby_name:
                del lobby_tokens[tok]

        # Kullanıcı listesi güncellenir
        await broadcast_user_list(lobby_name)

        if not lobby["connections"]:
            print(f"Lobby is being deleted: {lobby_name}")
            del lobbies[lobby_name]



if __name__ == "__main__":
    import uvicorn
    #uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True) #localde test ederken bunun commentini kaldır.
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True) #aws ye gönderirken bunun commentini kaldır.

#bu linklerden ulaşabilirsin:
#http://10.200.42.130:8000/static/index.html
#http://127.0.0.1:8000/static/index.html

