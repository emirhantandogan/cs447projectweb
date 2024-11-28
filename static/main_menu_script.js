const lobbyScreen = document.getElementById("lobby-screen");
const lobbyList = document.getElementById("lobby-list");

async function fetchLobbies() {
    const response = await fetch("/lobbies");
    const lobbies = await response.json();
    lobbyList.innerHTML = "";
    lobbies.forEach((lobby) => {
        const li = document.createElement("li");
        li.textContent = lobby.name + (lobby.has_password ? " (Şifreli)" : "");
        const joinButton = document.createElement("button");
        joinButton.textContent = "Katıl";
        joinButton.onclick = () => joinLobby(lobby.name, lobby.has_password);
        li.appendChild(joinButton);
        lobbyList.appendChild(li);
    });
}

async function createLobby() {
    const username = document.getElementById("username").value;
    const lobbyName = document.getElementById("lobby-name").value;
    const password = document.getElementById("lobby-password").value;

    const response = await fetch("/create_lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lobbyName, username, password }),
    });
    const result = await response.json();
    if (result.error) {
        alert(result.error);
    } else {
        console.log(lobbyName, username, password);

        alert("Lobi oluşturuldu!");
        fetchLobbies();
    }
}

async function joinLobby(name, hasPassword) {
    const username = document.getElementById("username").value;
    let password = "";
    if (hasPassword) {
        password = prompt("Şifreyi girin:");
    }

    const response = await fetch("/join_lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password }),
    });
    const result = await response.json();
    if (result.error) {
        alert(result.error);
    } else {
        alert("Lobiye katıldınız!");
        // Lobiye giriş mantığını burada ekleyin (ör. beyaz tahtaya yönlendirme)
    }
}

// Sayfa yüklendiğinde mevcut lobileri yükle
fetchLobbies();
