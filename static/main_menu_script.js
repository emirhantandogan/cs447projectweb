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
            if (result.error.includes("kullanıcı adı")) {
                alert("Bu kullanıcı adı zaten başka bir lobide mevcut. Lütfen başka bir kullanıcı adı seçin.");
            } else {
                alert(`Hata: ${result.error}`);
            }
        } else {
            alert("Lobi başarıyla oluşturuldu!");

            // Token al ve whiteboard ekranına yönlendir
            const tokenResponse = await fetch("/get_lobby_token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: lobbyName, username, password }),
            });

            const tokenResult = await tokenResponse.json();
            if (tokenResult.token) {
                window.location.href = `/static/whiteboard.html?lobby=${lobbyName}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(tokenResult.token)}`;
            } else {
                alert("Token alınırken bir hata oluştu!");
            }
        }
    } catch (error) {
        console.error("Lobi oluşturulurken bir hata oluştu:", error);
    }
}

// Bir lobiye katılma
async function joinLobby(name, hasPassword) {
    const username = document.getElementById("username").value.trim();
    if (!username) {
        alert("Lütfen önce bir kullanıcı adı girin!");
        return;
    }

    try {
        // Kullanıcı adı kontrolü ve token isteği
        const checkResponse = await fetch("/get_lobby_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, username, password: "" }), // Şifreyi boş gönderiyoruz
        });

        const checkResult = await checkResponse.json();

        if (checkResult.error) {
            if (checkResult.error.includes("kullanıcı adı")) {
                alert("Bu kullanıcı adı zaten lobide mevcut. Lütfen başka bir kullanıcı adı seçin.");
                return; // Şifre ekranına geçmeden işlemi sonlandırıyoruz
            } else if (checkResult.error.includes("Şifre gerekli")) {
                // Kullanıcı adı geçerli, şifre ekranına geçiyoruz
                let password = "";
                if (hasPassword) {
                    password = prompt("Bu lobi şifreli. Lütfen şifreyi girin:");
                    if (password === null) return; // Kullanıcı "İptal" derse işlem yapılmasın
                }

                // Şifre doğrulama
                const tokenResponse = await fetch("/get_lobby_token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, username, password }),
                });

                const tokenResult = await tokenResponse.json();

                if (tokenResult.error) {
                    alert(`Hata: ${tokenResult.error}`);
                } else if (tokenResult.token) {
                    alert("Lobiye başarıyla katıldınız!");
                    window.location.href = `/static/whiteboard.html?lobby=${name}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(tokenResult.token)}`;
                }
            } else {
                alert(`Hata: ${checkResult.error}`);
            }
        } else if (checkResult.token) {
            // Kullanıcı adı uygunsa ve şifre gerekmezse direkt yönlendir
            alert("Lobiye başarıyla katıldınız!");
            window.location.href = `/static/whiteboard.html?lobby=${name}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(checkResult.token)}`;
        }
    } catch (error) {
        console.error("Lobiye katılırken bir hata oluştu:", error);
    }
}

// "Yenile" butonunu işlevsel hale getirme
document.getElementById("refresh-button").addEventListener("click", fetchLobbies);

// Sayfa yüklendiğinde mevcut lobileri yükle
fetchLobbies();
