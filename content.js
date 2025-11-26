let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 
let isGestureCooldown = false; 

// --- [설정: 민감도 조정] ---
// ★ 수정됨: 최소 이동 거리 (기존 10 -> 60)
// 시작점과 끝점이 60px 이상 벌어지지 않으면 아예 무시 (짧은 선 방지)
const MIN_DIST = 60; 

// '닫힌 탭 열기' 감지 길이 (기존 150 유지)
const RECOGNITION_THRESHOLD = 150; 
const RETURN_TOLERANCE = 100; 

// ★ 수정됨: V자 제스처(새로고침/닫기) 인식 최소 높이 (기존 50 -> 120)
// 위/아래로 120px 이상 확실하게 갔다 와야 인정됨
const V_GESTURE_MIN_HEIGHT = 120;

// 낙서 방지 설정
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

    // ★ 수정됨: 최소 거리 체크 (MIN_DIST = 60)
    // 60px 미만으로 움직였으면(첫번째 사진 같은 경우) 그냥 무시
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

    const upHeight = startY - minY;  
    const downHeight = maxY - startY; 

    // ★ 수정됨: V자 높이 체크 (V_GESTURE_MIN_HEIGHT = 120)
    // 위나 아래로 120px 이상은 움직여야 V자 제스처로 인정
    const wentDown = downHeight > V_GESTURE_MIN_HEIGHT; 
    const wentUp = upHeight > V_GESTURE_MIN_HEIGHT;   
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    const isMostlyUp = upHeight > downHeight;   
    const isMostlyDown = downHeight > upHeight; 

    const directDistance = Math.hypot(diffX, diffY);
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;

    let action = null;

    // 1. [새로고침 (DU)] 
    if (wentDown && returnedY && isMostlyDown) { 
        if (totalTraveledX < MAX_X_TRAVEL_FOR_V) action = 'refresh';
    }
    // 2. [탭 닫기 (UD)] 
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