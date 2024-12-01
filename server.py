from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
from pydantic import BaseModel

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
    print(f"Gelen veri: {data}")
    if not data.name or not data.username:
        return {"error": "Lobi adı ve kullanıcı adı boş olamaz"}

    if data.name in lobbies:
        return {"error": "Lobi zaten mevcut"}
    lobbies[data.name] = {"users": [data.username], "password": data.password, "canvas": [], "redo_stack": []}
    print(f"Güncel lobiler: {lobbies}")
    return {"message": "Lobi oluşturuldu", "lobby_name": data.name}

@app.post("/join_lobby")
def join_lobby(data: JoinLobbyData):
    name = data.name
    username = data.username
    password = data.password

    if name not in lobbies:
        print(f"Hata: Lobi bulunamadı: {name}")
        return {"error": "Lobi bulunamadı"}
    lobby = lobbies[name]
    if lobby["password"] and lobby["password"] != password:
        print(f"Hata: Yanlış şifre ile giriş denemesi: {name}")
        return {"error": "Şifre yanlış"}
    if username in lobby["users"]:
        print(f"Hata: Kullanıcı zaten lobide: {username}")
        return {"error": "Kullanıcı zaten lobide"}
    print(f"Lobiye bağlanıldı: {name} - Kullanıcı: {username}")
    lobby["users"].append(username)
    return {"message": "Lobiye katıldınız", "lobby_name": name}

@app.websocket("/ws/{lobby_name}")
async def websocket_endpoint(websocket: WebSocket, lobby_name: str):
    if lobby_name not in lobbies:
        await websocket.close(code=403)
        print(f"Hata: WebSocket bağlantısı başarısız oldu, lobi bulunamadı: {lobby_name}")
        return

    lobby = lobbies[lobby_name]
    await websocket.accept()
    print(f"WebSocket bağlantısı kabul edildi: {lobby_name}")
    lobby.setdefault("connections", []).append(websocket)

    for line in lobby["canvas"]:
        await websocket.send_json(line)

    try:
        while True:
            data = await websocket.receive_json()
            print(f"Gelen çizim verisi: {data}")

            if data["type"] == "clear":
                lobby["canvas"] = []
                lobby["redo_stack"] = []
            elif data["type"] == "undo":
                if lobby["canvas"]:
                    last_action = lobby["canvas"].pop()
                    lobby["redo_stack"].append(last_action)
            elif data["type"] == "redo":
                if lobby["redo_stack"]:
                    redo_action = lobby["redo_stack"].pop()
                    lobby["canvas"].append(redo_action)
                    # Redo edilen şekli diğer kullanıcılara gönder
                    for connection in lobby["connections"]:
                        if connection != websocket:
                            await connection.send_json(redo_action)
            else:
                # Yeni bir çizim geldiğinde redo_stack sıfırlanır
                lobby["redo_stack"] = []
                lobby["canvas"].append(data)

            # Tüm kullanıcılara mesajı ilet
            for connection in lobby["connections"]:
                if connection != websocket:
                    await connection.send_json(data)
    except WebSocketDisconnect:
        print(f"WebSocket bağlantısı kesildi: {lobby_name}")
        lobby["connections"].remove(websocket)
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

