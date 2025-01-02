const lobbyScreen = document.getElementById("lobby-screen");
const lobbyList = document.getElementById("lobby-list");


async function fetchLobbies() {
    try {
        const response = await fetch("/lobbies");
        const lobbies = await response.json();
        lobbyList.innerHTML = ""; 

        console.log("Fetched lobbies:", lobbies); 

        lobbies.forEach((lobby) => {
            console.log(`Processing lobby: ${lobby.name}, has_password: ${lobby.has_password}`); 

            const li = document.createElement("li");
            li.className = "lobby-item"; 

            li.innerHTML = `
                <span class="lobby-name">${lobby.name}</span>
                <span class="lobby-status">${lobby.has_password ? "Password Required" : "No Password"}</span>
                <span class="lobby-users">(${lobby.current_users}/${lobby.max_users})</span>
            `;

            const joinButton = document.createElement("button");
            joinButton.textContent = "Join";
            joinButton.onclick = () => joinLobby(lobby.name, lobby.has_password);

            li.appendChild(joinButton);
            lobbyList.appendChild(li);
        });
    } catch (error) {
        console.error("An error occurred while fetching the lobbies:", error);
    }
}


async function createLobby() {
    const username = document.getElementById("username").value.trim();
    const lobbyName = document.getElementById("lobby-name").value.trim();
    const password = document.getElementById("lobby-password").value;
    const maxUsers = parseInt(document.getElementById("lobby-max-users").value, 10) || 0;  

    if (!username || !lobbyName) {
        alert("Please fill in the username and lobby name!");
        return;
    }

    try {
        const response = await fetch("/create_lobby", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: lobbyName, username, password, max_users: maxUsers }),
        });

        const result = await response.json();

        if (result.error) {
            if (result.error.includes("kullanıcı adı")) {
                alert("This username is already in use in another lobby. Please choose a different username.");
            } else {
                alert(`Error: ${result.error}`);
            }
        } else {
            alert("The lobby has been successfully created!");

            const tokenResponse = await fetch("/get_lobby_token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: lobbyName, username, password }),
            });

            const tokenResult = await tokenResponse.json();
            if (tokenResult.token) {
                window.location.href = `/static/whiteboard.html?lobby=${lobbyName}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(tokenResult.token)}`;
            } else {
                alert("An error occurred while retrieving the token!");
            }
        }
    } catch (error) {
        console.error("an error occured when creating lobby", error);
    }
}


async function joinLobby(name, hasPassword) {
    const username = document.getElementById("username").value.trim();
    if (!username) {
        alert("Please enter a username first!");
        return;
    }

    try {
        const checkResponse = await fetch("/get_lobby_token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, username, password: "" }), 
        });

        const checkResult = await checkResponse.json();

        if (checkResult.error) {
            if (checkResult.error.includes("kullanıcı adı")) {
                alert("This username is already in the lobby. Please choose a different username.");
                return; 
            } else if (checkResult.error.includes("Lobi dolu")) {
                alert("This lobby is full. The maximum user limit has been reached.");
                return; 
            } else if (checkResult.error.includes("Lobi bulunamadı")) {
                alert("The lobby couldn't be found. It might have been closed. Please refresh and try again.");
                return;
            } else if (checkResult.error.includes("Şifre gerekli")) {
                let password = "";
                if (hasPassword) {
                    password = prompt("This lobby is password-protected. Please enter the password:");
                    if (password === null) return;
                }

                const tokenResponse = await fetch("/get_lobby_token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, username, password }),
                });

                const tokenResult = await tokenResponse.json();

                if (tokenResult.error) {
                    alert(`Error: ${tokenResult.error}`);
                } else if (tokenResult.token) {
                    alert("You have successfully joined the lobby!");
                    window.location.href = `/static/whiteboard.html?lobby=${name}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(tokenResult.token)}`;
                }
            } else {
                alert(`Hata: ${checkResult.error}`);
            }
        } else if (checkResult.token) {
            alert("You have successfully joined the lobby!");
            window.location.href = `/static/whiteboard.html?lobby=${name}&username=${encodeURIComponent(username)}&token=${encodeURIComponent(checkResult.token)}`;
        }
    } catch (error) {
        console.error("An error occurred when joining lobby:", error);
        alert("An unexpected error occurred. Please try again later.");
    }
}



document.getElementById("refresh-button").addEventListener("click", fetchLobbies);

fetchLobbies();
