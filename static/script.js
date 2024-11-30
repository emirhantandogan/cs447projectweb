const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let mode = 'draw';
let startX, startY;
let shapes = [];
let redoStack = [];
let currentPath = [];

ctx.strokeStyle = '#000000';
ctx.lineWidth = 2;

// Mod değiştirme
function setMode(selectedMode) {
    mode = selectedMode;
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
        }
    });
}


// Çizim olayları
canvas.addEventListener('mousedown', e => {
    drawing = true;
    startX = e.offsetX;
    startY = e.offsetY;

    if (mode === 'draw') {
        currentPath = [{ x: startX, y: startY }];
    }
});

canvas.addEventListener('mousemove', e => {
    if (!drawing) return;

    if (mode === 'draw') {
        const x = e.offsetX;
        const y = e.offsetY;
        ctx.lineTo(x, y);
        ctx.stroke();
        currentPath.push({ x, y });
    }
});

canvas.addEventListener('mouseup', e => {
    if (!drawing) return;
    drawing = false;

    if (mode === 'draw') {
        shapes.push({ type: 'path', path: currentPath, color: ctx.strokeStyle, lineWidth: ctx.lineWidth });
        redoStack = [];
    }

    redrawShapes();
});
