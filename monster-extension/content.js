// ---- Piece mapping to FEN ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

// ---- Global state ----
let autoPlayEnabled = false;
let autoPlayTimeout = null;
let selectedMove = null;       // the chosen UCI move to be played
let thinkingStart = null;      // timestamp when thinking started (for countdown)

function isFlipped() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board && board.classList.contains('flipped');
}

function isUserWhite() {
  // If the board is flipped (we see black at bottom), the user is playing Black.
  return !isFlipped();
}

function isUserTurn() {
  const fen = getFEN();
  const activeColor = fen.split(' ')[1];
  return (isUserWhite() && activeColor === 'w') || (!isUserWhite() && activeColor === 'b');
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

// ---- Humanized move selector (improved) ----
function parseScore(scoreStr) {
  if (scoreStr.startsWith('M')) {
    const mateIn = parseInt(scoreStr.slice(1));
    return mateIn > 0 ? 100 - mateIn : -100 - mateIn;
  }
  return parseFloat(scoreStr) || 0;
}

function isNaturalMove(uci, fen) {
  // Define some human‑preferred moves:
  // - Castling kingside/queenside
  // - Developing a knight or bishop from the back rank
  // - Recapturing on the same square where a piece was just taken (not implemented, simple version)
  if (uci === 'e1g1' || uci === 'e1c1' || uci === 'e8g8' || uci === 'e8c8') return true;
  // Developing moves: piece from 1st rank (or 8th for black) to a non‑back rank
  const from = uci.substring(0,2);
  const to = uci.substring(2,4);
  if ('abcdefgh'.indexOf(from[0]) !== -1 && from[1] === '1' && to[1] !== '1') return true; // white piece from rank 1
  if ('abcdefgh'.indexOf(from[0]) !== -1 && from[1] === '8' && to[1] !== '8') return true; // black piece from rank 8
  return false;
}

function selectHumanMove(moves, fen) {
  if (!moves || moves.length === 0) return -1;
  if (moves.length === 1) return 0;

  const scores = moves.map(m => parseScore(m.score));
  const bestScore = scores[0];

  // If forced mate, always suggest it (humans see obvious mates)
  if (moves[0].score.startsWith('M') && bestScore > 50) return 0;

  // Collect candidates within 0.3 pawns of best
  const threshold = 0.3;
  const candidates = [];
  for (let i = 0; i < scores.length; i++) {
    if (bestScore - scores[i] <= threshold) candidates.push(i);
  }

  // Occasionally (15%) include second move even if slightly worse (up to -1.0)
  if (Math.random() < 0.15 && scores.length > 1 && bestScore - scores[1] <= 1.0) {
    if (!candidates.includes(1)) candidates.push(1);
  }

  // Boost natural moves: if a natural move is within 0.5 of best, add it
  for (let i = 0; i < moves.length; i++) {
    if (bestScore - scores[i] <= 0.5 && isNaturalMove(moves[i].uci, fen)) {
      if (!candidates.includes(i)) candidates.push(i);
    }
  }

  // Occasionally (5%) deliberately choose a slightly worse but non‑terrible move (within -1.5)
  if (Math.random() < 0.05 && moves.length > 1 && bestScore - scores[1] <= 1.5) {
    if (!candidates.includes(1)) candidates.push(1);
  }

  if (candidates.length === 0) return 0;

  // Weighted random selection
  const totalWeight = candidates.reduce((sum, idx) => sum + Math.max(scores[idx] + 1, 0.1), 0);
  let rand = Math.random() * totalWeight;
  for (const idx of candidates) {
    const weight = Math.max(scores[idx] + 1, 0.1);
    rand -= weight;
    if (rand <= 0) return idx;
  }
  return candidates[0];
}

// ---- Thinking time emulation ----
function countPieces(fen) {
  const placement = fen.split(' ')[0];
  return placement.replace(/[\/0-9]/g, '').length;
}

function estimateComplexity(fen) {
  const pieces = countPieces(fen);
  if (pieces > 28) return 'opening';
  if (pieces > 12) return 'middlegame';
  return 'endgame';
}

function computeThinkTime(fen, evaluationScore) {
  const phase = estimateComplexity(fen);
  let baseMin, baseMax;

  // Base thinking time ranges (in seconds)
  if (phase === 'opening') {
    baseMin = 1.0; baseMax = 3.0;   // quick in opening (mostly theory)
  } else if (phase === 'middlegame') {
    baseMin = 2.0; baseMax = 8.0;   // longer in complex middlegame
  } else {
    baseMin = 1.0; baseMax = 5.0;   // endgame can be quick or slow
  }

  // Adjust for evaluation: if the position is very bad (<= -2), take longer
  if (evaluationScore <= -2.0) {
    baseMin += 1.5;
    baseMax += 3.0;
  }

  // Add random jitter
  const delay = baseMin + Math.random() * (baseMax - baseMin);
  return Math.round(delay * 1000); // in milliseconds
}

// ---- Move execution ----
function getSquareCenter(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  const boardEl = document.querySelector('chess-board') || document.querySelector('.board');
  if (!boardEl) return null;
  const rect = boardEl.getBoundingClientRect();
  const squareSize = rect.width / 8;
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
  const from = getSquareCenter(fromUci);
  const to = getSquareCenter(toUci);
  if (!from || !to) return false;
  const target = document.elementFromPoint(from.x, from.y) || document.body;
  target.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, view: window,
    clientX: from.x, clientY: from.y, button: 0
  }));
  const moveEvent = new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, view: window,
    clientX: to.x, clientY: to.y, button: 0
  });
  document.dispatchEvent(moveEvent);
  const targetEnd = document.elementFromPoint(to.x, to.y) || document.body;
  targetEnd.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, view: window,
    clientX: to.x, clientY: to.y, button: 0
  }));
  return true;
}

