from flask import Flask, request, jsonify
import subprocess
import chess
import threading
import time
import os
import signal

app = Flask(__name__)
STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"

engine = None
engine_lock = threading.Lock()
engine_start_lock = threading.Lock()  # separate lock for restart to avoid deadlocks

def kill_engine():
    """Force-kill the engine process if it's still running."""
    global engine
    if engine and engine.poll() is None:
        try:
            engine.kill()
            engine.wait(timeout=2)
        except:
            pass
    engine = None

def start_engine():
    """Start a new Stockfish process. Must be called under engine_start_lock."""
    global engine
    kill_engine()  # Ensure no zombie left

    try:
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
            line = engine.stdout.readline()
            if not line:
                raise RuntimeError("Engine closed during UCI")
            line = line.strip()
            if line == "uciok":
                break

        engine.stdin.write("isready\n"); engine.stdin.flush()
        while True:
            line = engine.stdout.readline()
            if not line:
                raise RuntimeError("Engine closed during isready")
            line = line.strip()
            if line == "readyok":
                break

        print("Engine started successfully")
        return True
    except Exception as e:
        print(f"ERROR: Engine start failed: {e}")
        kill_engine()
        return False

def get_engine():
    """Return a running engine; restart if dead."""
    global engine
    # Quick check without lock if engine is alive (most cases)
    if engine is not None and engine.poll() is None:
        return engine

    # Need restart – use separate lock to avoid blocking analysis
    with engine_start_lock:
        # Double-check after acquiring lock
        if engine is None or engine.poll() is not None:
            print("Engine dead – restarting...")
            if not start_engine():
                print("Restart failed")
                engine = None
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
                # Engine died
                print("Engine died during analysis")
                kill_engine()   # immediately kill and reset
                raise RuntimeError("Engine died")
            line = line.strip()
            if line.startswith("bestmove"):
                best_move = line.split()[1]
                break
        return best_move
    except Exception as e:
        # Invalidate engine so next request restarts
        kill_engine()
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
        board = chess.Board(fen)  # validate early
        with engine_lock:          # only one analysis at a time
            move = get_best_move(fen, movetime)
        san = board.san(chess.Move.from_uci(move))
        return jsonify({"uci": move, "san": san})
    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return "OK", 200

if __name__ == "__main__":
    # Start engine on launch
    start_engine()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)