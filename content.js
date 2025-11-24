let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 

// --- [설정] 감도 조절 ---
const MIN_DIST = 10; 
const RECOGNITION_THRESHOLD = 150; // '닫힌 탭 열기' 가로 길이 기준
const RETURN_TOLERANCE = 100; // 제자리로 돌아왔다고 치는 오차 범위

// 낙서 방지 임계값
const MAX_X_VARIANCE = 200; 
const MAX_Y_VARIANCE = 200;

// --- 캔버스 설정 ---
function createOverlayCanvas() {
  if (document.getElementById('mouse-gesture-canvas')) {
    canvas = document.getElementById('mouse-gesture-canvas');
    ctx = canvas.getContext('2d');
    return;
  }
  canvas = document.createElement('canvas');
  canvas.id = 'mouse-gesture-canvas';
  Object.assign(canvas.style, {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    // ★ 중요: z-index를 최대로 높여서 모든 광고보다 위에 있게 함
    zIndex: '2147483647', 
    display: 'none',
    // 평소에는 클릭 통과, 그릴 때만 auto로 변경
    pointerEvents: 'none' 
  });
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
else window.addEventListener('DOMContentLoaded', createOverlayCanvas);

// --- 그리기 준비 (Pointer Capture 적용) ---
function prepareDrawing(e) {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  styleCanvas();
  
  canvas.style.display = 'block'; 
  canvas.style.pointerEvents = 'auto'; // 캔버스가 이벤트를 받도록 활성화
  
  ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY);

  // ★ 핵심 기술: 마우스 포인터를 캔버스에 강제로 묶어둠 (광고판으로 안 넘어가게)
  try {
    if (e.pointerId !== undefined) {
        canvas.setPointerCapture(e.pointerId);
    }
  } catch (err) {
    console.log("Pointer capture failed:", err);
  }
}

function stopDrawing(e) {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) {
    // 포인터 묶임 해제
    try {
        if (e && e.pointerId !== undefined) {
            canvas.releasePointerCapture(e.pointerId);
        }
    } catch (err) {}

    canvas.style.display = 'none';
    canvas.style.pointerEvents = 'none'; // 다시 클릭 통과되게 변경
  }
}

// --- 동작 수행 함수 ---
function performAction(action) {
    console.log("Action Triggered:", action);
    if (action === 'back') chrome.runtime.sendMessage({ action: "goBack" });
    else if (action === 'forward') chrome.runtime.sendMessage({ action: "goForward" });
    else if (action === 'refresh') chrome.runtime.sendMessage({ action: "refresh" });
    else if (action === 'close') chrome.runtime.sendMessage({ action: "closeTab" });
    else if (action === 'reopen') chrome.runtime.sendMessage({ action: "reopenTab" });
    else if (action === 'top') window.scrollTo(0, 0);
    else if (action === 'bottom') window.scrollTo(0, document.body.scrollHeight);
}

// --- ★ 이벤트 리스너 변경 (Mouse -> Pointer) ★ ---
// Pointer 이벤트는 마우스, 터치, 펜을 모두 포함하며 캡처 기능이 있습니다.

window.addEventListener('pointerdown', (e) => {
  // 우클릭(button 2)이면서, 메인 좌클릭이 아닐 때
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
  
  // 캔버스에 그리기
  if (ctx) { ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); }
  
  const lastP = path[path.length - 1];
  // 거리 계산
  const dist = Math.hypot(e.clientX - lastP.x, e.clientY - lastP.y);
  if (dist > 5) {
      path.push({x: e.clientX, y: e.clientY});
  }
}, true);

window.addEventListener('pointerup', (e) => {
  if (e.button === 2 && isDrawing) {
    isDrawing = false; 
    
    // 좌표 계산
    const endX = e.clientX;
    const endY = e.clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    // 정리 먼저 수행 (캡처 해제 포함)
    stopDrawing(e);

    // 너무 짧으면 무시 (메뉴 뜨게 놔둠)
    if (path.length < 3 || Math.hypot(diffX, diffY) < MIN_DIST) return;

    // 제스처로 인정되면 메뉴 뜨지 마
    e.preventDefault(); 
    e.stopPropagation();

    // --- 경로 및 동작 분석 (이전과 동일) ---
    let maxY = startY; 
    let minY = startY;
    let totalTraveledX = 0; 
    let totalTraveledY = 0; 

    for(let i = 0; i < path.length; i++) {
        const p = path[i];
        if (p.y > maxY) maxY = p.y;
        if (p.y < minY) minY = p.y;
        if (i > 0) {
            totalTraveledX += Math.abs(path[i].x - path[i-1].x);
            totalTraveledY += Math.abs(path[i].y - path[i-1].y);
        }
    }

    const wentDown = (maxY - startY) > 50; 
    const wentUp = (startY - minY) > 50;   
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    const isVerticalChaos = totalTraveledX > MAX_X_VARIANCE; 
    const isHorizontalChaos = totalTraveledY > MAX_Y_VARIANCE; 

    let action = null;

    if (wentDown && returnedY) {
        if (!isVerticalChaos) action = 'refresh';
    }
    else if (wentUp && returnedY) {
        if (!isVerticalChaos) action = 'close';
    }
    else if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        // 닫힌 탭 열기는 Chaos 체크 면제
        action = 'reopen';
    }
    else {
        if (absX > absY) { 
            if (!isHorizontalChaos) {
                if (diffX > 0) action = 'forward'; 
                else action = 'back';             
            }
        } else { 
            if (!isVerticalChaos) {
                if (diffY > 0) action = 'bottom';  
                else action = 'top';               
            }
        }
    }

    if (action) performAction(action);
  }
}, true);

// 우클릭 메뉴 방지
window.addEventListener('contextmenu', (e) => {
  // 제스처가 감지되었거나 캔버스가 켜져있으면 메뉴 차단
  if (path.length > 5 || (canvas && canvas.style.display === 'block')) { 
    e.preventDefault(); e.stopPropagation();
    isDrawing = false;
    stopDrawing(e); 
  }
}, true);