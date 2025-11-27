let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 
let isGestureCooldown = false; 

// --- [설정: 민감도 최적화] ---
// 1. 기본 인식 거리 (너무 짧은 클릭만 무시)
const MIN_DIST_GLOBAL = 5; 

// 2. [직선 스크롤용] 최소 길이
// 50px -> 30px로 더 줄임 (짧게 그어도 스크롤 인식)
const MIN_LEN_FOR_SCROLL = 30;

// 3. [V자 제스처용] 최소 높이 (새로고침/탭닫기)
// ★ 수정됨: 50px -> 30px (살짝만 위아래로 흔들어도 인식되게 개선)
const MIN_HEIGHT_FOR_V = 30;

// 4. [닫힌 탭 열기] 감지 길이 (가로)
// ★ 수정됨: 150px -> 80px (더 짧게 오른쪽으로 그어도 인식)
const RECOGNITION_THRESHOLD = 80; 

// 제자리 복귀 허용 오차
const RETURN_TOLERANCE = 100; 

// 낙서 방지 설정
const MAX_X_TRAVEL_FOR_V = 300; 
// ★ 비율 제한: 실제 이동 거리가 직선 거리의 3배가 넘으면 낙서로 간주
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

    // 글로벌 최소 거리 (클릭 오작동 방지용, 5px)
    if (path.length < 3 || Math.hypot(diffX, diffY) < MIN_DIST_GLOBAL) return;

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

    // 높이/깊이 계산
    const upHeight = startY - minY;  
    const downHeight = maxY - startY; 
    
    // V자 제스처 인식 기준 (30px만 움직여도 됨)
    const wentDown = downHeight > MIN_HEIGHT_FOR_V; 
    const wentUp = upHeight > MIN_HEIGHT_FOR_V;   
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    // 누가 더 강한 제스처인가?
    const isMostlyUp = upHeight > downHeight;   
    const isMostlyDown = downHeight > upHeight; 

    const directDistance = Math.hypot(diffX, diffY);
    // ★ 낙서 판별용 비율: (실제 이동 거리 / 직선 거리)
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;
    const isChaos = linearityRatio > SCROLL_CHAOS_RATIO; // 3배 이상 돌아가면 낙서

    let action = null;

    // --- 판독 로직 시작 ---

    // 1. [닫힌 탭 열기 (UR)]
    // ★ 수정: Chaos(낙서) 체크 추가. 빙글빙글 돌리다가 UR 모양 만들면 무시됨.
    if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        if (!isChaos) {
            action = 'reopen';
        } else {
            console.log("Reopen tab cancelled due to chaos (Scribble).");
        }
    }

    // 2. [새로고침 (DU)] 
    // V자는 직선 비율(Ratio) 검사를 하면 안 됨 (원래 돌아오는 모양이라 Ratio가 높음)
    // 대신 좌우 흔들림(totalTraveledX)으로 낙서를 거름
    else if (wentDown && returnedY && isMostlyDown) { 
        if (totalTraveledX < MAX_X_TRAVEL_FOR_V) action = 'refresh';
    }

    // 3. [탭 닫기 (UD)] 
    else if (wentUp && returnedY && isMostlyUp) { 
        if (totalTraveledX < MAX_X_TRAVEL_FOR_V) action = 'close';
    }
    
    // 4. [단순 이동 (스크롤/페이지이동)]
    else {
        // 거리 30px 미만이면 무시 (너무 짧은 깨작거림)
        if (directDistance < MIN_LEN_FOR_SCROLL) {
            // 아무것도 안함
        }
        // 낙서(비율) 체크
        else if (isChaos) {
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