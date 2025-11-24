let startX, startY;
let path = [];
let isDrawing = false;
const MIN_DIST = 20;
let canvas, ctx;

// ★ 핵심 수정: 방향 판정 임계값 대폭 완화 ★
// 0.65 -> 0.5 로 변경.
// 조금이라도 더 기울어진 방향으로 무조건 인정합니다. (가장 관대한 설정)
// 이미지처럼 기울어진 'ㅅ' 모양도 이제 'UD'로 인식될 것입니다.
const DOMINANCE_THRESHOLD = 0.5;


// --- 캔버스 관련 함수 (변경 없음) ---
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

// --- 스마트 스크롤 함수 (변경 없음) ---
function performSmartScroll(direction) {
  const startScrollY = window.scrollY;
  if (direction === 'up') window.scrollTo(0, 0);
  else window.scrollTo(0, document.body.scrollHeight);
  
  if (window.scrollY !== startScrollY || window.scrollY > 0 || document.body.scrollHeight > window.innerHeight) {
      // window 스크롤이 먹혔으면 통과
  }

  const candidates = document.querySelectorAll('div, main, section, article, ul');
  let bestContainer = null;
  let maxScrollHeight = 0;

  candidates.forEach(el => {
      if (el.scrollHeight > el.clientHeight && el.clientHeight > 50) {
          const style = window.getComputedStyle(el);
          if (['auto', 'scroll'].includes(style.overflowY)) {
              if (el.scrollHeight > maxScrollHeight) {
                  maxScrollHeight = el.scrollHeight;
                  bestContainer = el;
              }
          }
      }
  });

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

  const lastPoint = path.length > 0 ? path[path.length-1] : {x: startX, y: startY};
  const dx = e.clientX - lastPoint.x;
  const dy = e.clientY - lastPoint.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > MIN_DIST || absDy > MIN_DIST) {
    let direction = '';
    const totalMovement = absDx + absDy;

    // 임계값 0.5 적용: 45도 기준 조금이라도 더 큰 쪽으로 판정
    if (absDx / totalMovement > DOMINANCE_THRESHOLD) {
        direction = dx > 0 ? 'R' : 'L';
    } else if (absDy / totalMovement > DOMINANCE_THRESHOLD) {
        direction = dy > 0 ? 'D' : 'U';
    } else {
        // 정확히 45도(5:5 비율)인 경우만 여기로 빠짐 (거의 없음)
        return; 
    }
    
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
      console.log("Final Gesture:", gesture);

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