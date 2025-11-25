let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 
let isGestureCooldown = false; 

// --- [설정] ---
const MIN_DIST = 10; 
const RECOGNITION_THRESHOLD = 150; 
const RETURN_TOLERANCE = 100; 

const MAX_X_TRAVEL_FOR_V = 300; 
const SCROLL_CHAOS_RATIO = 3.0;

// --- 캔버스 설정 ---
function createOverlayCanvas() {
  const oldCanvas = document.getElementById('mouse-gesture-canvas');
  if (oldCanvas) oldCanvas.remove();

  canvas = document.createElement('canvas');
  canvas.id = 'mouse-gesture-canvas';
  canvas.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; display: none; pointer-events: none;
  `;
  (document.documentElement || document.body).appendChild(canvas);
  ctx = canvas.getContext('2d');
  styleCanvas();
}

function styleCanvas() {
  if (!ctx) return;
  ctx.strokeStyle = '#800080'; ctx.lineWidth = 5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}

if (document.body) createOverlayCanvas();
window.addEventListener('DOMContentLoaded', createOverlayCanvas);

// --- 그리기 준비 ---
function prepareDrawing(e) {
  if (!canvas) createOverlayCanvas();
  
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  styleCanvas();
  
  canvas.style.display = 'block'; 
  canvas.style.pointerEvents = 'auto'; 
  
  ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY);

  try {
    if (e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
}

function stopDrawing(e) {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) {
    try {
        if (e && e.pointerId !== undefined) canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
    canvas.style.display = 'none';
    canvas.style.pointerEvents = 'none'; 
  }
}

// --- 동작 수행 ---
function performAction(action) {
    console.log("Action Triggered:", action);
    
    if (action === 'back') chrome.runtime.sendMessage({ action: "goBack" });
    else if (action === 'forward') chrome.runtime.sendMessage({ action: "goForward" });
    else if (action === 'refresh') chrome.runtime.sendMessage({ action: "refresh" });
    else if (action === 'close') chrome.runtime.sendMessage({ action: "closeTab" });
    else if (action === 'reopen') chrome.runtime.sendMessage({ action: "reopenTab" });
    
    else if (action === 'top' || action === 'bottom') {
        if (window !== window.top) {
            window.parent.postMessage({ type: 'GESTURE_SCROLL', dir: action }, '*');
        } else {
            if (action === 'top') window.scrollTo(0, 0);
            else window.scrollTo(0, document.body.scrollHeight);
        }
    }
}

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GESTURE_SCROLL') {
        if (event.data.dir === 'top') window.scrollTo(0, 0);
        else if (event.data.dir === 'bottom') window.scrollTo(0, document.body.scrollHeight);
    }
});

// --- 이벤트 리스너 ---

window.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { 
    isDrawing = true; 
    startX = e.clientX; 
    startY = e.clientY;
    path = [{x: startX, y: startY}]; 
    prepareDrawing(e);
  }
}, true);

window.addEventListener('pointermove', (e) => {
  if (!isDrawing) return;
  if (ctx) { ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); }
  
  const lastP = path[path.length - 1];
  const dist = Math.hypot(e.clientX - lastP.x, e.clientY - lastP.y);
  if (dist > 5) path.push({x: e.clientX, y: e.clientY});
}, true);

window.addEventListener('pointerup', (e) => {
  if (e.button === 2 && isDrawing) {
    isDrawing = false; 
    
    const endX = e.clientX;
    const endY = e.clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;
    
    stopDrawing(e);

    if (path.length < 3 || Math.hypot(diffX, diffY) < MIN_DIST) return;

    e.preventDefault(); e.stopPropagation();
    
    isGestureCooldown = true; 
    setTimeout(() => { isGestureCooldown = false; }, 500);

    // --- 데이터 분석 ---
    let maxY = startY; let minY = startY;
    let totalPathLength = 0; 
    let totalTraveledX = 0;  

    for(let i = 0; i < path.length; i++) {
        const p = path[i];
        if (p.y > maxY) maxY = p.y;
        if (p.y < minY) minY = p.y;
        
        if (i > 0) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            totalPathLength += Math.hypot(dx, dy); 
            totalTraveledX += Math.abs(dx);
        }
    }

    // 위로 얼마나 갔나 vs 아래로 얼마나 갔나 계산
    const upHeight = startY - minY;  // 위로 솟은 높이
    const downHeight = maxY - startY; // 아래로 꺼진 깊이

    const wentDown = downHeight > 50; 
    const wentUp = upHeight > 50;   
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    // ★ 핵심 수정: 누가 더 큰지 비교해서 승자를 정함
    const isMostlyUp = upHeight > downHeight;   // 위로 더 많이 갔으면 탭닫기 유력
    const isMostlyDown = downHeight > upHeight; // 아래로 더 많이 갔으면 새로고침 유력

    const directDistance = Math.hypot(diffX, diffY);
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;

    let action = null;

    // 1. [새로고침 (DU)] 
    // 조건: 아래로 갔고 + 돌아왔고 + (★아래로 간 길이가 위로 간 것보다 커야 함)
    if (wentDown && returnedY && isMostlyDown) { 
        if (totalTraveledX < MAX_X_TRAVEL_FOR_V) action = 'refresh';
    }
    // 2. [탭 닫기 (UD)] 
    // 조건: 위로 갔고 + 돌아왔고 + (★위로 간 길이가 아래로 간 것보다 커야 함)
    else if (wentUp && returnedY && isMostlyUp) { 
        if (totalTraveledX < MAX_X_TRAVEL_FOR_V) action = 'close';
    }
    
    // 3. [닫힌 탭 열기 (UR)]
    else if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        action = 'reopen';
    }

    // 4. [단순 이동]
    else {
        if (linearityRatio > SCROLL_CHAOS_RATIO) {
             console.log("Scroll cancelled due to chaos.");
        } 
        else {
            const absX = Math.abs(diffX);
            const absY = Math.abs(diffY);
            
            if (absX > absY) { 
                if (diffX > 0) action = 'forward'; 
                else action = 'back';             
            } else { 
                if (diffY > 0) action = 'bottom';  
                else action = 'top';               
            }
        }
    }

    if (action) performAction(action);
  }
}, true);

window.addEventListener('contextmenu', (e) => {
  if (path.length > 5 || (canvas && canvas.style.display === 'block') || isGestureCooldown) { 
    e.preventDefault(); e.stopPropagation();
    isDrawing = false;
    stopDrawing(); 
    return false;
  }
}, true);