// ---- Piece mapping to FEN ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

function isFlipped() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board && board.classList.contains('flipped');
}

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

// ---- Humanized move selector ----
function parseScore(scoreStr) {
  if (scoreStr.startsWith('M')) {
    const mateIn = parseInt(scoreStr.slice(1));
    return mateIn > 0 ? 100 - mateIn : -100 - mateIn;
  }
  return parseFloat(scoreStr) || 0;
}

function selectHumanMove(moves) {
  if (!moves || moves.length === 0) return -1;
  if (moves.length === 1) return 0;
  const scores = moves.map(m => parseScore(m.score));
  const bestScore = scores[0];
  if (moves[0].score.startsWith('M') && bestScore > 50) return 0;

  const threshold = 0.3;
  const candidates = [];
  for (let i = 0; i < scores.length; i++) {
    if (bestScore - scores[i] <= threshold) {
      candidates.push(i);
    }
  }
  if (Math.random() < 0.15 && scores.length > 1 && bestScore - scores[1] <= 1.0) {
    if (!candidates.includes(1)) candidates.push(1);
  }
  if (candidates.length === 0) return 0;
  const totalWeight = candidates.reduce((sum, idx) => sum + Math.max(scores[idx] + 1, 0.1), 0);
  let rand = Math.random() * totalWeight;
  for (const idx of candidates) {
    const weight = Math.max(scores[idx] + 1, 0.1);
    rand -= weight;
    if (rand <= 0) return idx;
  }
  return candidates[0];
}

// ---- Auto-play simulation ----
function getSquareCenter(square) {
  // square format: "e2" -> file: 'e', rank: '2'
  const file = square.charCodeAt(0) - 97; // 0-7
  const rank = 8 - parseInt(square[1]);    // 0-7 from top
  const boardEl = document.querySelector('chess-board') || document.querySelector('.board');
  if (!boardEl) return null;
  const rect = boardEl.getBoundingClientRect();
  const squareSize = rect.width / 8;
  // chess.com board coordinates start from top-left? Usually they are oriented with white at bottom.
  // If board is flipped, we need to mirror.
  const flipped = isFlipped();
  let x, y;
  if (flipped) {
    x = rect.left + (7 - file) * squareSize + squareSize / 2;
    y = rect.top + (7 - rank) * squareSize + squareSize / 2;
  } else {
    x = rect.left + file * squareSize + squareSize / 2;
    y = rect.top + rank * squareSize + squareSize / 2;
  }
  return { x, y };
}

function simulateDragDrop(fromUci, toUci) {
  // fromUci: "e2", toUci: "e4"
  const from = getSquareCenter(fromUci);
  const to = getSquareCenter(toUci);
  if (!from || !to) return false;

  const target = document.elementFromPoint(from.x, from.y) || document.body;
  // mouse down
  target.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, view: window,
    clientX: from.x, clientY: from.y, button: 0
  }));
  // mouse move to target
  const moveEvent = new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, view: window,
    clientX: to.x, clientY: to.y, button: 0
  });
  document.dispatchEvent(moveEvent);
  // mouse up
  const targetEnd = document.elementFromPoint(to.x, to.y) || document.body;
  targetEnd.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, view: window,
    clientX: to.x, clientY: to.y, button: 0
  }));
  return true;
}

function playMove(uci) {
  // uci is like "e2e4"
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  console.log(`MonsterGambit: playing ${from} → ${to}`);
  simulateDragDrop(from, to);
}

// ---- Rich Overlay with Play buttons ----
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
    min-width: 260px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.6);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255,255,255,0.1);
  `;

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

  const movesDiv = document.createElement('div');
  movesDiv.id = 'monster-moves';
  movesDiv.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
  overlay.appendChild(movesDiv);

  document.body.appendChild(overlay);
  return overlay;
}

function updateMovesDisplay(moves, chosenIndex) {
  const movesDiv = document.getElementById('monster-moves');
  if (!movesDiv) return;

  movesDiv.innerHTML = '';
  if (!moves || moves.length === 0) {
    movesDiv.innerHTML = '<div style="color:#aaa;">No move available</div>';
    return;
  }

  moves.forEach((move, index) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 4px 8px; border-radius: 6px;';

    if (index === chosenIndex) {
      row.style.background = 'rgba(76,175,80,0.2)';
      row.style.border = '1px solid #4CAF50';
    }

    const badge = document.createElement('span');
    badge.textContent = `#${index + 1}`;
    badge.style.cssText = `
      font-size: 12px; font-weight: bold; color: #FFD700;
      background: rgba(255,215,0,0.2); padding: 2px 8px; border-radius: 4px;
    `;
    row.appendChild(badge);

    if (index === chosenIndex) {
      const star = document.createElement('span');
      star.textContent = '✅';
      star.style.cssText = 'font-size: 16px;';
      row.appendChild(star);
    }

    const moveText = document.createElement('span');
    moveText.textContent = move.san;
    moveText.style.cssText = `font-size: 18px; font-weight: ${index === chosenIndex ? '700' : '500'}; color: #fff;`;
    row.appendChild(moveText);

    // Score
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = move.score;
    scoreSpan.style.cssText = 'font-size: 14px; color: #aaa; margin-left: auto;';
    if (move.score.startsWith('+') || move.score.startsWith('M')) {
      scoreSpan.style.color = '#4CAF50';
    } else if (move.score.startsWith('-')) {
      scoreSpan.style.color = '#f44336';
    }
    row.appendChild(scoreSpan);

    // Play button
    const playBtn = document.createElement('button');
    playBtn.textContent = '▶️ Play';
    playBtn.title = 'Auto-play this move';
    playBtn.style.cssText = `
      background: #2196F3; border: none; color: white;
      padding: 2px 8px; border-radius: 4px; cursor: pointer;
      font-size: 12px; margin-left: 4px;
    `;
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Play ${move.san}?`)) {
        playMove(move.uci);
      }
    };
    row.appendChild(playBtn);

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
  createOverlay();
  updateMovesDisplay([{ san: '…', score: '' }], -1);

  chrome.runtime.sendMessage({ type: 'getMove', fen, time: 0.5, multipv: 3 }, (response) => {
    requestInFlight = false;
    if (chrome.runtime.lastError) {
      console.warn('MonsterGambit message error:', chrome.runtime.lastError.message);
      updateMovesDisplay([{ san: '⚠ Extension error', score: '' }], -1);
      return;
    }
    const moves = response?.moves || [];
    const chosenIndex = selectHumanMove(moves);
    updateMovesDisplay(moves, chosenIndex);
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