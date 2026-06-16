// ---- Piece → FEN mapping (unchanged) ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

function getFEN() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  document.querySelectorAll('.piece').forEach(piece => {
    const classes = piece.className.split(' ');
    let pieceClass = classes.find(c => pieceMap[c]);
    if (!pieceClass) return;
    const squareClass = classes.find(c => c.startsWith('square-'));
    if (!squareClass) return;
    const square = squareClass.replace('square-', '');
    const col = parseInt(square[0]) - 1;
    const row = 8 - parseInt(square[1]);
    board[row][col] = pieceMap[pieceClass];
  });

  let fen = '';
  for (let row = 0; row < 8; row++) {
    let empty = 0;
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === null) empty++;
      else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += board[row][col];
      }
    }
    if (empty > 0) fen += empty;
    if (row < 7) fen += '/';
  }

  const whiteActive = document.querySelector('.clock-white.clock-active');
  const blackActive = document.querySelector('.clock-black.clock-active');
  let active = 'w';
  if (blackActive && !whiteActive) active = 'b';
  fen += ` ${active} KQkq - 0 1`;
  return fen;
}

// ---- Persistent connection to background ----
let port = chrome.runtime.connect({ name: 'chess' });

port.onMessage.addListener(msg => {
  if (msg.move) showOverlay(msg.move);
});

port.onDisconnect.addListener(() => {
  // Reconnect if the background script restarts
  setTimeout(() => {
    port = chrome.runtime.connect({ name: 'chess' });
    port.onMessage.addListener(msg => {
      if (msg.move) showOverlay(msg.move);
    });
    updateMove(); // trigger update after reconnect
  }, 1000);
});

function sendFenToBackground(fen) {
  try {
    port.postMessage({ type: 'getMove', fen });
  } catch (e) {
    console.warn('Failed to send message, will retry');
  }
}

// ---- Overlay ----
function showOverlay(text) {
  let overlay = document.getElementById('monster-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'monster-overlay';
    overlay.style.cssText = `
      position:fixed; bottom:20px; right:20px; background:rgba(0,0,0,0.85); color:#fff;
      padding:12px 24px; border-radius:8px; font-size:22px; z-index:9999;
      display:flex; align-items:center; gap:12px;
    `;
    const btn = document.createElement('button');
    btn.textContent = '🔄';
    btn.style.cssText = 'background:#4CAF50; border:none; color:white; padding:5px 12px; border-radius:4px; cursor:pointer;';
    btn.onclick = updateMove;
    overlay.appendChild(document.createTextNode(''));
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }
  overlay.childNodes[0].textContent = 'Best move: ' + text;
}

// ---- Update move ----
async function updateMove() {
  const fen = getFEN();
  sendFenToBackground(fen);
}

// ---- Observer + polling ----
updateMove();
const observer = new MutationObserver(updateMove);
observer.observe(document.body, { childList: true, subtree: true });
setInterval(updateMove, 2000);