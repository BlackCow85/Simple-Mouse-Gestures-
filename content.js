let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 

// --- [설정] 감도 조절 ---
const MIN_DIST = 10; 
const RECOGNITION_THRESHOLD = 150; // '닫힌 탭 열기' 가로 길이 기준
const RETURN_TOLERANCE = 100; // 제자리로 돌아왔다고 치는 오차 범위

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
    zIndex: '2147483647', pointerEvents: 'none', display: 'none'
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

function prepareDrawing(e) {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  styleCanvas();
  canvas.style.display = 'block'; 
  canvas.style.pointerEvents = 'none'; 
  ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY);
}

function stopDrawing() {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) canvas.style.display = 'none';
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

// --- 마우스 이벤트 ---
window.addEventListener('mousedown', (e) => {
  if (e.button === 2) { 
    isDrawing = true; 
    startX = e.clientX; 
    startY = e.clientY;
    path = [{x: startX, y: startY}]; 
    prepareDrawing(e);
  }
}, true);

window.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  if (ctx) { ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); }
  
  const lastP = path[path.length - 1];
  const dist = Math.hypot(e.clientX - lastP.x, e.clientY - lastP.y);
  if (dist > 5) {
      path.push({x: e.clientX, y: e.clientY});
  }
}, true);

window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && isDrawing) {
    isDrawing = false; 
    stopDrawing();

    const endX = e.clientX;
    const endY = e.clientY;
    
    const diffX = endX - startX;
    const diffY = endY - startY;
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    // 너무 짧으면 무시 (우클릭 메뉴)
    if (path.length < 3 || Math.hypot(diffX, diffY) < MIN_DIST) return;

    e.preventDefault(); 
    e.stopPropagation();

    // --- ★ 수정된 로직 ★ ---
    
    // 경로 분석
    let maxY = startY; 
    let minY = startY;
    
    path.forEach(p => {
        if (p.y > maxY) maxY = p.y;
        if (p.y < minY) minY = p.y;
    });

    // 50px 이상 움직임이 있었는지 체크
    const wentDown = (maxY - startY) > 50; 
    const wentUp = (startY - minY) > 50;   
    
    // 시작점 Y와 끝점 Y가 비슷한지 (제자리로 돌아왔는지) 체크
    const returnedY = Math.abs(endY - startY) < RETURN_TOLERANCE; 

    let action = null;

    // 1. [새로고침 (DU)] : 내려갔다 + 돌아옴
    if (wentDown && returnedY) {
        action = 'refresh';
    }
    // 2. [탭 닫기 (UD)] : 올라갔다 + 돌아옴 (★ 여기가 추가됨: 돌아와야만 닫기!)
    else if (wentUp && returnedY) {
        action = 'close';
    }
    // 3. [닫힌 탭 열기 (UR)] : 올라갔다 + 오른쪽으로 멀리 감(150px 이상)
    else if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        action = 'reopen';
    }
    // 4. [기본 방향 이동] : 위의 특수 동작이 아니면 직선 이동으로 판단
    else {
        if (absX > absY) { // 가로 이동
            if (diffX > 0) action = 'forward'; // →
            else action = 'back';             // ←
        } else { // 세로 이동
            if (diffY > 0) action = 'bottom';  // ↓
            else action = 'top';               // ↑ (이제 여기서 정상 작동함)
        }
    }

    if (action) performAction(action);
  }
}, true);

window.addEventListener('contextmenu', (e) => {
  if (path.length > 5) { 
    e.preventDefault(); e.stopPropagation();
  }
  isDrawing = false; 
  stopDrawing();
}, true);