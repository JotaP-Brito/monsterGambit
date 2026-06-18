// ---- Piece mapping to FEN ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

// ---- Global state ----
let autoPlayEnabled = false;
let autoPlayTimeout = null;
let selectedMove = null;
let thinkingStart = null;
let lastFEN = null;
let userColor = null;        // 'w' or 'b' (detected once)

// ---- Detect user's color from the board ----
function detectUserColor() {
  // Look at the piece on a1 (if board not flipped) or h8 (if flipped)
  const flipped = isFlipped();
  const squares = document.querySelectorAll('.piece');
  for (const piece of squares) {
    const classes = [...piece.classList];
    const pieceClass = classes.find(c => pieceMap[c]);
    const squareClass = classes.find(c => c.startsWith('square-'));
    if (!pieceClass || !squareClass) continue;
    const square = squareClass.replace('square-', '');
    if (square.length < 2) continue;
    let col = parseInt(square[0]) - 1;
    let row = 8 - parseInt(square[1]);
    if (flipped) { col = 7 - col; row = 7 - row; }
    // Check bottom row (row 0) – the user's home row
    if (row === 0 && col === 0) { // a1 square
      return pieceMap[pieceClass] === pieceMap[pieceClass].toUpperCase() ? 'w' : 'b';
    }
  }
  // Fallback: if not found, assume white
  return 'w';
}

function isFlipped() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board && board.classList.contains('flipped');
}

function isUserTurn() {
  // 1) Last-move highlight detection (most reliable)
  const highlights = document.querySelectorAll('.highlight, [class*="highlight"], .last-move, [class*="last-move"]');
  for (const hl of highlights) {
    // Check if this highlight contains a piece
    const piece = hl.querySelector('.piece') || hl.closest('.square')?.querySelector('.piece');
    if (piece) {
      const classes = [...piece.classList];
      const pieceClass = classes.find(c => pieceMap[c]);
      if (pieceClass) {
        const color = pieceMap[pieceClass] === pieceMap[pieceClass].toUpperCase() ? 'w' : 'b';
        // If the piece is the opponent's color, then opponent just moved → our turn
        if (userColor && color !== userColor) {
          return true;
        }
      }
    }
  }

  // 2) Fallback: active clock
  const whiteActive = document.querySelector('.clock-white.clock-active, [class*="clock"][class*="white"][class*="active"]');
  const blackActive = document.querySelector('.clock-black.clock-active, [class*="clock"][class*="black"][class*="active"]');
  if (userColor === 'w' && whiteActive) return true;
  if (userColor === 'b' && blackActive) return true;

  return false;
}

// ---- Build FEN ----
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

  // Active color – we don't really use it in auto‑play logic anymore, but keep for completeness
  const whiteActive = document.querySelector('.clock-white.clock-active, [class*="clock"][class*="white"][class*="active"]');
  const blackActive = document.querySelector('.clock-black.clock-active, [class*="clock"][class*="black"][class*="active"]');
  let active = 'w';
  if (blackActive && !whiteActive) active = 'b';
  fen += ` ${active} - - 0 1`;
  return fen;
}

// ---- Humanized move selector (unchanged) ----
function parseScore(scoreStr) {
  if (scoreStr.startsWith('M')) {
    const mateIn = parseInt(scoreStr.slice(1));
    return mateIn > 0 ? 100 - mateIn : -100 - mateIn;
  }
  return parseFloat(scoreStr) || 0;
}

function isNaturalMove(uci) {
  if (uci === 'e1g1' || uci === 'e1c1' || uci === 'e8g8' || uci === 'e8c8') return true;
  const from = uci.substring(0,2);
  const to = uci.substring(2,4);
  if ('abcdefgh'.indexOf(from[0]) !== -1 && from[1] === '1' && to[1] !== '1') return true;
  if ('abcdefgh'.indexOf(from[0]) !== -1 && from[1] === '8' && to[1] !== '8') return true;
  return false;
}

