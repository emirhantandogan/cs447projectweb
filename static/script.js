// script.js dosyasındaki gerekli düzenleme:

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let mode = 'draw';
let startX, startY;
let shapes = [];
let redoStack = [];
let currentPath = [];
let currentColor = '#000000'; // Varsayılan çizim rengi
let currentLineWidth = 2; // Varsayılan çizgi kalınlığı

// URL'deki query parametrelerini ayrıştır
const params = new URLSearchParams(window.location.search);
const lobbyName = params.get('lobby');
const username = params.get('username');
const token = params.get('token'); // Token alınıyor
console.log(`Query Params: lobby=${lobbyName}, username=${username}, token=${token}`);

// Kullanıcı listesi için DOM öğesi
const userListElement = document.getElementById('user-list');

// Benzersiz oturum kimliği oluştur
const sessionId = generateSessionId();

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15); // Basit bir benzersiz ID
}

// WebSocket bağlantısı kur
if (!lobbyName || !username || !token) {
    alert("Lobi, kullanıcı adı veya token eksik!");
    window.location.href = "/static/index.html"; // Ana sayfaya yönlendir
}

const socket = new WebSocket(`ws://${window.location.host}/ws/${lobbyName}?token=${encodeURIComponent(token)}&username=${encodeURIComponent(username)}&session_id=${sessionId}`);

// WebSocket olayları
socket.onopen = () => {
    console.log("WebSocket bağlantısı açıldı.");
    // Kullanıcı adıyla bağlantı bilgisi gönder
    socket.send(JSON.stringify({ type: "join", username }));
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("WebSocket mesajı alındı:", data); // Debug log

    if (data.type === 'users') {
        console.log("Kullanıcı listesi alındı:", data.users); // Kullanıcı listesini logla
        updateUserList(data.users);
    } else if (data.type === 'path' || data.type === 'line' || data.type === 'rectangle' || data.type === 'circle' || data.type === 'triangle') {
        shapes.push(data);
        redrawShapes();
    } else if (data.type === 'undo') {
        if (shapes.length > 0) {
            redoStack.push(shapes.pop());
            redrawShapes();
        }
    } else if (data.type === 'redo') {
        if (data.shape) {
            shapes.push(data.shape);
            redrawShapes();
        }
    } else if (data.type === 'clear') {
        shapes = [];
        redoStack = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
};

socket.onclose = () => {
    console.log("WebSocket bağlantısı kapandı.");
    alert("Soket bağlantısı kapatıldı. Lobiye erişim başarısız.");
    window.location.href = "/static/index.html"; // Ana menüye yönlendir
};

socket.onerror = (error) => {
    console.error("WebSocket hatası:", error);
    alert("Soket bağlantısında bir hata oluştu. Ana menüye yönlendiriliyorsunuz.");
    window.location.href = "/static/index.html"; // Ana menüye yönlendir
};

// Çizim verilerini WebSocket ile gönderme
function sendDrawing(data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

// Kullanıcı listesini güncelle
function updateUserList(users) {
    userListElement.innerHTML = ""; // Mevcut listeyi temizle
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        userListElement.appendChild(li);
    });
}

// Mod değiştirme
function setMode(selectedMode) {
    mode = selectedMode;
}

// Renk ve çizgi kalınlığı değiştirme
function changeColor(color) {
    currentColor = color; // Sadece mevcut client'ın rengini değiştiriyoruz
}

function changeLineWidth(width) {
    currentLineWidth = width; // Sadece mevcut client'ın çizgi kalınlığını değiştiriyoruz
}

// Çizimleri yeniden çiz
function redrawShapes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach(shape => {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.lineWidth;

        if (shape.type === 'path') {
            ctx.beginPath();
            shape.path.forEach((point, index) => {
                if (index === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            });
            ctx.stroke();
        } else if (shape.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(shape.startX, shape.startY);
            ctx.lineTo(shape.endX, shape.endY);
            ctx.stroke();
        } else if (shape.type === 'rectangle') {
            ctx.strokeRect(shape.startX, shape.startY, shape.width, shape.height);
        } else if (shape.type === 'circle') {
            ctx.beginPath();
            ctx.arc(shape.startX, shape.startY, shape.radius, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (shape.type === 'triangle') {
            ctx.beginPath();
            ctx.moveTo(shape.startX, shape.startY);
            ctx.lineTo(shape.startX + shape.width / 2, shape.startY + shape.height);
            ctx.lineTo(shape.startX - shape.width / 2, shape.startY + shape.height);
            ctx.closePath();
            ctx.stroke();
        }
    });
}

// Çizim olayları
canvas.addEventListener('mousedown', e => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;

    if (mode === 'draw') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        currentPath = [{ x: startX, y: startY }];
    }
});

canvas.addEventListener('mousemove', e => {
    if (!drawing) return;

    const x = e.offsetX;
    const y = e.offsetY;

    if (mode === 'draw') {
        ctx.lineTo(x, y);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;
        ctx.stroke();
        currentPath.push({ x, y });
    } else {
        redrawShapes();

        const width = x - startX;
        const height = y - startY;

        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentLineWidth;

        if (mode === 'line') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(x, y);
            ctx.stroke();
        } else if (mode === 'rectangle') {
            ctx.strokeRect(startX, startY, width, height);
        } else if (mode === 'circle') {
            const radius = Math.sqrt(width * width + height * height);
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (mode === 'triangle') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + width / 2, startY + height);
            ctx.lineTo(startX - width / 2, startY + height);
            ctx.closePath();
            ctx.stroke();
        }
    }
});

canvas.addEventListener('mouseup', e => {
    if (!drawing) return;
    drawing = false;

    const width = e.offsetX - startX;
    const height = e.offsetY - startY;

    let shape;

    if (mode === 'draw') {
        shape = { type: 'path', path: currentPath, color: currentColor, lineWidth: currentLineWidth };
        shapes.push(shape);
        currentPath = [];
    } else if (mode === 'line') {
        shape = { type: 'line', startX, startY, endX: e.offsetX, endY: e.offsetY, color: currentColor, lineWidth: currentLineWidth };
        shapes.push(shape);
    } else if (mode === 'rectangle') {
        shape = { type: 'rectangle', startX, startY, width, height, color: currentColor, lineWidth: currentLineWidth };
        shapes.push(shape);
    } else if (mode === 'circle') {
        const radius = Math.sqrt(width * width + height * height);
        shape = { type: 'circle', startX, startY, radius, color: currentColor, lineWidth: currentLineWidth };
        shapes.push(shape);
    } else if (mode === 'triangle') {
        shape = { type: 'triangle', startX, startY, width, height, color: currentColor, lineWidth: currentLineWidth };
        shapes.push(shape);
    }

    redrawShapes();
    sendDrawing(shape); // WebSocket üzerinden çizimi gönder
});


function undo() {
    if (shapes.length > 0) {
        const lastShape = shapes.pop();
        redoStack.push(lastShape);
        redrawShapes();
        sendDrawing({ type: 'undo' });
    }
}

function redo() {
    if (redoStack.length > 0) {
        const shape = redoStack.pop();
        shapes.push(shape);
        redrawShapes();
        sendDrawing({ type: 'redo' });
    }
}

function clearCanvas() {
    shapes = [];
    redoStack = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    sendDrawing({ type: 'clear' });
}
