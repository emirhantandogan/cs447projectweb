const lobbyScreen = document.getElementById("lobby-screen");
const lobbyList = document.getElementById("lobby-list");

// Mevcut lobileri backend'den çekip listeleme
async function fetchLobbies() {
    try {
        const response = await fetch("/lobbies");
        const lobbies = await response.json();
        lobbyList.innerHTML = ""; // Mevcut listeyi temizle

        console.log("Fetched lobbies:", lobbies); // Gelen lobileri logla

        lobbies.forEach((lobby) => {
            console.log(`Processing lobby: ${lobby.name}, has_password: ${lobby.has_password}`); // Her lobi için log

            const li = document.createElement("li");
            li.className = "lobby-item"; // CSS için sınıf ekledik

            // Şifreli/şifresiz durumunu doğru şekilde ekle
            li.innerHTML = `
                <span class="lobby-name">${lobby.name}</span>
                <span class="lobby-status">${lobby.has_password ? "Şifreli" : "Şifresiz"}</span>
            `;

            const joinButton = document.createElement("button");
            joinButton.textContent = "Katıl";
            joinButton.onclick = () => joinLobby(lobby.name, lobby.has_password);

            li.appendChild(joinButton);
            lobbyList.appendChild(li);
        });
    } catch (error) {
        console.error("Lobiler alınırken bir hata oluştu:", error);
    }
}

// Yeni bir lobi oluşturma
async function createLobby() {
    const username = document.getElementById("username").value.trim();
    const lobbyName = document.getElementById("lobby-name").value.trim();
    const password = document.getElementById("lobby-password").value;

    if (!username || !lobbyName) {
        alert("Lütfen kullanıcı adı ve lobi ismini doldurun!");
        return;
    }

    try {
        const response = await fetch("/create_lobby", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: lobbyName, username, password }),
        });

        const result = await response.json();

        if (result.error) {
            alert(`Hata: ${result.error}`);
        } else {
            alert("Lobi başarıyla oluşturuldu!");
            // Kullanıcıyı whiteboard sayfasına yönlendir
            window.location.href = `/static/whiteboard.html?lobby=${lobbyName}`;
        }
    } catch (error) {
        console.error("Lobi oluşturulurken bir hata oluştu:", error);
    }
}

// Lobiye katılma (şifreli/şifresiz)
async function joinLobby(name, hasPassword) {
    const username = document.getElementById("username").value.trim();
    if (!username) {
        alert("Lütfen önce bir kullanıcı adı girin!");
        return;
    }

    let password = "";
    if (hasPassword) {
        password = prompt("Bu lobi şifreli. Lütfen şifreyi girin:");
        if (password === null) return; // Kullanıcı "İptal" derse işlem yapılmasın
    }

    try {
        const response = await fetch("/join_lobby", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, username, password }),
        });
        const result = await response.json();

        if (result.error) {
            alert(`Hata: ${result.error}`);
        } else {
            alert(`Lobiye başarıyla katıldınız: ${name}`);
            // Örneğin beyaz tahtaya yönlendirme yapılabilir:
            window.location.href = `/static/whiteboard.html?lobby=${name}`;
        }
    } catch (error) {
        console.error("Lobiye katılırken bir hata oluştu:", error);
    }
}

// "Yenile" butonunu işlevsel hale getirme
document.getElementById("refresh-button").addEventListener("click", fetchLobbies);

// Sayfa yüklendiğinde mevcut lobileri yükle
fetchLobbies();
