// ---- Piece mapping to FEN ----
const pieceMap = {
  'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
  'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

// ---- Global state ----
let autoPlayEnabled = true;
let autoPlayTimeout = null;
let selectedMove = null;
let thinkingStart = null;
let lastFEN = null;
let userColor = null;
let colorLockedBy = null;
let colorDetectionAttempts = 0;
let requestInFlight = false;
let requestTimer = null;
let debounceTimer = null;
let gameEndDetected = false;
let observer = null;
let lastForcedCheck = 0;
let isPlayingMove = false;      // true while a drag/click move is in progress

// ---- Board orientation ----
function isFlipped() {
  const board = document.querySelector('chess-board') || document.querySelector('.board');
  return board ? board.classList.contains('flipped') : false;
}

// ---- Get chess.com internal game object ----
function getGameObject() {
  try {
    const boardEl = document.querySelector('chess-board');
    if (!boardEl) return null;
    for (const key of Object.keys(boardEl)) {
      const val = boardEl[key];
      if (val && typeof val.turn === 'function' && typeof val.myColor === 'function') {
        return val;
      }
    }
    if (boardEl.game?.turn) return boardEl.game;
    if (boardEl.chess?.turn) return boardEl.chess;
    if (window.chess?.turn) return window.chess;
  } catch (e) { /* silent */ }
  return null;
}

// ---- Detect user's colour ----
function detectUserColorWithConfidence() {
  const game = getGameObject();
  if (game) {
    try {
      let c = game.myColor?.();
      if (c === 'white') c = 'w';
      if (c === 'black') c = 'b';
      if (c === 'w' || c === 'b') return { color: c, confidence: 'high', source: 'gameObject' };
    } catch (e) {}
  }
  const boardEl = document.querySelector('chess-board') || document.querySelector('.board');
  if (boardEl) {
    const flipped = boardEl.classList.contains('flipped');
    const hasPieces = boardEl.querySelectorAll('.piece').length >= 20;
    if (hasPieces) return { color: flipped ? 'b' : 'w', confidence: 'high', source: `flippedClass(${flipped})` };
  }
  const myUsernameEl = document.querySelector('[class*="user-username-component"], [class*="username"][class*="bottom"], .player-tagline-username');
  if (myUsernameEl) {
    let el = myUsernameEl;
    for (let i = 0; i < 6; i++) {
      el = el.parentElement;
      if (!el) break;
      if ((el.className || '').includes('bottom')) {
        return { color: isFlipped() ? 'b' : 'w', confidence: 'low', source: 'panelPosition' };
      }
    }
  }
  const pieces = document.querySelectorAll('.piece');
  for (const piece of pieces) {
    const classes = [...piece.classList];
    const pieceClass = classes.find(c => pieceMap[c]);
    const squareClass = classes.find(c => c.startsWith('square-'));
    if (!pieceClass || !squareClass) continue;
    const square = squareClass.replace('square-', '');
    if (square.length < 2) continue;
    const rank = parseInt(square[1]);
    const isWhitePiece = pieceMap[pieceClass] === pieceMap[pieceClass].toUpperCase();
    if (rank === 1 && isWhitePiece) return { color: 'w', confidence: 'low', source: 'homeRankPiece' };
    if (rank === 8 && !isWhitePiece) return { color: 'w', confidence: 'low', source: 'homeRankPiece' };
  }
  return { color: 'w', confidence: 'low', source: 'default' };
}

function ensureUserColor() {
  colorDetectionAttempts++;
  const result = detectUserColorWithConfidence();
  if (result.confidence === 'high') {
    if (userColor !== result.color) {
      console.log(`MonsterGambit: color ${userColor ? 're-locked' : 'locked'} as '${result.color}' via ${result.source} (attempt ${colorDetectionAttempts})`);
    }
    userColor = result.color;
    colorLockedBy = result.source;
  } else if (!userColor) {
    userColor = result.color;
    colorLockedBy = result.source + '(low)';
    console.log(`MonsterGambit: color tentatively set to '${userColor}' via ${colorLockedBy} (attempt ${colorDetectionAttempts})`);
  }
  return userColor || 'w';
}

// ---- Active colour detection ----
function getActiveColor() {
  const game = getGameObject();
  if (game && typeof game.turn === 'function') {
    try {
      let t = game.turn();
      if (t === 'white') t = 'w';
      if (t === 'black') t = 'b';
      if (t === 'w' || t === 'b') {
        console.log('MonsterGambit: active color via game.turn() =', t);
        return t;
      }
    } catch (e) {}
  }

  const highlights = document.querySelectorAll(
    '.highlight, [class*="highlight"], .last-move, [class*="last-move"]'
  );
  for (const hl of highlights) {
    const piece = hl.querySelector('.piece') || hl.closest('.square')?.querySelector('.piece');
    if (piece) {
      const classes = [...piece.classList];
      const pieceClass = classes.find(c => pieceMap[c]);
      if (pieceClass) {
        const pieceColor = pieceMap[pieceClass] === pieceMap[pieceClass].toUpperCase() ? 'w' : 'b';
        const turn = pieceColor === 'w' ? 'b' : 'w';
        console.log(`MonsterGambit: active color via highlight = ${turn} (piece was ${pieceColor})`);
        return turn;
      }
    }
  }

  const whiteActive = document.querySelector(
    '.clock-white.clock-active, [class*="clock"][class*="white"][class*="active"]'
  );
  const blackActive = document.querySelector(
    '.clock-black.clock-active, [class*="clock"][class*="black"][class*="active"]'
  );
  if (blackActive && !whiteActive) {
    console.log('MonsterGambit: active color via clock = b');
    return 'b';
  }
  if (whiteActive && !blackActive) {
    console.log('MonsterGambit: active color via clock = w');
    return 'w';
  }

  const moveListItems = document.querySelectorAll(
    '[class*="move-list"] [class*="move"]:not([class*="move-list"]):not([class*="move-number"]), ' +
    '.moves-list .move, ' +
    '[data-ply]'
  );
  if (moveListItems.length > 0) {
    const halfMoves = Math.floor(moveListItems.length / 2);
    const turn = halfMoves % 2 === 0 ? 'w' : 'b';
    console.log(`MonsterGambit: active color via move count (${moveListItems.length} items → ${halfMoves} plies) = ${turn}`);
    return turn;
  }

  console.log('MonsterGambit: active color default = w');
  return 'w';
}

function isUserTurn() {
  const color = ensureUserColor();
  const active = getActiveColor();
  const result = active === color;
  console.log(`MonsterGambit: isUserTurn → userColor=${color}, activeColor=${active}, result=${result}`);
  return result;
}

// ---- Build FEN ----
function getFEN() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
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

  const active = getActiveColor();
  fen += ` ${active} - - 0 1`;
  return fen;
}