function playMove(uci) {
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  console.log(`MonsterGambit: playing ${from} → ${to}`);
  simulateDragDrop(from, to);
}

// ---- Auto‑play scheduling ----
function scheduleAutoPlay(moveUci, thinkTime) {
  cancelAutoPlay();
  thinkingStart = Date.now();
  selectedMove = moveUci;
  // Update overlay with countdown
  updateThinkingIndicator(thinkTime);
  autoPlayTimeout = setTimeout(() => {
    if (selectedMove === moveUci) { // still same move planned
      playMove(moveUci);
      selectedMove = null;
      thinkingStart = null;
    }
  }, thinkTime);
}

function cancelAutoPlay() {
  if (autoPlayTimeout) {
    clearTimeout(autoPlayTimeout);
    autoPlayTimeout = null;
  }
  selectedMove = null;
  thinkingStart = null;
  updateThinkingIndicator(null);
}

function updateThinkingIndicator(delayMs) {
  const movesDiv = document.getElementById('monster-moves');
  if (!movesDiv) return;
  // Remove any previous thinking line
  const old = document.getElementById('monster-thinking');
  if (old) old.remove();
  if (delayMs && selectedMove) {
    const thinkDiv = document.createElement('div');
    thinkDiv.id = 'monster-thinking';
    thinkDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 4px 8px; color: #4CAF50; font-size: 14px;';
    thinkDiv.innerHTML = `<span>⏳ Auto‑playing ${selectedMove.substring(0,2)}→${selectedMove.substring(2,4)} in ${(delayMs/1000).toFixed(1)}s</span>`;
    movesDiv.appendChild(thinkDiv);
  }
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
    min-width: 260px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.6);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255,255,255,0.1);
  `;

  const header = document.createElement('div');
  header.style.cssText = 'font-size: 14px; font-weight: bold; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = '🧠 MonsterGambit';
  header.appendChild(titleSpan);

  // Auto‑play toggle
  const autoBtn = document.createElement('button');
  autoBtn.id = 'monster-autoplay-btn';
  autoBtn.textContent = autoPlayEnabled ? '🤖 Auto ON' : '🤖 Auto OFF';
  autoBtn.title = 'Toggle auto‑play';
  autoBtn.style.cssText = `
    background: ${autoPlayEnabled ? '#4CAF50' : '#555'};
    border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 13px;
  `;
  autoBtn.onclick = (e) => {
    e.stopPropagation();
    autoPlayEnabled = !autoPlayEnabled;
    autoBtn.textContent = autoPlayEnabled ? '🤖 Auto ON' : '🤖 Auto OFF';
    autoBtn.style.background = autoPlayEnabled ? '#4CAF50' : '#555';
    if (!autoPlayEnabled) cancelAutoPlay();
  };
  header.appendChild(autoBtn);

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄';
  refreshBtn.title = 'Refresh analysis';
  refreshBtn.style.cssText = 'background: #2196F3; border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;';
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
    playBtn.title = 'Play this move manually';
    playBtn.style.cssText = `
      background: #555; border: none; color: white;
      padding: 2px 8px; border-radius: 4px; cursor: pointer;
      font-size: 12px; margin-left: 4px;
    `;
    playBtn.onclick = (e) => {
      e.stopPropagation();
      playMove(move.uci);
    };
    row.appendChild(playBtn);

    movesDiv.appendChild(row);
  });

  // If auto‑play is in progress, re‑append the thinking indicator
  if (selectedMove && autoPlayTimeout) {
    const remaining = thinkingStart ? Math.max(0, thinkingStart + (autoPlayTimeout._idleTimeout || 0) - Date.now()) : 0;
    updateThinkingIndicator(remaining > 0 ? remaining : null);
  }
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

  // Cancel any pending auto‑play if the position changed (e.g., opponent moved)
  if (autoPlayTimeout) {
    cancelAutoPlay();
  }

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
    const chosenIndex = selectHumanMove(moves, fen);
    updateMovesDisplay(moves, chosenIndex);

    // Auto‑play if enabled and it's the user's turn
    if (autoPlayEnabled && chosenIndex >= 0 && isUserTurn()) {
      const selected = moves[chosenIndex];
      const evalScore = parseScore(selected.score);
      const thinkTime = computeThinkTime(fen, evalScore);
      scheduleAutoPlay(selected.uci, thinkTime);
    } else {
      cancelAutoPlay();
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