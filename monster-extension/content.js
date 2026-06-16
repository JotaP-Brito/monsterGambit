// ---- Piece mapping to FEN ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

// ---- Detect board orientation ----
function isFlipped() {
  // chess.com adds 'flipped' class to the board when playing as Black
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board && board.classList.contains('flipped');
}

// ---- Build FEN from current board state ----
function getFEN() {
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

    // If the board is flipped, mirror both axes
    if (flipped) {
      col = 7 - col;
      row = 7 - row;
    }

    if (row < 0 || row > 7 || col < 0 || col > 7) return;
    board[row][col] = pieceMap[pieceClass];
  });

  let fen = '';
  for (let row = 0; row < 8; row++) {
    let empty = 0;
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === null) {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += board[row][col];
      }
    }
    if (empty > 0) fen += empty;
    if (row < 7) fen += '/';
  }

  // ---- Determine active side more robustly ----
  // Method 1: check active clock
  const whiteActive = document.querySelector('.clock-white.clock-active, [class*="clock"][class*="white"][class*="active"]');
  const blackActive = document.querySelector('.clock-black.clock-active, [class*="clock"][class*="black"][class*="active"]');

  let active = 'w';
  if (blackActive && !whiteActive) active = 'b';

  // Method 2 (fallback): count pieces on board — fewer pieces = more moves played.
  // If an even number of half-moves happened, it's White's turn.
  // We can't know this reliably without move history, so Method 1 is best effort.

  // Castling: use '-' since we cannot reliably detect rights from DOM alone.
  // This avoids illegal castling suggestions mid-game.
  fen += ` ${active} - - 0 1`;
  return fen;
}

// ---- Overlay ----
function showOverlay(text) {
  let overlay = document.getElementById('monster-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'monster-overlay';
    overlay.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: rgba(0,0,0,0.85); color: #fff;
      padding: 12px 24px; border-radius: 8px;
      font-size: 22px; z-index: 9999;
      display: flex; align-items: center; gap: 12px;
      pointer-events: auto;
    `;

    const label = document.createElement('span');
    label.id = 'monster-label';
    label.textContent = 'Best move: …';

    const btn = document.createElement('button');
    btn.textContent = '🔄';
    btn.title = 'Refresh best move';
    btn.style.cssText = `
      background: #4CAF50; border: none; color: white;
      padding: 5px 12px; border-radius: 4px; cursor: pointer;
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      scheduleUpdate(0); // immediate on manual click
    });

    overlay.appendChild(label);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
  }

  // Update only the label, NOT the whole overlay — avoids re-triggering MutationObserver
  const label = document.getElementById('monster-label');
  if (label) label.textContent = 'Best move: ' + text;
}

// ---- Debounced update logic ----
let debounceTimer = null;
let lastFEN = null;
let requestInFlight = false;

function scheduleUpdate(delay = 400) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doUpdate, delay);
}

async function doUpdate() {
  if (requestInFlight) return; // don't pile up requests

  let fen;
  try {
    fen = getFEN();
  } catch (e) {
    console.error('MonsterGambit: getFEN error', e);
    return;
  }

  // Skip if the position hasn't changed
  if (fen === lastFEN) return;
  lastFEN = fen;

  requestInFlight = true;
  showOverlay('thinking…');

  chrome.runtime.sendMessage({ type: 'getMove', fen, time: 0.5 }, (response) => {
    requestInFlight = false;

    if (chrome.runtime.lastError) {
      console.warn('MonsterGambit message error:', chrome.runtime.lastError.message);
      showOverlay('⚠ Extension error');
      return;
    }

    if (response && response.move) {
      showOverlay(response.move);
    } else {
      showOverlay('⚠ No move');
    }
  });
}

// ---- Watch for board changes ----
// Observe only the board element, not the whole body, to reduce noise
function startObserver() {
  const target = document.querySelector('chess-board') ||
                 document.querySelector('.board') ||
                 document.body;

  const observer = new MutationObserver(() => {
    scheduleUpdate(400); // debounce: wait 400ms after last DOM change
  });

  observer.observe(target, { childList: true, subtree: true, attributes: true });
}

// ---- Init ----
scheduleUpdate(500);        // initial move on page load
startObserver();            // watch for opponent moves
setInterval(() => scheduleUpdate(0), 3000); // safety fallback poll every 3s