const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const socket = new WebSocket('ws://localhost:8000/ws');
let drawing = false;

// Çizim başlatma
canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    ctx.beginPath(); // Yeni bir yol başlat
    ctx.moveTo(e.offsetX, e.offsetY);

    // Server'a çizim başlangıç noktasını gönder
    socket.send(JSON.stringify({
        type: 'start',
        x: e.offsetX,
        y: e.offsetY
    }));
});

// Çizim yaparken
canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return; // Eğer çizim yapılmıyorsa, çık

    const x = e.offsetX;
    const y = e.offsetY;
    ctx.lineTo(x, y);
    ctx.stroke();

    // Server'a çizim verisini gönder
    socket.send(JSON.stringify({
        type: 'draw',
        x,
        y
    }));
});

let debounceTimeout;

canvas.addEventListener('mouseup', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        if (!drawing) return;
        drawing = false;
        ctx.closePath();

        // Server'a çizim bitişini bildir
        socket.send(JSON.stringify({ type: 'end' }));
    }, 10); // 10 ms içinde mouseup olayını işlemeye fırsat verir
});

canvas.addEventListener('mouseleave', () => {
    drawing = false;
    ctx.closePath(); // Yolu kapat

    // Server'a çizim bitişini bildir
    socket.send(JSON.stringify({ type: 'end' }));
});

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'start') {
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
    } else if (data.type === 'draw') {
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
    } else if (data.type === 'end') {
        ctx.closePath(); // Server'dan gelen bitiş sinyaliyle yolu kapat
    }
};