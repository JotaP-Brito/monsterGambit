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
let lastMoveTime = 0;

function isFlipped() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board && board.classList.contains('flipped');
}

function isUserWhite() {
  return !isFlipped();
}

function isUserTurn() {
  const fen = getFEN();
  if (!fen) return false;
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
  // Active color detection: find the clock that is running (chess.com adds a "clock-running" class or similar)
  const runningClock = document.querySelector('.clock-running, [class*="clock"][class*="running"]');
  let active = 'w';
  if (runningClock) {
    active = runningClock.classList.contains('clock-white') || runningClock.classList.contains('player-top') ? 'w' : 'b';
  } else {
    // fallback: check which clock is not paused
    const whiteClock = document.querySelector('.clock-white');
    const blackClock = document.querySelector('.clock-black');
    if (whiteClock && blackClock) {
      active = whiteClock.classList.contains('clock-active') ? 'w' : 'b';
    }
  }
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

async function tryBoardAPI(from, to) {
  const boardEl = document.querySelector('chess-board');
  if (!boardEl) return false;
  // chess.com stores the Chess instance as boardEl.game or boardEl.chess or window.chess
  const chess = boardEl.game || boardEl.chess || window.chess;
  if (chess && typeof chess.move === 'function') {
    chess.move({ from, to, promotion: 'q' });
    return true;
  }
  return false;
}

async function tryTextInput(from, to) {
  // chess.com's move input: hidden by default, becomes visible when you start typing
  const inputSelectors = [
    'input[class*="move"]',
    'input[placeholder*="move" i]',
    'input[placeholder*="Move" i]',
    '#move-input',
    '.move-input'
  ];
  let input = null;
  for (const sel of inputSelectors) {
    input = document.querySelector(sel);
    if (input) break;
  }
  if (!input) return false;

  const move = from + to;
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
  input.value = move;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // Dispatch Enter key
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  return true;
}

async function tryDragMove(from, to) {
  const fromPos = getSquareCenter(from);
  const toPos = getSquareCenter(to);
  if (!fromPos || !toPos) return false;

  // Get the piece element at the source square (important for flipped boards)
  const piece = document.elementFromPoint(fromPos.x, fromPos.y);
  if (!piece) return false;

  // Dispatch pointerdown on the piece
  piece.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, view: window,
    clientX: fromPos.x, clientY: fromPos.y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
  }));

  await new Promise(r => setTimeout(r, 30 + Math.random() * 70));

  // Move to target square
  const targetSquare = document.elementFromPoint(toPos.x, toPos.y) || document.body;
  targetSquare.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, cancelable: true, view: window,
    clientX: toPos.x, clientY: toPos.y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
  }));

  await new Promise(r => setTimeout(r, 20));

  // Release on target
  targetSquare.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, view: window,
    clientX: toPos.x, clientY: toPos.y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
  }));
  return true;
}

async function playMove(uci, displayText) {
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  console.log(`MonsterGambit: playing ${from}→${to}`);
  updateStatus(`Playing ${displayText || uci}...`);

  // 1. API call
  if (await tryBoardAPI(from, to)) {
    console.log('Move via board API');
    setTimeout(() => updateStatus(null), 2000);
    return;
  }

  // 2. Text input
  if (await tryTextInput(from, to)) {
    console.log('Move via text input');
    setTimeout(() => updateStatus(null), 2000);
    return;
  }

  // 3. Drag simulation
  console.log('Fallback to drag simulation');
  await tryDragMove(from, to);

  // Verify move registered
  await new Promise(r => setTimeout(r, 500));
  const newFen = getFEN();
  if (lastFEN === newFen) {
    console.log('Move not registered, retrying with API...');
    await tryBoardAPI(from, to);
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
    if (selectedMove === moveUci) {
      playMove(moveUci, moveDisplay);
      selectedMove = null;
      thinkingStart = null;
      updateAutoPlayCountdown(null);
    }
  }, thinkTime);
}

function cancelAutoPlay(reason) {
  if (autoPlayTimeout) {
    clearTimeout(autoPlayTimeout);
    autoPlayTimeout = null;
  }
  selectedMove = null;
  thinkingStart = null;
  updateAutoPlayCountdown(null);
  if (reason) updateStatus(`⚠ Auto‑play cancelled: ${reason}`);
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
    if (!autoPlayEnabled) cancelAutoPlay('Turned off');
  };
  header.appendChild(autoBtn);

  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = '🔄';
  refreshBtn.title = 'Refresh analysis';
  refreshBtn.style.cssText = 'background: #2196F3; border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 14px;';
  refreshBtn.onclick = (e) => { e.stopPropagation(); doUpdate(); };
  header.appendChild(refreshBtn);

  overlay.appendChild(header);

  const statusEl = document.createElement('div');
  statusEl.id = 'monster-status';
  statusEl.style.cssText = 'margin-bottom: 8px; font-size: 12px; color: #FFA500; display: none;';
  overlay.appendChild(statusEl);

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
    badge.style.cssText = 'font-size: 12px; font-weight: bold; color: #FFD700; background: rgba(255,215,0,0.2); padding: 2px 8px; border-radius: 4px;';
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
    const scoreSpan = document.createElement('span');
    scoreSpan.textContent = move.score;
    scoreSpan.style.cssText = 'font-size: 14px; color: #aaa; margin-left: auto;';
    if (move.score.startsWith('+') || move.score.startsWith('M')) scoreSpan.style.color = '#4CAF50';
    else if (move.score.startsWith('-')) scoreSpan.style.color = '#f44336';
    row.appendChild(scoreSpan);
    const playBtn = document.createElement('button');
    playBtn.textContent = '▶️ Play';
    playBtn.title = 'Play this move manually';
    playBtn.style.cssText = 'background: #555; border: none; color: white; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 4px;';
    playBtn.onclick = (e) => {
      e.stopPropagation();
      playMove(move.uci, move.san);
    };
    row.appendChild(playBtn);
    movesDiv.appendChild(row);
  });
  if (selectedMove && autoPlayTimeout) {
    const remaining = thinkingStart ? Math.max(0, (autoPlayTimeout._idleTimeout || 0) + thinkingStart - Date.now()) : 0;
    if (remaining > 0) updateAutoPlayCountdown(remaining, moves[chosenIndex]?.san);
  }
}

// ---- Debounced update ----
let debounceTimer = null;
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
  const previousFEN = lastFEN;
  lastFEN = fen;
  lastMoveTime = Date.now();

  // Cancel pending auto‑play if board changed (opponent moved)
  if (autoPlayTimeout && previousFEN) {
    cancelAutoPlay('Opponent moved');
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
      scheduleAutoPlay(selected.uci, thinkTime, selected.san);
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