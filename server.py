from flask import Flask, request, jsonify
import subprocess
import chess
import threading
import re

app = Flask(__name__)
STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"

engine = None
engine_lock = threading.Lock()
engine_start_lock = threading.Lock()

def kill_engine():
    global engine
    if engine and engine.poll() is None:
        try:
            engine.kill()
            engine.wait(timeout=2)
        except:
            pass
    engine = None

def start_engine():
    global engine
    kill_engine()
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
            if not line:
                raise RuntimeError("Engine closed during UCI")
            if line.strip() == "uciok":
                break

        # Set default MultiPV to 1 (will be changed per request)
        engine.stdin.write("setoption name MultiPV value 1\n"); engine.stdin.flush()
        engine.stdin.write("isready\n"); engine.stdin.flush()
        while True:
            line = engine.stdout.readline()
            if not line:
                raise RuntimeError("Engine closed during isready")
            if line.strip() == "readyok":
                break
        print("Engine started successfully")
        return True
    except Exception as e:
        print(f"ERROR: Engine start failed: {e}")
        kill_engine()
        return False

def get_engine():
    global engine
    if engine is not None and engine.poll() is None:
        return engine
    with engine_start_lock:
        if engine is None or engine.poll() is not None:
            print("Engine dead – restarting...")
            if not start_engine():
                print("Restart failed")
                engine = None
        return engine

def get_best_moves(fen, movetime=1.0, multipv=3):
    """
    Returns a list of moves with evaluations.
    Each item: {"uci": "e2e4", "san": "e4", "score": "+0.34"} or {"score": "M+2"} etc.
    """
    eng = get_engine()
    if eng is None:
        raise RuntimeError("Engine not available")

    # Clamp multipv
    multipv = max(1, min(multipv, 5))

    try:
        # Set MultiPV for this request
        eng.stdin.write(f"setoption name MultiPV value {multipv}\n")
        eng.stdin.write(f"position fen {fen}\n")
        eng.stdin.write(f"go movetime {int(movetime * 1000)}\n")
        eng.stdin.flush()

        # Parse info lines to collect the last pv for each multipv index
        lines_per_multipv = {}
        while True:
            line = eng.stdout.readline()
            if not line:
                # Engine died
                kill_engine()
                raise RuntimeError("Engine died during analysis")
            line = line.strip()
            if line.startswith("bestmove"):
                break
            if line.startswith("info") and "multipv" in line:
                # Extract multipv index
                match = re.search(r"multipv (\d+)", line)
                if match:
                    idx = int(match.group(1))
                    lines_per_multipv[idx] = line

        # Now extract moves and scores
        board = chess.Board(fen)
        moves = []
        for i in range(1, multipv+1):
            if i not in lines_per_multipv:
                continue
            info = lines_per_multipv[i]
            # Extract score
            score_str = ""
            if "score cp" in info:
                cp_match = re.search(r"score cp (-?\d+)", info)
                if cp_match:
                    cp = int(cp_match.group(1))
                    score_str = f"{'+' if cp >= 0 else ''}{cp/100:.2f}"  # e.g., +0.34
            elif "score mate" in info:
                mate_match = re.search(r"score mate (\d+)", info)
                if mate_match:
                    m = int(mate_match.group(1))
                    score_str = f"M{m}" if m > 0 else f"M{m}"  # M1, M-2, etc.

            # Extract PV (first move after "pv")
            pv_match = re.search(r" pv (.+)", info)
            if pv_match:
                pv = pv_match.group(1).split()
                uci = pv[0] if pv else None
                if uci:
                    try:
                        san = board.san(chess.Move.from_uci(uci))
                    except:
                        san = uci
                    moves.append({
                        "uci": uci,
                        "san": san,
                        "score": score_str
                    })
        # Reset MultiPV back to 1 for future requests (optional but clean)
        eng.stdin.write("setoption name MultiPV value 1\n"); eng.stdin.flush()
        return moves
    except Exception as e:
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
        multipv = int(request.args.get("multipv", 1))
        multipv = max(1, min(multipv, 5))
    except:
        multipv = 1

    try:
        board = chess.Board(fen)  # validation
        with engine_lock:
            moves = get_best_moves(fen, movetime, multipv)
        return jsonify({"moves": moves})
    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return "OK", 200

if __name__ == "__main__":
    start_engine()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)

# new engine improvemnt