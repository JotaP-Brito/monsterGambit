from flask import Flask, request, jsonify
import subprocess
import chess
import threading
import time
import os

app = Flask(__name__)
STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"

engine = None
engine_lock = threading.Lock()

def start_engine():
    """Start a new Stockfish process and perform handshake."""
    global engine
    try:
        engine = subprocess.Popen(
            STOCKFISH_PATH,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
            bufsize=1
        )
        engine.stdin.write("uci\n"); engine.stdin.flush()
        while True:
            line = engine.stdout.readline()
            if not line:  # pipe closed
                raise RuntimeError("Engine crashed during UCI")
            line = line.strip()
            if line == "uciok":
                break
        engine.stdin.write("isready\n"); engine.stdin.flush()
        while True:
            line = engine.stdout.readline()
            if not line:
                raise RuntimeError("Engine crashed during isready")
            line = line.strip()
            if line == "readyok":
                break
        return True
    except Exception as e:
        print(f"Engine startup failed: {e}")
        engine = None
        return False

def get_engine():
    """Return a running engine; restart if dead."""
    global engine
    if engine is None or engine.poll() is not None:
        # Engine is dead, restart
        print("Engine process not running. Restarting...")
        start_engine()
    return engine

def get_best_move(fen, movetime=1.0):
    eng = get_engine()
    if eng is None:
        raise RuntimeError("Engine not available")

    try:
        eng.stdin.write(f"position fen {fen}\n")
        eng.stdin.write(f"go movetime {int(movetime * 1000)}\n")
        eng.stdin.flush()

        best_move = None
        while True:
            line = eng.stdout.readline()
            if not line:
                # Engine died mid‑analysis
                print("Engine died during analysis, will restart...")
                engine = None
                raise RuntimeError("Engine died")
            line = line.strip()
            if line.startswith("bestmove"):
                best_move = line.split()[1]
                break
        return best_move
    except Exception as e:
        # Force restart on next call
        engine = None
        raise e

@app.route("/bestmove")
def bestmove():
    fen = request.args.get("fen")
    if not fen:
        return jsonify({"error": "No FEN"}), 400
    if fen.lower() == "startpos":
        fen = chess.STARTING_FEN

    try:
        movetime = float(request.args.get("time", 0.5))
        movetime = max(0.1, min(movetime, 10.0))
    except:
        movetime = 0.5

    try:
        board = chess.Board(fen)
        with engine_lock:
            move = get_best_move(fen, movetime)
        san = board.san(chess.Move.from_uci(move))
        return jsonify({"uci": move, "san": san})
    except Exception as e:
        # If engine died, the next request will restart it
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return "OK", 200

if __name__ == "__main__":
    # Start engine before first request
    start_engine()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)