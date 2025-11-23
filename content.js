let startX, startY;
let path = [];
let isDrawing = false;
const MIN_DIST = 20;
let canvas, ctx;

// 캔버스 생성 함수
function createOverlayCanvas() {
  // 이미 생성되어 있으면 중단
  if (document.getElementById('mouse-gesture-canvas')) {
    canvas = document.getElementById('mouse-gesture-canvas');
    ctx = canvas.getContext('2d');
    return;
  }

  canvas = document.createElement('canvas');
  canvas.id = 'mouse-gesture-canvas';
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    pointerEvents: 'none', // 평소에는 클릭 통과
    display: 'none'
  });

  (document.documentElement || document.body).appendChild(canvas);
  ctx = canvas.getContext('2d');
  styleCanvas();
}

function styleCanvas() {
  if (!ctx) return;
  ctx.strokeStyle = '#800080'; // 보라색
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// 페이지 로드 시점 처리 (iframe 대응)
if (document.body) {
  createOverlayCanvas();
} else {
  window.addEventListener('DOMContentLoaded', createOverlayCanvas);
}

function prepareDrawing(e) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  styleCanvas(); // 리사이즈 시 스타일 초기화 방지

  canvas.style.display = 'block';
  
  // ★핵심: 드래그 중에는 캔버스가 모든 마우스 이벤트를 가로챔 (광고 간섭 방지)
  canvas.style.pointerEvents = 'auto'; 
  
  ctx.beginPath();
  ctx.moveTo(e.clientX, e.clientY);
}

function stopDrawing() {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) {
    canvas.style.display = 'none';
    canvas.style.pointerEvents = 'none'; // 다시 클릭 통과 상태로 복귀
  }
}

// --- 이벤트 리스너 ---

window.addEventListener('mousedown', (e) => {
  // 좌클릭(0) 시 취소
  if (e.button === 0) {
    if (isDrawing) {
      isDrawing = false;
      path = [];
      stopDrawing();
    }
    return;
  }

  // 우클릭(2) 시 시작
  if (e.button === 2) {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    path = [];
    prepareDrawing(e);
  }
}, true); // 캡처링 단계에서 이벤트 잡기

window.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;

  // 선 그리기
  if (ctx) {
    ctx.lineTo(e.clientX, e.clientY);
    ctx.stroke();
  }

  const lastX = path.length > 0 ? path[path.length-1].x : startX;
  const lastY = path.length > 0 ? path[path.length-1].y : startY;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;

  if (Math.abs(dx) > MIN_DIST || Math.abs(dy) > MIN_DIST) {
    let direction = '';
    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx > 0 ? 'R' : 'L';
    } else {
      direction = dy > 0 ? 'D' : 'U';
    }
    
    if (path.length === 0 || path[path.length - 1].dir !== direction) {
      path.push({ dir: direction, x: e.clientX, y: e.clientY });
    }
  }
}, true);

window.addEventListener('mouseup', (e) => {
  if (e.button === 2 && isDrawing) {
    // 이벤트 전파 막기 (메뉴 뜨는거 방지)
    e.preventDefault();
    e.stopPropagation();

    isDrawing = false;
    stopDrawing();

    if (path.length > 0) {
      const gesture = path.map(p => p.dir).join('');
      
      if (gesture === 'L') history.back();
      else if (gesture === 'R') history.forward();
      else if (gesture === 'U') window.scrollTo(0, 0);
      else if (gesture === 'D') window.scrollTo(0, document.body.scrollHeight);
      else if (gesture === 'DU') chrome.runtime.sendMessage({ action: "refresh" });
      else if (gesture === 'UD') chrome.runtime.sendMessage({ action: "closeTab" });
      else if (gesture === 'UR') chrome.runtime.sendMessage({ action: "reopenTab" });
    }
  }
}, true);

window.addEventListener('contextmenu', (e) => {
  // 제스처를 했다면 메뉴 무조건 막기
  if (path.length > 0 || isDrawing) {
    e.preventDefault();
    e.stopPropagation();
    isDrawing = false;
    stopDrawing();
  }
}, true);