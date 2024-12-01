const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let mode = 'draw';
let startX, startY;
let shapes = [];
let redoStack = [];
let currentPath = [];

// WebSocket bağlantısı
const lobbyName = new URLSearchParams(window.location.search).get('lobby');
const socket = new WebSocket(`ws://${window.location.host}/ws/${lobbyName}`);

// WebSocket olayları
socket.onopen = () => {
    console.log("WebSocket bağlantısı açıldı.");
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("WebSocket mesajı alındı:", data);

    if (data.type === 'path' || data.type === 'line' || data.type === 'rectangle' || data.type === 'circle' || data.type === 'triangle') {
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
};

socket.onerror = (error) => {
    console.error("WebSocket hatası:", error);
};

// Çizim verilerini WebSocket ile gönderme
function sendDrawing(data) {
    console.log("send_drawing entered!")
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
        console.log("sended!")
    }
}

// Mod değiştirme
function setMode(selectedMode) {
    mode = selectedMode;
}

// Renk ve çizgi kalınlığı değiştirme
function changeColor(color) {
    ctx.strokeStyle = color;
}

function changeLineWidth(width) {
    ctx.lineWidth = width;
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
        // Yeni bir yol başlat
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
        // Mevcut yola çizim yap
        ctx.lineTo(x, y);
        ctx.stroke();

        // Çizilen noktayı mevcut yola ekle
        currentPath.push({ x, y });
    } else {
        redrawShapes();

        const width = x - startX;
        const height = y - startY;

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
        shape = { type: 'path', path: currentPath, color: ctx.strokeStyle, lineWidth: ctx.lineWidth };
        shapes.push(shape);
        currentPath = [];
    } else if (mode === 'line') {
        shape = { type: 'line', startX, startY, endX: e.offsetX, endY: e.offsetY, color: ctx.strokeStyle, lineWidth: ctx.lineWidth };
        shapes.push(shape);
    } else if (mode === 'rectangle') {
        shape = { type: 'rectangle', startX, startY, width, height, color: ctx.strokeStyle, lineWidth: ctx.lineWidth };
        shapes.push(shape);
    } else if (mode === 'circle') {
        const radius = Math.sqrt(width * width + height * height);
        shape = { type: 'circle', startX, startY, radius, color: ctx.strokeStyle, lineWidth: ctx.lineWidth };
        shapes.push(shape);
    } else if (mode === 'triangle') {
        shape = { type: 'triangle', startX, startY, width, height, color: ctx.strokeStyle, lineWidth: ctx.lineWidth };
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

        // Undo işlemini diğer kullanıcılara bildir
        sendDrawing({ type: 'undo' });
    }
}

function redo() {
    if (redoStack.length > 0) {
        const shape = redoStack.pop();
        shapes.push(shape);
        redrawShapes();

        // Redo işlemini sunucuya bildir
        sendDrawing({ type: 'redo' });
    }
}


function clearCanvas() {
    shapes = [];
    redoStack = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Clear işlemini diğer kullanıcılara bildir
    sendDrawing({ type: 'clear' });
}