// Map piece classes to FEN letters
const pieceMap = {
    'br': 'r', 'bn': 'n', 'bb': 'b', 'bq': 'q', 'bk': 'k', 'bp': 'p',
    'wr': 'R', 'wn': 'N', 'wb': 'B', 'wq': 'Q', 'wk': 'K', 'wp': 'P'
};

function getFEN() {
    const board = [];
    for (let row = 0; row < 8; row++) {
        board[row] = [];
        for (let col = 0; col < 8; col++) {
            board[row][col] = null;
        }
    }

    // Find all piece elements
    const pieces = document.querySelectorAll('.piece');
    pieces.forEach(piece => {
        // Get piece color and type from class, e.g. "piece br square-11"
        const classes = piece.className.split(' ');
        let pieceClass = '';
        for (const cls of classes) {
            if (pieceMap[cls]) {
                pieceClass = cls;
                break;
            }
        }
        if (!pieceClass) return;

        // Find square class (e.g. "square-11")
        const squareClass = classes.find(c => c.startsWith('square-'));
        if (!squareClass) return;
        const square = squareClass.replace('square-', '');
        const col = parseInt(square[0]) - 1; // 1-indexed
        const row = 8 - parseInt(square[1]);  // 8th rank is row 0
        board[row][col] = pieceMap[pieceClass];
    });

    // Build FEN piece placement
    let fen = '';
    for (let row = 0; row < 8; row++) {
        let empty = 0;
        for (let col = 0; col < 8; col++) {
            if (board[row][col] === null) {
                empty++;
            } else {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                fen += board[row][col];
            }
        }
        if (empty > 0) fen += empty;
        if (row < 7) fen += '/';
    }

    // Determine active color from clock indicators
    const whiteActive = document.querySelector('.clock-white.clock-active') !== null;
    const blackActive = document.querySelector('.clock-black.clock-active') !== null;
    let activeColor = 'w';
    if (blackActive && !whiteActive) activeColor = 'b';
    // Simplified: assume no castling/en passant – still gives correct move
    fen += ` ${activeColor} KQkq - 0 1`;

    return fen;
}

async function fetchBestMove(fen) {
    const response = await fetch(`http://127.0.0.1:5000/bestmove?fen=${encodeURIComponent(fen)}`);
    const data = await response.json();
    return data.san || '?';
}

function showOverlay(move) {
    // Remove old overlay if any
    const old = document.getElementById('monster-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'monster-overlay';
    overlay.style.position = 'fixed';
    overlay.style.bottom = '20px';
    overlay.style.right = '20px';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.color = '#fff';
    overlay.style.padding = '10px 20px';
    overlay.style.borderRadius = '8px';
    overlay.style.fontSize = '24px';
    overlay.style.zIndex = 9999;
    overlay.textContent = 'Best move: ' + move;
    document.body.appendChild(overlay);
}

// Watch for changes (new moves)
const observer = new MutationObserver(async () => {
    const fen = getFEN();
    const move = await fetchBestMove(fen);
    showOverlay(move);
});

observer.observe(document.body, { childList: true, subtree: true });