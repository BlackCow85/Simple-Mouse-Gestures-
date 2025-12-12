let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 
let isGestureCooldown = false; 

// --- [설정: 민감도 최적화] ---
const MIN_DIST_GLOBAL = 5; 
const MIN_LEN_FOR_SCROLL = 30;
const MIN_HEIGHT_FOR_V = 30;
const RECOGNITION_THRESHOLD = 80; 
const RETURN_TOLERANCE = 100; 

// --- [낙서 방지 설정] ---
const SCROLL_CHAOS_RATIO = 3.0; 
const V_SHAPE_WIDTH_RATIO = 0.6; 
const MAX_V_EFFICIENCY_RATIO = 2.6;

// ★ 핵심 추가: 직선 엄격성(Straightness) 설정
// 기본 이동(상하좌우) 시, 주 방향 대비 보조 방향의 이동량이 40%를 넘으면 무시
// 예: 위로 100px 갈 때 옆으로 40px 이상 새면 "이건 직선이 아니라 대각선/L자다"라고 판단
const STRAIGHT_TOLERANCE = 0.4;


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

    if (path.length < 3 || Math.hypot(diffX, diffY) < MIN_DIST_GLOBAL) return;

    e.preventDefault(); e.stopPropagation();
    
    isGestureCooldown = true; 
    setTimeout(() => { isGestureCooldown = false; }, 500);

    // --- 데이터 분석 ---
    let maxY = startY; let minY = startY;
    let totalPathLength = 0; 
    let totalTraveledX = 0;  
    let totalTraveledY = 0;

    for(let i = 0; i < path.length; i++) {
        const p = path[i];
        if (p.y > maxY) maxY = p.y;
        if (p.y < minY) minY = p.y;
        
        if (i > 0) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            totalPathLength += Math.hypot(dx, dy); 
            totalTraveledX += Math.abs(dx);
            totalTraveledY += Math.abs(dy);
        }
    }

    const upHeight = startY - minY;  
    const downHeight = maxY - startY; 
    const gestureHeight = maxY - minY; 

    const wentDown = downHeight > MIN_HEIGHT_FOR_V; 
    const wentUp = upHeight > MIN_HEIGHT_FOR_V;   
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    const isMostlyUp = upHeight > downHeight;   
    const isMostlyDown = downHeight > upHeight; 

    const directDistance = Math.hypot(diffX, diffY);
    
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;
    const isChaosScroll = linearityRatio > SCROLL_CHAOS_RATIO;

    const isTooWideShape = gestureHeight > 0 ? (totalTraveledX / gestureHeight > V_SHAPE_WIDTH_RATIO) : true;
    const verticalEfficiency = gestureHeight > 20 ? (totalTraveledY / gestureHeight) : 999;
    const isRepetitiveChaos = verticalEfficiency > MAX_V_EFFICIENCY_RATIO;

    let action = null;

    // 1. [닫힌 탭 열기 (UR)] - 특수 동작이므로 최우선
    if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        if (!isChaosScroll) action = 'reopen';
    }

    // 2. [새로고침 (DU)] 
    else if (wentDown && returnedY && isMostlyDown) { 
        if (!isTooWideShape && !isRepetitiveChaos) action = 'refresh';
    }

    // 3. [탭 닫기 (UD)] 
    else if (wentUp && returnedY && isMostlyUp) { 
        if (!isTooWideShape && !isRepetitiveChaos) action = 'close';
    }
    
    // 4. [단순 이동 (상하좌우)]
    // ★ 여기가 수정됨: 엄격한 직선 검사 (미지정 제스처 차단)
    else {
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        if (directDistance < MIN_LEN_FOR_SCROLL) { /* 너무 짧음 */ }
        else if (isChaosScroll) { console.log("Chaos ignored"); }
        else {
            if (absX > absY) { 
                // [가로 이동 후보]
                // 세로로 샌 정도(absY)가 가로 이동(absX)의 40% 미만이어야 함
                // 예: 왼쪽으로 100 가는데 위로 50 가면 -> 탈락 (대각선/L자이므로)
                if (absY < absX * STRAIGHT_TOLERANCE) {
                    if (diffX > 0) action = 'forward'; 
                    else action = 'back';             
                } else {
                    console.log("Ignored: Not straight enough (Horizontal)");
                }
            } else { 
                // [세로 이동 후보]
                // 가로로 샌 정도(absX)가 세로 이동(absY)의 40% 미만이어야 함
                if (absX < absY * STRAIGHT_TOLERANCE) {
                    if (diffY > 0) action = 'bottom';  
                    else action = 'top';               
                } else {
                    console.log("Ignored: Not straight enough (Vertical)");
                }
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