// ---- Humanized move selector (500 Elo) ----
function parseScore(scoreStr) {
  if (!scoreStr) return 0;
  if (scoreStr.startsWith('M')) {
    const mateIn = parseInt(scoreStr.slice(1));
    return mateIn > 0 ? 100 - mateIn : -100 - mateIn;
  }
  return parseFloat(scoreStr) || 0;
}

function selectHumanMove(moves, fen) {
  if (!moves || moves.length === 0) return -1;
  if (moves.length === 1) return 0;
  const scores = moves.map(m => parseScore(m.score));
  const bestScore = scores[0];
  if (moves[0].score?.startsWith('M') && bestScore > 50) return 0;

  // 5% blunder chance
  if (Math.random() < 0.05) {
    let blunderIdx = -1;
    for (let i = scores.length - 1; i >= 0; i--) {
      if (bestScore - scores[i] >= 3.0) {
        blunderIdx = i;
        break;
      }
    }
    if (blunderIdx !== -1) {
      console.log('🤦 Intentional blunder!');
      return blunderIdx;
    }
  }

  const T = 2.5;
  const expScores = scores.map(s => Math.exp((s + 1) / T));
  const totalExp = expScores.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalExp;
  for (let i = 0; i < scores.length; i++) {
    rand -= expScores[i];
    if (rand <= 0) return i;
  }
  return 0;
}

