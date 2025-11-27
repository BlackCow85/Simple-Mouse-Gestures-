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
const SCROLL_CHAOS_RATIO = 3.0; // 직선 제스처용 비율
const V_SHAPE_WIDTH_RATIO = 0.6; // V자 너비 비율

// ★ 핵심 추가: 수직 반복(Efficiency) 체크
// 정상적인 V자(탭닫기)는 위로 갔다 아래로 오므로 (이동거리 / 높이)가 약 2.0입니다.
// 이 값이 2.6을 넘는다는 건 위아래로 2번 이상 왔다갔다(낙서) 했다는 뜻입니다.
const MAX_V_EFFICIENCY_RATIO = 2.6;


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
    
    // 전체 수직 범위 (Range)
    const gestureHeight = maxY - minY; 

    const wentDown = downHeight > MIN_HEIGHT_FOR_V; 
    const wentUp = upHeight > MIN_HEIGHT_FOR_V;   
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    const isMostlyUp = upHeight > downHeight;   
    const isMostlyDown = downHeight > upHeight; 

    const directDistance = Math.hypot(diffX, diffY);
    
    // 1. 직선 제스처용 비율
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;
    const isChaosScroll = linearityRatio > SCROLL_CHAOS_RATIO;

    // 2. V자 제스처용 낙서 검사
    // [검사 A] 너비가 너무 넓은가?
    const isTooWideShape = gestureHeight > 0 ? (totalTraveledX / gestureHeight > V_SHAPE_WIDTH_RATIO) : true;
    
    // [검사 B - ★핵심] 위아래로 너무 많이 왔다갔다 했는가?
    // 정상 V자는 (총이동 Y / 수직높이)가 2.0 근처여야 함.
    // 실타래 낙서는 이 값이 3.0, 4.0 등 높게 나옴.
    const verticalEfficiency = gestureHeight > 20 ? (totalTraveledY / gestureHeight) : 999;
    const isRepetitiveChaos = verticalEfficiency > MAX_V_EFFICIENCY_RATIO;


    let action = null;

    // --- 판독 로직 ---

    // 1. [닫힌 탭 열기 (UR)]
    if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        if (!isChaosScroll) {
            action = 'reopen';
        } else {
            console.log("Reopen ignored: Chaos detected.");
        }
    }

    // 2. [새로고침 (DU)] 
    // 조건: 너무 넓지 않고(Wide), 너무 반복되지 않았을 때(Repetitive)
    else if (wentDown && returnedY && isMostlyDown) { 
        if (!isTooWideShape && !isRepetitiveChaos) {
            action = 'refresh';
        } else {
            console.log(`Refresh ignored: Wide(${isTooWideShape}) or Repetitive(${isRepetitiveChaos}, val:${verticalEfficiency.toFixed(2)})`);
        }
    }

    // 3. [탭 닫기 (UD)] 
    // 조건: 너무 넓지 않고(Wide), 너무 반복되지 않았을 때(Repetitive)
    else if (wentUp && returnedY && isMostlyUp) { 
        if (!isTooWideShape && !isRepetitiveChaos) {
            action = 'close';
        } else {
            console.log(`CloseTab ignored: Wide(${isTooWideShape}) or Repetitive(${isRepetitiveChaos}, val:${verticalEfficiency.toFixed(2)})`);
        }
    }
    
    // 4. [단순 이동 (스크롤)]
    else {
        if (directDistance < MIN_LEN_FOR_SCROLL) {
            // 너무 짧음
        }
        else if (isChaosScroll) {
             console.log("Scroll ignored: Chaos detected.");
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