import sys
import chess
import chess.engine

STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"


def get_user_move(board):
    """Ask the user for a move until a legal one is given.
    Accepts either UCI format (e2e4) or SAN format (e4, Nf3, O-O, ...).
    Type 'quit' or 'exit' to stop."""
    while True:
        move_str = input("Your move (UCI or SAN, 'quit' to exit): ").strip()

        if move_str.lower() in ("quit", "exit"):
            return None

        # Try UCI format first (e.g. e2e4, e7e8q)
        try:
            move = chess.Move.from_uci(move_str)
            if move in board.legal_moves:
                return move
        except ValueError:
            pass

        # Try SAN format (e.g. e4, Nf3, O-O)
        try:
            move = board.parse_san(move_str)
            return move
        except ValueError:
            pass

        print("Invalid or illegal move, try again.")


def main():
    fen = input("Enter a FEN (or press Enter for starting position): ").strip()
    if not fen:
        fen = chess.STARTING_FEN

    try:
        board = chess.Board(fen)
    except ValueError as e:
        print(f"Invalid FEN: {e}")
        sys.exit(1)

    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
    except FileNotFoundError:
        print(f"Could not find Stockfish at {STOCKFISH_PATH}")
        sys.exit(1)

    try:
        print(board)
        print()

        while not board.is_game_over():
            move = get_user_move(board)
            if move is None:
                print("Goodbye!")
                break

            print(f"You played: {board.san(move)}")
            board.push(move)
            print(board)
            print()

            if board.is_game_over():
                break

            print("Stockfish thinking...")
            result = engine.play(board, chess.engine.Limit(time=2.0))
            print(f"Stockfish plays: {board.san(result.move)}")
            board.push(result.move)
            print(board)
            print()

        if board.is_game_over():
            print(f"Game over: {board.result()}")

    finally:
        engine.quit()


if __name__ == "__main__":
    main()