// ---- Thinking time (improved endgame) ----
function countPieces(fen) { return fen.split(' ')[0].replace(/[\/0-9]/g, '').length; }

function computeThinkTime(fen, evaluationScore) {
  const pieces = countPieces(fen);
  const isEndgame = pieces <= 12;

  // Quick-move chance is higher in endgames (simpler decisions)
  if (Math.random() < (isEndgame ? 0.30 : 0.15)) {
    return 300 + Math.random() * 400;
  }

  // Long "think" pauses are rare in endgames — fewer genuine decision points
  if (!isEndgame && Math.random() < 0.05) {
    return 8000 + Math.random() * 7000;
  }

  let baseMin, baseMax;
  if (pieces > 28)      { baseMin = 1.0; baseMax = 4.0; }
  else if (pieces > 12) { baseMin = 2.0; baseMax = 10.0; }
  else                  { baseMin = 0.5; baseMax = 2.5; }  // endgame: much tighter range

  if (evaluationScore <= -2.0 && !isEndgame) {
    baseMin += 2;
    baseMax += 4;
  }

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
  const chess = boardEl.game || boardEl.chess || window.chess;
  if (chess && typeof chess.move === 'function') {
    try { chess.move({ from, to, promotion: 'q' }); return true; } catch (e) {}
  }
  return false;
}

async function tryTextInput(from, to) {
  const selectors = ['input[class*="move"]', 'input[placeholder*="move" i]', '#move-input', '.move-input'];
  let input = null;
  for (const sel of selectors) {
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
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  return true;
}

async function tryDragMove(from, to) {
  const fromPos = getSquareCenter(from);
  const toPos   = getSquareCenter(to);
  if (!fromPos || !toPos) return false;
  const piece = document.elementFromPoint(fromPos.x, fromPos.y);
  if (!piece) return false;

  // Validate piece colour
  const classes = [...piece.classList];
  const pieceClass = classes.find(c => pieceMap[c]);
  if (pieceClass) {
    const pieceColor = pieceMap[pieceClass] === pieceMap[pieceClass].toUpperCase() ? 'w' : 'b';
    if (pieceColor !== userColor) {
      console.warn(`Move validation failed: source piece is ${pieceColor}, but we are ${userColor}`);
      return false;
    }
  }

  // 1. Hover over the piece for a human‑like pause (300‑700ms)
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

  // 2. Wiggle the mouse a bit before grabbing (50% chance)
  if (Math.random() < 0.5) {
    const wiggleX = fromPos.x + (Math.random() - 0.5) * 15;
    const wiggleY = fromPos.y + (Math.random() - 0.5) * 15;
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, cancelable: true, view: window,
      clientX: wiggleX, clientY: wiggleY,
      button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 60 + Math.random() * 120));
  }

  // 3. Pick up the piece
  piece.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, view: window,
    clientX: fromPos.x, clientY: fromPos.y,
    button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
  }));

  // 4. Drag to the target square (with a small mid‑drag pause sometimes)
  await new Promise(r => setTimeout(r, 60 + Math.random() * 120));

  // Occasionally (20%) stop mid‑drag for a fraction of a second
  if (Math.random() < 0.2) {
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
  }

  const targetEl = document.elementFromPoint(toPos.x, toPos.y) || document.body;
  targetEl.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, cancelable: true, view: window,
    clientX: toPos.x, clientY: toPos.y,
    button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
  }));

  // 5. Pause before releasing (like double‑checking the move)
  await new Promise(r => setTimeout(r, 50 + Math.random() * 150));

  // 6. Release the piece
  targetEl.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, view: window,
    clientX: toPos.x, clientY: toPos.y,
    button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true
  }));

  return true;
}

