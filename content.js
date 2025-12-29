let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 
let isGestureCooldown = false; 

// ★ 자동 스크롤 제어
let autoScrollId = null;
let isAutoScrolling = false;

// --- [설정: 민감도] ---
const MIN_DIST_GLOBAL = 5; 
const MIN_LEN_FOR_SCROLL = 30; // 30px 이상 그으면 인식
const MIN_HEIGHT_FOR_V = 30;   // V자 높이 30px
const RECOGNITION_THRESHOLD = 80; 
const RETURN_TOLERANCE = 100; 

const AUTO_SCROLL_TRIGGER_WIDTH = 50;

// --- [낙서 및 오작동 방지 설정] ---
const SCROLL_CHAOS_RATIO = 3.0; 
const V_SHAPE_WIDTH_RATIO = 0.8; 
const MAX_V_EFFICIENCY_RATIO = 2.6;

// ★ 직선 이동(상하좌우) 방향 허용 오차 (0.6 = 약 30도)
const STRAIGHT_TOLERANCE = 0.6;

// ★ 단순 이동 시 "꺾임(L자)" 방지 비율
const SIMPLE_MOVE_LINEARITY_LIMIT = 1.25;


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
  if (isAutoScrolling) {
      stopAutoScroll();
      if (window !== window.top) {
          window.parent.postMessage({ type: 'GESTURE_STOP_AUTOSCROLL' }, '*');
      }
  }

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

// --- 자동 스크롤 엔진 ---
function startAutoScroll() {
    if (isAutoScrolling) return;
    isAutoScrolling = true;
    const speed = 15; 
    
    function scrollLoop() {
        if (!isAutoScrolling) return;
        window.scrollBy(0, speed);
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
            stopAutoScroll();
            return;
        }
        autoScrollId = requestAnimationFrame(scrollLoop);
    }
    scrollLoop();
}

function stopAutoScroll() {
    isAutoScrolling = false;
    if (autoScrollId) cancelAnimationFrame(autoScrollId);
}

// --- 동작 수행 ---
function performAction(action) {
    console.log("Action Triggered:", action);
    
    if (action === 'back') chrome.runtime.sendMessage({ action: "goBack" });
    else if (action === 'forward') chrome.runtime.sendMessage({ action: "goForward" });
    else if (action === 'refresh') chrome.runtime.sendMessage({ action: "refresh" });
    else if (action === 'close') chrome.runtime.sendMessage({ action: "closeTab" });
    else if (action === 'reopen') chrome.runtime.sendMessage({ action: "reopenTab" });
    
    else if (action === 'autoScroll') {
        if (window !== window.top) {
            window.parent.postMessage({ type: 'GESTURE_START_AUTOSCROLL' }, '*');
        } else {
            startAutoScroll();
        }
    }
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
    if (!event.data) return;
    if (event.data.type === 'GESTURE_SCROLL') {
        if (event.data.dir === 'top') window.scrollTo(0, 0);
        else if (event.data.dir === 'bottom') window.scrollTo(0, document.body.scrollHeight);
    }
    else if (event.data.type === 'GESTURE_START_AUTOSCROLL') {
        startAutoScroll();
    }
    else if (event.data.type === 'GESTURE_STOP_AUTOSCROLL') {
        stopAutoScroll();
    }
});

// --- 이벤트 리스너 ---
window.addEventListener('mousedown', () => {
    if (isAutoScrolling) {
        stopAutoScroll();
        if (window !== window.top) window.parent.postMessage({ type: 'GESTURE_STOP_AUTOSCROLL' }, '*');
    }
}, true);

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

    // V자 제스처 감도
    const wentDown = downHeight > MIN_HEIGHT_FOR_V; 
    const wentUp = upHeight > MIN_HEIGHT_FOR_V;   
    
    // ★ 핵심 수정: 제자리 복귀(Returned) 판정 강화
    // 1. 끝점이 시작점 근처여야 함 (기본 100px)
    // 2. AND 시작점-끝점 거리가 전체 이동 높이의 80% 미만이어야 함 (즉, 높이만큼은 다시 돌아왔어야 함)
    // 예: 위로 50px만 긋고 멈추면 distY=50, Height=50. 50 < 40(80%) False -> 탭닫기 아님 (직선)
    const distY = Math.abs(endY - startY);
    const returnedY = distY < RETURN_TOLERANCE && distY < (gestureHeight * 0.8);

    const isMostlyUp = upHeight > downHeight;   
    const isMostlyDown = downHeight > upHeight; 

    const directDistance = Math.hypot(diffX, diffY);
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;
    
    const isChaosScroll = linearityRatio > SCROLL_CHAOS_RATIO;
    const isTooWideShape = gestureHeight > 0 ? (totalTraveledX / gestureHeight > V_SHAPE_WIDTH_RATIO) : true;
    const verticalEfficiency = gestureHeight > 20 ? (totalTraveledY / gestureHeight) : 999;
    const isRepetitiveChaos = verticalEfficiency > MAX_V_EFFICIENCY_RATIO;

    let action = null;

    // 1. [닫힌 탭 열기 (UR)]
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
    // 4. [자동 스크롤 (DR)]
    else if (wentDown && diffX > AUTO_SCROLL_TRIGGER_WIDTH) {
        if (!isChaosScroll) action = 'autoScroll';
    }
    // 5. [단순 이동 (상하좌우)]
    else {
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);
        
        if (directDistance < MIN_LEN_FOR_SCROLL) { /* 너무 짧음 */ }
        else if (isChaosScroll) { console.log("Chaos ignored"); }
        else {
            // L자 모양 꺾임 방지
            if (linearityRatio > SIMPLE_MOVE_LINEARITY_LIMIT) {
                console.log("Ignored: Path too curved (L-shape detected)");
            } 
            else {
                if (absX > absY) { 
                    if (absY < absX * STRAIGHT_TOLERANCE) {
                        if (diffX > 0) action = 'forward'; 
                        else action = 'back';             
                    }
                } else { 
                    if (absX < absY * STRAIGHT_TOLERANCE) {
                        if (diffY > 0) action = 'bottom';  
                        else action = 'top';               
                    }
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