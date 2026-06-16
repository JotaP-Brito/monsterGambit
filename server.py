from flask import Flask, request, jsonify
import subprocess
import chess

app = Flask(__name__)
STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"

def send(engine, cmd):
    engine.stdin.write(cmd + "\n")
    engine.stdin.flush()

def read_line(engine):
    return engine.stdout.readline().strip()

def get_best_move(fen):
    engine = subprocess.Popen(
        STOCKFISH_PATH,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
        bufsize=1
    )
    try:
        # UCI handshake
        send(engine, "uci")
        while True:
            line = read_line(engine)
            if line == "uciok":
                break

        send(engine, "isready")
        while True:
            line = read_line(engine)
            if line == "readyok":
                break

        # Set position and go
        send(engine, f"position fen {fen}")
        send(engine, "go movetime 1500")

        best_move = None
        while True:
            line = read_line(engine)
            if line.startswith("bestmove"):
                best_move = line.split()[1]
                break

        return best_move
    finally:
        # Always clean up
        try:
            send(engine, "quit")
            engine.terminate()
            engine.wait(timeout=2)
        except:
            engine.kill()

@app.route("/bestmove")
def bestmove():
    fen = request.args.get("fen")
    if not fen:
        return jsonify({"error": "No FEN provided"}), 400
    # Support "startpos" shortcut
    if fen.lower() == "startpos":
        fen = chess.STARTING_FEN
    try:
        board = chess.Board(fen)  # validate
        move = get_best_move(fen)
        san = board.san(chess.Move.from_uci(move))
        return jsonify({"uci": move, "san": san})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return "OK", 200

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)