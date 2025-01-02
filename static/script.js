// script.js dosyasındaki gerekli düzenleme:

const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let mode = 'draw';
let startX, startY;

let shapes = [];
let redoStack = [];
let currentPath = [];
let currentColor = '#000000'; 
let currentLineWidth = 2; 
let drawingInterval = null; 

// URL'deki query parametrelerini ayrıştırmak
const params = new URLSearchParams(window.location.search);
const lobbyName = params.get('lobby');
const username = params.get('username');
token = params.get('token'); // Token alınıyor
console.log(`Query Params: lobby=${lobbyName}, username=${username}, token=${token}`);

const userListElement = document.getElementById('user-list');

const sessionId = generateSessionId();

function generateSessionId() {
    return Math.random().toString(36).substring(2, 15); 
}

//creating websocket connection
if (!lobbyName || !username || !token) {
    alert("Lobby, username, or token is missing!");
    window.location.href = "/static/index.html"; 
}

const socket = new WebSocket(`ws://${window.location.host}/ws/${lobbyName}?token=${encodeURIComponent(token)}&username=${encodeURIComponent(username)}&session_id=${sessionId}`);

socket.onopen = () => {
    console.log("WebSocket connection is opened.");
    socket.send(JSON.stringify({ type: "join", username }));
};

// Çizim yapan kişinin adını geçici olarak göstermek için timeout ID'si
let usernameTimeout = null;

socket.onmessage = (event) => {
    if (!event.data || event.data.trim() === "") return; 
    try {
        const data = JSON.parse(event.data);
        console.log("WebSocket mesajı alındı:", data); 

        if (data.type === 'users') {
            console.log("Kullanıcı listesi alındı:", data.users); 
            updateUserList(data.users);
        } else if (data.type === 'path' || data.type === 'line' || data.type === 'rectangle' || data.type === 'circle' || data.type === 'triangle' || data.type === 'erase') {
            shapes.push(data);
            redrawShapes();

            //showing the name of the drawer
            if (data.username) {
                ctx.font = "16px Arial";
                ctx.fillStyle = "#000000";
                const lastPoint = data.path ? data.path[data.path.length - 1] : { x: data.startX, y: data.startY };
                ctx.fillText(data.username, lastPoint.x + 10, lastPoint.y + 10);

                if (usernameTimeout) {
                    clearTimeout(usernameTimeout);
                }

                usernameTimeout = setTimeout(() => {
                    redrawShapes(); 
                }, 1000);
            }
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
    } catch (error) {
        console.error("Gelen mesaj JSON formatında değil veya işlenemedi:", event.data, error);
    }
};



socket.onclose = () => {
    console.log("The WebSocket connection has been closed.");
    alert("Socket connection closed. Lobby access failed.");
    window.location.href = "/static/index.html"; 
};

socket.onerror = (error) => {
    console.error("WebSocket error:", error);
    alert("An error occurred in the socket connection. You are being redirected to the main menu.");
    window.location.href = "/static/index.html"; 
};

function sendDrawing(data) {
    if (socket.readyState === WebSocket.OPEN && data) {
        try {
            socket.send(JSON.stringify(data));
        } catch (error) {
            console.error("An error occurred during data transmission:", error);
        }
    } else {
        console.warn("Data could not be sent. The WebSocket connection is not open or the data is invalid:", data);
    }
}

function updateUserList(users) {
    userListElement.innerHTML = ""; 
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        userListElement.appendChild(li);
    });
}

function setMode(selectedMode) {
    mode = selectedMode;
}

function changeColor(color) {
    currentColor = color; 
}

function changeLineWidth(width) {
    currentLineWidth = width; 
}

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
        } else if (shape.type === 'erase') {
            ctx.clearRect(shape.startX, shape.startY, shape.width, shape.height);
        }
    });
}

canvas.addEventListener('mousedown', e => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;

    if (mode === 'draw') {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        currentPath = [{ x: startX, y: startY }];
    }

    drawingInterval = setInterval(() => {
        if (currentPath.length > 1) {
            const partialShape = { type: 'path', path: [...currentPath], color: currentColor, lineWidth: currentLineWidth };
            shapes.push(partialShape);  
            sendDrawing(partialShape);  
            currentPath = [currentPath[currentPath.length - 1]];  
        }
    }, 100); 
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
    } else if (mode === 'erase') {
        const width = currentLineWidth * 2; 
        const height = currentLineWidth * 2; 
        ctx.clearRect(x - width / 2, y - height / 2, width, height);
        shapes.push({ type: 'erase', startX: x - width / 2, startY: y - height / 2, width, height });
        sendDrawing({ type: 'erase', startX: x - width / 2, startY: y - height / 2, width, height });
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

    clearInterval(drawingInterval); 

    const width = e.offsetX - startX;
    const height = e.offsetY - startY;

    let shape = null;

    if (mode === 'draw') {
        if (currentPath.length > 1) {
            shape = { type: 'path', path: currentPath, color: currentColor, lineWidth: currentLineWidth };
            shapes.push(shape);
        }
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

    if (shape) {
        redrawShapes();
        sendDrawing(shape); 
    }

    if (usernameTimeout) {
        clearTimeout(usernameTimeout);
    }
    usernameTimeout = setTimeout(() => {
        redrawShapes(); 
    }, 1000); 
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

function downloadCanvas() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    tempCtx.fillStyle = 'white';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(canvas, 0, 0);


    const link = document.createElement('a');
    link.download = 'whiteboard_with_background.png';
    link.href = tempCanvas.toDataURL(); 
    link.click(); 
}


document.getElementById('leave-lobby-button').addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the lobby?')) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
        }

        window.location.href = "/static/index.html";
    }
});