async function playMove(uci, displayText) {
  const from = uci.substring(0, 2);
  const to = uci.substring(2, 4);
  console.log(`MonsterGambit: playing ${from}→${to} (user is ${userColor})`);
  updateStatus(`Playing ${displayText || uci}…`);

  isPlayingMove = true;   // <-- lock updates while moving

  if (await tryBoardAPI(from, to)) {
    console.log('Move via board API');
    setTimeout(() => updateStatus(null), 2000);
    isPlayingMove = false;
    return;
  }
  if (await tryTextInput(from, to)) {
    console.log('Move via text input');
    setTimeout(() => updateStatus(null), 2000);
    isPlayingMove = false;
    return;
  }
  console.log('Fallback to drag simulation');

  // Random mental pause before moving (0‑1.5s)
  await new Promise(r => setTimeout(r, Math.random() * 1500));

  const dragSuccess = await tryDragMove(from, to);
  if (!dragSuccess) {
    updateStatus('❌ Invalid move (wrong piece color)');
    setTimeout(() => updateStatus(null), 3000);
    isPlayingMove = false;
    return;
  }
  await new Promise(r => setTimeout(r, 500));
  const newFEN = getFEN();
  if (newFEN === lastFEN) {
    console.warn('Move not registered after drag, retrying board API…');
    await tryBoardAPI(from, to);
  }
  setTimeout(() => updateStatus(null), 2000);
  isPlayingMove = false;  // <-- unlock after move finishes
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
  selectedMove = null;
  thinkingStart = null;
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
    div.textContent = `⏳ Auto-playing ${moveDisplay} in ${(delayMs / 1000).toFixed(1)}s`;
    movesDiv.appendChild(div);
  }
}