function selectHumanMove(moves, fen) {
  if (!moves || moves.length === 0) return -1;
  if (moves.length === 1) return 0;
  const scores = moves.map(m => parseScore(m.score));
  const bestScore = scores[0];
  if (moves[0].score.startsWith('M') && bestScore > 50) return 0;
  const threshold = 0.3;
  const candidates = [];
  for (let i = 0; i < scores.length; i++) {
    if (bestScore - scores[i] <= threshold) candidates.push(i);
  }
  if (Math.random() < 0.15 && scores.length > 1 && bestScore - scores[1] <= 1.0) {
    if (!candidates.includes(1)) candidates.push(1);
  }
  for (let i = 0; i < moves.length; i++) {
    if (bestScore - scores[i] <= 0.5 && isNaturalMove(moves[i].uci)) {
      if (!candidates.includes(i)) candidates.push(i);
    }
  }
  if (Math.random() < 0.05 && moves.length > 1 && bestScore - scores[1] <= 1.5) {
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

// ---- Thinking time ----
function countPieces(fen) {
  return fen.split(' ')[0].replace(/[\/0-9]/g, '').length;
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
  if (phase === 'opening') { baseMin = 1.0; baseMax = 3.0; }
  else if (phase === 'middlegame') { baseMin = 2.0; baseMax = 8.0; }
  else { baseMin = 1.0; baseMax = 5.0; }
  if (evaluationScore <= -2.0) { baseMin += 1.5; baseMax += 3.0; }
  return Math.round((baseMin + Math.random() * (baseMax - baseMin)) * 1000);
}

// ---- Move execution (unchanged) ----
function getSquareCenter(square) { /* ... same as before ... */
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

async function tryBoardAPI(from, to) { /* unchanged */ }
async function tryTextInput(from, to) { /* unchanged */ }
async function tryDragMove(from, to) { /* unchanged */ }

async function playMove(uci, displayText) {
  const from = uci.substring(0,2), to = uci.substring(2,4);
  console.log(`MonsterGambit: playing ${from}→${to}`);
  updateStatus(`Playing ${displayText || uci}...`);
  if (await tryBoardAPI(from, to)) { console.log('Move via board API'); }
  else if (await tryTextInput(from, to)) { console.log('Move via text input'); }
  else {
    console.log('Fallback to drag');
    await tryDragMove(from, to);
    await new Promise(r => setTimeout(r, 500));
    if (lastFEN === getFEN()) {
      console.log('Move not registered, retrying API...');
      await tryBoardAPI(from, to);
    }
  }
  setTimeout(() => updateStatus(null), 2000);
}

function updateStatus(msg) {
  const statusEl = document.getElementById('monster-status');
  if (statusEl) {
    statusEl.textContent = msg || '';
    statusEl.style.display = msg ? 'block' : 'none';
  }
}

// ---- Auto‑play scheduling ----
function scheduleAutoPlay(moveUci, thinkTime, moveDisplay) {
  cancelAutoPlay();
  thinkingStart = Date.now();
  selectedMove = moveUci;
  updateAutoPlayCountdown(thinkTime, moveDisplay);
  autoPlayTimeout = setTimeout(() => {
    if (selectedMove === moveUci && isUserTurn()) {
      playMove(moveUci, moveDisplay);
      selectedMove = null;
      thinkingStart = null;
      updateAutoPlayCountdown(null);
    } else {
      cancelAutoPlay('Turn changed unexpectedly');
    }
  }, thinkTime);
}

function cancelAutoPlay(reason) {
  if (autoPlayTimeout) { clearTimeout(autoPlayTimeout); autoPlayTimeout = null; }
  selectedMove = null; thinkingStart = null;
  updateAutoPlayCountdown(null);
  if (reason) updateStatus(`⚠ Auto-play cancelled: ${reason}`);
}

function updateAutoPlayCountdown(delayMs, moveDisplay) {
  const movesDiv = document.getElementById('monster-moves');
  if (!movesDiv) return;
  const old = document.getElementById('monster-autoplay-info');
  if (old) old.remove();
  if (delayMs && moveDisplay) {
    const div = document.createElement('div');
    div.id = 'monster-autoplay-info';
    div.style.cssText = 'padding: 6px 8px; background: rgba(76,175,80,0.2); border-radius: 4px; font-size: 13px; color: #4CAF50;';
    div.textContent = `⏳ Auto‑playing ${moveDisplay} in ${(delayMs/1000).toFixed(1)}s`;
    movesDiv.appendChild(div);
  }
}

// ---- Rich Overlay ----
function createOverlay() { /* unchanged */ }
function updateMovesDisplay(moves, chosenIndex) { /* unchanged */ }

// ---- Debounced update (with retry logic) ----
let debounceTimer = null;
let requestInFlight = false;
let retryCheckTurn = null;

function scheduleUpdate(delay = 400) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doUpdate, delay);
}

async function doUpdate() {
  if (requestInFlight) return;
  let fen;
  try { fen = getFEN(); } catch (e) { return; }
  if (fen === lastFEN) return;
  const previousFEN = lastFEN;
  lastFEN = fen;

  // If board changed while we were waiting to play, cancel
  if (autoPlayTimeout) {
    cancelAutoPlay('Opponent moved');
  }

  requestInFlight = true;
  createOverlay();
  updateMovesDisplay([{ san: '…', score: '' }], -1);

  chrome.runtime.sendMessage({ type: 'getMove', fen, time: 0.5, multipv: 3 }, (response) => {
    requestInFlight = false;
    if (chrome.runtime.lastError) {
      updateMovesDisplay([{ san: '⚠ Extension error', score: '' }], -1);
      return;
    }
    const moves = response?.moves || [];
    const chosenIndex = selectHumanMove(moves, fen);
    updateMovesDisplay(moves, chosenIndex);

    if (autoPlayEnabled && chosenIndex >= 0) {
      // Try to detect our turn; if uncertain, retry after a delay
      attemptAutoPlay(moves, chosenIndex, fen, 0);
    }
  });
}

function attemptAutoPlay(moves, chosenIndex, fen, retries) {
  if (!autoPlayEnabled) return;
  if (isUserTurn()) {
    const selected = moves[chosenIndex];
    const evalScore = parseScore(selected.score);
    const thinkTime = computeThinkTime(fen, evalScore);
    scheduleAutoPlay(selected.uci, thinkTime, selected.san);
    return;
  }
  // Turn not detected yet – wait a bit and try again (up to 3 times)
  if (retries < 3) {
    clearTimeout(retryCheckTurn);
    retryCheckTurn = setTimeout(() => {
      // Re‑evaluate FEN in case it changed
      const currentFen = getFEN();
      if (currentFen === fen) {  // board hasn't changed further
        attemptAutoPlay(moves, chosenIndex, currentFen, retries + 1);
      } // else board changed again, doUpdate will be triggered
    }, 600);
  } else {
    updateStatus('⚠ Could not detect turn');
  }
}

// ---- Observer ----
function startObserver() {
  const target = document.querySelector('chess-board') || document.querySelector('.board') || document.body;
  const observer = new MutationObserver(() => scheduleUpdate(400));
  observer.observe(target, { childList: true, subtree: true, attributes: true });
}

// ---- Init ----
userColor = detectUserColor();
console.log('MonsterGambit: detected user color =', userColor);
scheduleUpdate(500);
startObserver();
setInterval(() => scheduleUpdate(0), 3000);