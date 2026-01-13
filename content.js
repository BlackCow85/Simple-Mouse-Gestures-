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
const MIN_LEN_FOR_SCROLL = 30;
const MIN_HEIGHT_FOR_V = 30;   
const RECOGNITION_THRESHOLD = 80; 
const RETURN_TOLERANCE = 100; 

const AUTO_SCROLL_TRIGGER_WIDTH = 50;

// --- [낙서 및 오작동 방지 설정] ---
const SCROLL_CHAOS_RATIO = 3.0; 
const V_SHAPE_WIDTH_RATIO = 0.8; 
const MAX_V_EFFICIENCY_RATIO = 2.6;
const STRAIGHT_TOLERANCE = 0.6;
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

  // 유튜브 전체화면 대응
  const fsElement = document.fullscreenElement;
  if (fsElement) {
      if (canvas.parentNode !== fsElement) {
          fsElement.appendChild(canvas);
      }
  } else {
      if (!canvas.isConnected) {
          (document.documentElement || document.body).appendChild(canvas);
      }
  }

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
        // iframe 내부에서도 바닥 체크
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

// --- ★ [NEW] 하이브리드 입력 엔진 (Target: document.body) ---
function executeHybridScroll(direction) {
    const keyName = (direction === 'top') ? 'Home' : 'End';
    const keyCodeVal = (direction === 'top') ? 36 : 35; 

    const eventOptions = { 
        key: keyName, 
        code: keyName, 
        keyCode: keyCodeVal,
        which: keyCodeVal,
        bubbles: true, 
        cancelable: true,
        composed: true, 
        view: window 
    };

    // 1. [트리거] document.body에 키보드 이벤트 발사 (유튜브 대응)
    try { 
        const target = document.body || document.documentElement;
        target.dispatchEvent(new KeyboardEvent('keydown', eventOptions)); 
    } catch(e){}

    // 2. [실행] 좌표 강제 이동 (네이버 블로그 Iframe 내부 스크롤 대응)
    if (direction === 'top') {
        window.scrollTo(0, 0);
    } else if (direction === 'bottom') {
        window.scrollTo(0, document.body.scrollHeight);
    }

    // 3. [확인사살] 스크롤 이벤트
    try { window.dispatchEvent(new Event('scroll', { bubbles: true })); } catch(e){}

    // 4. [마무리] 키보드 뗌
    try { 
        const target = document.body || document.documentElement;
        target.dispatchEvent(new KeyboardEvent('keyup', eventOptions)); 
    } catch(e){}
}

// --- 동작 수행 ---
function performAction(action) {
    console.log("Action Triggered:", action);
    
    if (action === 'back') chrome.runtime.sendMessage({ action: "goBack" });
    else if (action === 'forward') chrome.runtime.sendMessage({ action: "goForward" });
    else if (action === 'refresh') chrome.runtime.sendMessage({ action: "refresh" });
    else if (action === 'close') chrome.runtime.sendMessage({ action: "closeTab" });
    else if (action === 'reopen') chrome.runtime.sendMessage({ action: "reopenTab" });
    
    // 자동 스크롤 (스마트 판단)
    else if (action === 'autoScroll') {
        // 내가 메인 창이거나(Top), 아니면 내가 스크롤할 내용이 많은 뚱뚱한 Iframe(네이버블로그)이면 직접 굴러라!
        if (window === window.top || document.body.scrollHeight > window.innerHeight) {
            startAutoScroll();
        } else {
            // 난 쪼그만 광고판이라 스크롤 할 게 없어... 부모님 굴러주세요.
            window.parent.postMessage({ type: 'GESTURE_START_AUTOSCROLL' }, '*');
        }
    }
    // 맨위/맨아래 (스마트 판단)
    else if (action === 'top' || action === 'bottom') {
        // ★ 핵심 수정: 네이버 블로그 해결사
        // "내가 메인창인가?" OR "내가 메인창은 아니지만 스크롤할 내용이 화면보다 긴가?"
        if (window === window.top || document.body.scrollHeight > window.innerHeight) {
            // 그러면 내가 직접 스크롤한다! (부모한테 안 미룸)
            executeHybridScroll(action);
        } else {
            // 난 내용도 없는 광고 배너다. 부모님이 대신 해주세요.
            window.parent.postMessage({ type: 'GESTURE_SCROLL', dir: action }, '*');
        }
    }
}

// --- 메시지 수신 (부모 창) ---
window.addEventListener('message', (event) => {
    if (!event.data) return;
    
    if (event.data.type === 'GESTURE_SCROLL') {
        executeHybridScroll(event.data.dir);
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
    
    // 제자리 복귀 판정 (직선/V자 구분)
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
                        // 맨위/맨아래 (스마트 판단 적용됨)
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