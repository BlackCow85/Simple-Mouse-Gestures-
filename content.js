let startX, startY;
let path = [];
let isDrawing = false;
const MIN_DIST = 20;
let canvas, ctx;

// --- 캔버스 관련 함수 (이전과 동일) ---
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
  canvas.style.display = 'block'; canvas.style.pointerEvents = 'auto';
  ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY);
}

function stopDrawing() {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) { canvas.style.display = 'none'; canvas.style.pointerEvents = 'none'; }
}

// --- ★ 핵심: 스마트 스크롤 함수 (content.js 내부에서 직접 실행) ---
function performSmartScroll(direction) {
  // 1차 시도: 기본 window 스크롤
  const startScrollY = window.scrollY;
  if (direction === 'up') window.scrollTo(0, 0);
  else window.scrollTo(0, document.body.scrollHeight);
  
  // window가 스크롤되었다면 여기서 종료
  if (window.scrollY !== startScrollY || window.scrollY > 0 || document.body.scrollHeight > window.innerHeight) {
      // 제미나이 같은 사이트는 window 스크롤이 안 먹혀도 여기 조건에 걸릴 수 있어서
      // 확실한 내부 컨테이너 찾기로 넘어갑니다.
  }

  // 2차 시도: 실제 스크롤 가능한 내부 컨테이너 찾기
  // 페이지 내의 모든 div, main, section 등을 조사하여 스크롤바가 있는 가장 큰 영역을 찾습니다.
  const candidates = document.querySelectorAll('div, main, section, article, ul');
  let bestContainer = null;
  let maxScrollHeight = 0;

  candidates.forEach(el => {
      // 실제 내용이 넘쳐서 스크롤이 필요한 상태인지 확인
      if (el.scrollHeight > el.clientHeight && el.clientHeight > 50) {
          const style = window.getComputedStyle(el);
          // CSS 속성이 스크롤을 허용하는지 확인
          if (['auto', 'scroll'].includes(style.overflowY)) {
              // 가장 스크롤할 내용이 많은 영역을 선택
              if (el.scrollHeight > maxScrollHeight) {
                  maxScrollHeight = el.scrollHeight;
                  bestContainer = el;
              }
          }
      }
  });

  // 찾은 컨테이너를 부드럽게 스크롤
  if (bestContainer) {
    bestContainer.scrollTo({
        top: direction === 'up' ? 0 : bestContainer.scrollHeight,
        behavior: 'smooth'
    });
  }
}


// --- 이벤트 리스너 ---
window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    if (isDrawing) { isDrawing = false; path = []; stopDrawing(); }
    return;
  }
  if (e.button === 2) {
    isDrawing = true; startX = e.clientX; startY = e.clientY; path = [];
    prepareDrawing(e);
  }
}, true);

window.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  if (ctx) { ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); }
  const lastX = path.length > 0 ? path[path.length-1].x : startX;
  const lastY = path.length > 0 ? path[path.length-1].y : startY;
  const dx = e.clientX - lastX; const dy = e.clientY - lastY;
  if (Math.abs(dx) > MIN_DIST || Math.abs(dy) > MIN_DIST) {
    let direction = '';
    if (Math.abs(dx) > Math.abs(dy)) direction = dx > 0 ? 'R' : 'L';
    else direction = dy > 0 ? 'D' : 'U';
    if (path.length === 0 || path[path.length - 1].dir !== direction) {
      path.push({ dir: direction, x: e.clientX, y: e.clientY });
    }
  }
}, true);

window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && isDrawing) {
    e.preventDefault(); e.stopPropagation();
    isDrawing = false; stopDrawing();
    if (path.length > 0) {
      const gesture = path.map(p => p.dir).join('');
      
      // ★ 스크롤 동작은 이제 직접 실행, 나머지는 백그라운드로 요청 ★
      if (gesture === 'U') performSmartScroll('up');
      else if (gesture === 'D') performSmartScroll('down');
      else if (gesture === 'L') chrome.runtime.sendMessage({ action: "goBack" });
      else if (gesture === 'R') chrome.runtime.sendMessage({ action: "goForward" });
      else if (gesture === 'DU') chrome.runtime.sendMessage({ action: "refresh" });
      else if (gesture === 'UD') chrome.runtime.sendMessage({ action: "closeTab" });
      else if (gesture === 'UR') chrome.runtime.sendMessage({ action: "reopenTab" });
    }
  }
}, true);

window.addEventListener('contextmenu', (e) => {
  if (path.length > 0 || isDrawing) {
    e.preventDefault(); e.stopPropagation();
    isDrawing = false; stopDrawing();
  }
}, true);