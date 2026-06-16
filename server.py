from flask import Flask, request, jsonify
import subprocess
import chess
import threading

app = Flask(__name__)
STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"

# ---- Persistent engine ----
engine = None
engine_lock = threading.Lock()

def get_engine():
    """Return the global engine, starting it if necessary."""
    global engine
    if engine is None:
        engine = subprocess.Popen(
            STOCKFISH_PATH,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1
        )
        # UCI handshake
        engine.stdin.write("uci\n"); engine.stdin.flush()
        while True:
            line = engine.stdout.readline().strip()
            if line == "uciok":
                break
        engine.stdin.write("isready\n"); engine.stdin.flush()
        while True:
            line = engine.stdout.readline().strip()
            if line == "readyok":
                break
    return engine

def get_best_move(fen, movetime=1.0):
    """
    Send a position to the persistent engine and get the best move.
    movetime is in seconds (float).
    """
    eng = get_engine()
    # Send position and go command
    eng.stdin.write(f"position fen {fen}\n")
    eng.stdin.write(f"go movetime {int(movetime * 1000)}\n")
    eng.stdin.flush()

    best_move = None
    while True:
        line = eng.stdout.readline().strip()
        if line.startswith("bestmove"):
            best_move = line.split()[1]
            break
    return best_move

@app.route("/bestmove")
def bestmove():
    fen = request.args.get("fen")
    if not fen:
        return jsonify({"error": "No FEN"}), 400
    if fen.lower() == "startpos":
        fen = chess.STARTING_FEN

    # Allow optional "time" parameter (seconds, default 1.0)
    try:
        movetime = float(request.args.get("time", 1.0))
        movetime = max(0.1, min(movetime, 10.0))   # clamp between 0.1 and 10 seconds
    except:
        movetime = 1.0

    try:
        board = chess.Board(fen)
        with engine_lock:   # ensure only one thread talks to the engine at a time
            move = get_best_move(fen, movetime)
        san = board.san(chess.Move.from_uci(move))
        return jsonify({"uci": move, "san": san})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return "OK", 200

if __name__ == "__main__":
    # Start engine before first request
    get_engine()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)