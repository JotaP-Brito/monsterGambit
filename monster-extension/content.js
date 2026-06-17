// ---- Piece mapping to FEN (unchanged) ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

function isFlipped() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board && board.classList.contains('flipped');
}

function getFEN() {
  // ... (same FEN logic as before, with flipped support) ...
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const flipped = isFlipped();
  document.querySelectorAll('.piece').forEach(piece => {
    const classes = [...piece.classList];
    const pieceClass = classes.find(c => pieceMap[c]);
    if (!pieceClass) return;
    const squareClass = classes.find(c => c.startsWith('square-'));
    if (!squareClass) return;
    const square = squareClass.replace('square-', '');
    if (square.length < 2) return;
    let col = parseInt(square[0]) - 1;
    let row = 8 - parseInt(square[1]);
    if (flipped) { col = 7 - col; row = 7 - row; }
    if (row < 0 || row > 7 || col < 0 || col > 7) return;
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
  const whiteActive = document.querySelector('.clock-white.clock-active, [class*="clock"][class*="white"][class*="active"]');
  const blackActive = document.querySelector('.clock-black.clock-active, [class*="clock"][class*="black"][class*="active"]');
  let active = 'w';
  if (blackActive && !whiteActive) active = 'b';
  fen += ` ${active} - - 0 1`;
  return fen;
}

// ---- Rich Overlay ----
function createOverlay() {
  let overlay = document.getElementById('monster-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'monster-overlay';
  overlay.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background: rgba(0,0,0,0.9); color: #fff;
    padding: 16px; border-radius: 12px;
    font-family: 'Segoe UI', Arial, sans-serif;
    z-index: 9999;
    min-width: 220px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.6);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255,255,255,0.1);
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'font-size: 14px; font-weight: bold; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;';
  header.innerHTML = '<span>🧠 MonsterGambit</span>';
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄';
  refreshBtn.title = 'Refresh analysis';
  refreshBtn.style.cssText = 'background: #4CAF50; border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;';
  refreshBtn.onclick = (e) => { e.stopPropagation(); doUpdate(); };
  header.appendChild(refreshBtn);
  overlay.appendChild(header);

  // Moves container
  const movesDiv = document.createElement('div');
  movesDiv.id = 'monster-moves';
  movesDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
  overlay.appendChild(movesDiv);

  document.body.appendChild(overlay);
  return overlay;
}

function updateMovesDisplay(moves) {
  const movesDiv = document.getElementById('monster-moves');
  if (!movesDiv) return;

  movesDiv.innerHTML = '';
  if (!moves || moves.length === 0) {
    movesDiv.innerHTML = '<div style="color:#aaa;">No move available</div>';
    return;
  }

  moves.forEach((move, index) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 10px;';

    // Rank badge
    const badge = document.createElement('span');
    badge.textContent = `#${index + 1}`;
    badge.style.cssText = `
      font-size: 12px; font-weight: bold; color: #FFD700;
      background: rgba(255,215,0,0.2); padding: 2px 8px; border-radius: 4px;
    `;
    row.appendChild(badge);

    // Move notation
    const moveText = document.createElement('span');
    moveText.textContent = move.san;
    moveText.style.cssText = 'font-size: 18px; font-weight: 600; color: #fff;';
    row.appendChild(moveText);

    // Score
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = move.score;
    scoreSpan.style.cssText = 'font-size: 14px; color: #aaa; margin-left: auto;';
    // Color code score
    if (move.score.startsWith('+') || move.score.startsWith('M')) {
      scoreSpan.style.color = '#4CAF50'; // green for positive/forced mate
    } else if (move.score.startsWith('-')) {
      scoreSpan.style.color = '#f44336'; // red for negative
    }
    row.appendChild(scoreSpan);

    movesDiv.appendChild(row);
  });
}

// ---- Debounced update ----
let debounceTimer = null;
let lastFEN = null;
let requestInFlight = false;

function scheduleUpdate(delay = 400) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doUpdate, delay);
}

async function doUpdate() {
  if (requestInFlight) return;
  let fen;
  try {
    fen = getFEN();
  } catch (e) {
    console.error('MonsterGambit getFEN error:', e);
    return;
  }
  if (fen === lastFEN) return;
  lastFEN = fen;

  requestInFlight = true;
  // Ensure overlay exists
  createOverlay();
  updateMovesDisplay([{ san: '…', score: '' }]); // thinking indicator

  chrome.runtime.sendMessage({ type: 'getMove', fen, time: 0.5, multipv: 3 }, (response) => {
    requestInFlight = false;
    if (chrome.runtime.lastError) {
      console.warn('MonsterGambit message error:', chrome.runtime.lastError.message);
      updateMovesDisplay([{ san: '⚠ Extension error', score: '' }]);
      return;
    }
    if (response && response.moves) {
      updateMovesDisplay(response.moves);
    } else {
      updateMovesDisplay([{ san: '⚠ No data', score: '' }]);
    }
  });
}

// ---- Observer ----
function startObserver() {
  const target = document.querySelector('chess-board') ||
                 document.querySelector('.board') ||
                 document.body;
  const observer = new MutationObserver(() => scheduleUpdate(400));
  observer.observe(target, { childList: true, subtree: true, attributes: true });
}

// ---- Init ----
scheduleUpdate(500);
startObserver();
setInterval(() => scheduleUpdate(0), 3000);