// ---- Overlay ----
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
    z-index: 9999; min-width: 260px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.6);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255,255,255,0.1);
  `;

  const header = document.createElement('div');
  header.style.cssText = 'font-size: 14px; font-weight: bold; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;';
  const titleSpan = document.createElement('span');
  titleSpan.id = 'monster-title';
  titleSpan.textContent = '🧠 MonsterGambit';
  header.appendChild(titleSpan);
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

function updateOverlayTitle() {
  const titleEl = document.getElementById('monster-title');
  if (!titleEl) return;
  const colorLabel = userColor === 'b' ? '⬛ Black' : userColor === 'w' ? '⬜ White' : '?';
  titleEl.textContent = `🧠 MonsterGambit (${colorLabel})`;
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
    scoreSpan.textContent = move.score || '';
    scoreSpan.style.cssText = 'font-size: 14px; color: #aaa; margin-left: auto;';
    if (move.score?.startsWith('+') || move.score?.startsWith('M')) scoreSpan.style.color = '#4CAF50';
    else if (move.score?.startsWith('-')) scoreSpan.style.color = '#f44336';
    row.appendChild(scoreSpan);
    const playBtn = document.createElement('button');
    playBtn.textContent = '▶️ Play';
    playBtn.title = 'Play this move manually';
    playBtn.style.cssText = 'background: #555; border: none; color: white; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 4px;';
    playBtn.onclick = (e) => { e.stopPropagation(); playMove(move.uci, move.san); };
    row.appendChild(playBtn);
    movesDiv.appendChild(row);
  });
  if (selectedMove && autoPlayTimeout && thinkingStart) {
    const elapsed = Date.now() - thinkingStart;
    const totalDelay = autoPlayTimeout._idleTimeout || 0;
    const remaining = Math.max(0, totalDelay - elapsed);
    if (remaining > 0) updateAutoPlayCountdown(remaining, moves[chosenIndex]?.san);
  }
}

// ---- Debounced update with stuck‑request recovery ----
function scheduleUpdate(delay = 400) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doUpdate, delay);
}

const thinkingMessages = [
  'Hmm…', 'Let’s see…', 'What to play?', 'Interesting position', 'Umm…',
  'Hmm, what now?', 'Let me think…', 'This looks tricky', 'Okay, okay…',
  'Maybe this?', 'Let’s try something', 'Need to be careful', 'Hmm… not sure'
];

function resetRequestFlag() {
  requestInFlight = false;
  if (requestTimer) { clearTimeout(requestTimer); requestTimer = null; }
}

async function doUpdate() {
  // If a move is currently being physically played, don't interfere
  if (isPlayingMove) return;

  // If we already have a move scheduled and the position hasn't changed, do nothing
  if (autoPlayTimeout && selectedMove && lastFEN) {
    const currentFen = getFEN();
    if (currentFen === lastFEN) {
      // Still waiting to execute the previously scheduled move – skip update
      return;
    }
  }

  if (requestInFlight) {
    console.warn('MonsterGambit: update skipped – request already in flight');
    return;
  }

  ensureUserColor();
  updateOverlayTitle();

  let fen;
  try { fen = getFEN(); } catch (e) { console.error('MonsterGambit getFEN error:', e); return; }

  // Only force update if we DON'T already have a move scheduled
  const now = Date.now();
  const forceUpdate = (now - lastForcedCheck > 5000) && !autoPlayTimeout && isUserTurn();

  if (fen === lastFEN && !forceUpdate) return;

  if (forceUpdate) {
    console.log('MonsterGambit: forced update because it’s our turn and no move scheduled');
  }

  lastForcedCheck = now;
  const previousFEN = lastFEN;
  lastFEN = fen;

  // Only cancel pending auto-play if the position actually changed (opponent moved)
  if (autoPlayTimeout && previousFEN && fen !== previousFEN) {
    cancelAutoPlay('Position changed');
  }

  requestInFlight = true;
  if (requestTimer) clearTimeout(requestTimer);
  requestTimer = setTimeout(() => {
    console.warn('MonsterGambit: request timed out – resetting');
    resetRequestFlag();
  }, 8000);

  createOverlay();
  updateMovesDisplay([{ san: '…', score: '' }], -1);
  updateStatus(thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)]);

  const pieces = countPieces(fen);
  const isEndgame = pieces <= 12;
  const analysisTime = isEndgame ? 0.3 : 0.5;
  const multipv = isEndgame ? 1 : 3;   // fewer lines in endgame = faster

  chrome.runtime.sendMessage({ type: 'getMove', fen, time: analysisTime, multipv }, (response) => {
    resetRequestFlag();

    if (chrome.runtime.lastError) {
      console.warn('MonsterGambit message error:', chrome.runtime.lastError.message);
      updateMovesDisplay([{ san: '⚠ Extension error', score: '' }], -1);
      return;
    }
    const moves = response?.moves || [];
    const chosenIndex = selectHumanMove(moves, fen);
    updateMovesDisplay(moves, chosenIndex);

    if (autoPlayEnabled && chosenIndex >= 0) {
      setTimeout(() => {
        if (isUserTurn()) {
          const selected = moves[chosenIndex];
          const evalScore = parseScore(selected.score);
          const thinkTime = computeThinkTime(fen, evalScore);
          console.log(
            `MonsterGambit: scheduling auto-play as '${userColor}', ` +
            `move ${selected.san} in ${thinkTime}ms`
          );
          scheduleAutoPlay(selected.uci, thinkTime, selected.san);
        } else {
          updateStatus(`Waiting for opponent… (playing as ${userColor === 'b' ? 'Black' : 'White'})`);
        }
      }, 500);
    }
  });
}

// ---- Game‑end detection & auto‑queue ----
function checkGameEnd() {
  const endSelectors = [
    '.game-over-modal', '[class*="game-over"]', '.post-game-modal',
    '[class*="post-game"]', '.result-modal', '[class*="result-modal"]',
    '.game-review-modal', '[class*="game-review"]',
    '.game-end-modal', '[class*="game-end"]'
  ];
  for (const sel of endSelectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) return true;
  }

  const resultText = document.querySelector(
    '.game-result, [class*="result"], .sidebar-result, .game-end-text, [class*="end-text"]'
  );
  if (resultText) {
    const text = resultText.textContent?.toLowerCase() || '';
    if (/\b(1\-0|0\-1|½\-½|won|drew|draw|resign|abandon|timeout|forfeit|stalemate|game over|game ended|won on time|white wins|black wins)\b/.test(text)) {
      return true;
    }
  }

  const reviewBtn = document.querySelector(
    '[class*="game-review-button"], button[class*="review"], a[class*="review"]'
  );
  if (reviewBtn) return true;

  const whiteClock = document.querySelector('.clock-white, [class*="clock-white"]');
  const blackClock = document.querySelector('.clock-black, [class*="clock-black"]');
  if (whiteClock && blackClock) {
    const wt = whiteClock.textContent?.trim() || '';
    const bt = blackClock.textContent?.trim() || '';
    if ((wt === '0:00' || wt === '0.0') && (bt === '0:00' || bt === '0.0')) return true;
  }

  return false;
}

function tryStartNextGame() {
  if (gameEndDetected) return;
  gameEndDetected = true;

  console.log('MonsterGambit: Game ended – looking for next game button…');

  const buttons = document.querySelectorAll('button, a, span[role="button"]');
  const targetTexts = ['10 min', '10+0', 'new 10', 'play again 10'];

  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase() || '';
    for (const t of targetTexts) {
      if (text.includes(t)) {
        console.log(`MonsterGambit: clicking "${btn.textContent.trim()}" to start next game`);
        btn.click();
        return;
      }
    }
  }

  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase() || '';
    if (text.includes('new game') || text.includes('play again')) {
      console.log(`MonsterGambit: clicking "${btn.textContent.trim()}" as fallback`);
      btn.click();
      return;
    }
  }

  console.log('MonsterGambit: no button found – navigating to 10+0 challenge');
  window.location.href = 'https://www.chess.com/play/online/new?action=createLiveChallenge&base=600&timeIncrement=0&rated=unrated';
}

function resetGameEndDetection() {
  if (!gameEndDetected) return;
  const pieces = document.querySelectorAll('.piece');
  if (pieces.length >= 28) {
    console.log('MonsterGambit: new game detected – resetting auto-queue');
    gameEndDetected = false;
  }
}

function startGameEndObserver() {
  const obs = new MutationObserver(() => {
    resetGameEndDetection();
    if (checkGameEnd()) {
      setTimeout(tryStartNextGame, 4000 + Math.random() * 3000);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true });
}

// ---- Observer for board changes ----
function ensureObserver() {
  const target = document.querySelector('chess-board') || document.querySelector('.board') || document.body;
  if (!target) return;

  if (observer) {
    observer.disconnect();
  }
  observer = new MutationObserver(() => {
    scheduleUpdate(400);
    setTimeout(() => scheduleUpdate(0), 600);
  });
  observer.observe(target, { childList: true, subtree: true, attributes: true });
  console.log('MonsterGambit: observer attached to', target.tagName || 'body');
}

// ---- Init ----
userColor = null;
colorDetectionAttempts = 0;
gameEndDetected = false;

scheduleUpdate(1500);
ensureObserver();
startGameEndObserver();

// Reconnect observer every 10 seconds
setInterval(() => {
  ensureObserver();
}, 10000);

// Polling fallback every 3 seconds
setInterval(() => {
  scheduleUpdate(0);
}, 3000);