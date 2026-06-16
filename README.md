# ♟️ MonsterGambit

A **real-time chess move advisor** that reads your live game on **chess.com** and shows the **best Stockfish move** as an overlay – right on the board.

Built with a **persistent local server** (Flask + Stockfish UCI) and a **Chrome extension** that extracts the board position, queries the engine, and displays the recommendation instantly.  
The engine **automatically restarts** if it crashes, and the extension debounces requests to keep everything snappy.

> ⚠️ **Fair-play notice:** This tool is intended for analysis, practice, or unrated games only. Using automated move suggestions in rated games violates chess.com's fair-play policy and can lead to account restrictions. Always abide by the platform's terms of service.

---

## 🚀 Features

- **Real-time overlay** – floating box on chess.com showing the best move during live games or vs. computer
- **Works for both White and Black** – detects board orientation and builds the correct FEN automatically
- **Persistent Stockfish process** – one engine instance reused across requests, no cold-start delay
- **Automatic engine recovery** – if Stockfish dies, the server restarts it seamlessly
- **Debounced updates** – waits 400 ms after the last board change before querying the engine
- **Request deduplication** – skips the fetch entirely if the position hasn't changed
- **Client-side timeout** – background script aborts requests that take longer than 8 seconds
- **Manual refresh button** – click 🔄 to force an immediate re-analysis at any time
- **Fully local** – all analysis runs on your machine, no external servers involved
- **Cross-platform server** – runs on Windows, macOS, and Linux (just swap the Stockfish binary)

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/JotaP-Brito/monsterGambit.git
cd monsterGambit
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv
```

| Platform | Command |
|----------|---------|
| Windows | `venv\Scripts\activate` |
| macOS / Linux | `source venv/bin/activate` |

### 3. Install Python dependencies

```bash
pip install flask python-chess
```

### 4. Download Stockfish

1. Go to [stockfishchess.org/download](https://stockfishchess.org/download) and download the binary for your OS.
2. Place it inside the `engines/stockfish/` folder.  
   Example path: `engines/stockfish/stockfish-windows-x86-64-avx2.exe`
3. Make sure the filename matches `STOCKFISH_PATH` at the top of `server.py`.

### 5. Start the local server

```bash
python server.py
```

You should see `Engine started successfully` and `Running on http://127.0.0.1:5000`.  
Keep this terminal open while you play.

### 6. Load the Chrome extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the `monster-extension/` folder
4. The MonsterGambit icon will appear in your toolbar

---

## 🎮 Usage

1. Make sure the Flask server is running (step 5 above)
2. Go to a live chess.com game or play against the computer
3. The overlay appears at the bottom-right corner showing the best move
4. After each move the overlay updates automatically
5. Playing as Black? The board flip is handled automatically
6. Click **🔄** to force a refresh at any time

---

## 🧠 How it works

```
chess.com board
      │
      ▼
[Content Script]     ← reads piece positions, builds FEN, debounces requests
      │
      ▼
[Background Script]  ← forwards FEN to the local server via fetch (8 s timeout)
      │
      ▼
[Flask Server]       ← manages a persistent Stockfish process with auto-recovery
      │
      ▼
[Overlay]            ← displays best move in SAN notation
```

**Key design decisions:**

- **Persistent engine** – Stockfish is spawned once and reused, avoiding a 300–800 ms startup penalty per move
- **Debounced updates** – the extension waits 400 ms after the last DOM mutation before fetching, so rapid board changes don't pile up requests
- **Request deduplication** – if the FEN hasn't changed since the last fetch, no new request is sent
- **Crash recovery** – the server kills any zombie process and restarts Stockfish automatically
- **Castling safety** – the FEN uses `- -` for castling rights because they can't be reliably inferred from the DOM, preventing illegal castling suggestions mid-game

---

## 📁 Project structure

```
monsterGambit/
├── server.py                  # Flask server + Stockfish process manager
├── engines/
│   └── stockfish/             # Place your Stockfish binary here
├── monster-extension/
│   ├── manifest.json          # Chrome extension manifest (MV3)
│   ├── background.js          # Handles HTTP requests to the local server
│   ├── content.js             # Reads the board and renders the overlay
│   ├── popup.html             # Extension popup UI
│   └── icon.png               # Extension icon (optional)
├── .gitignore
└── README.md
```

---

## ⚙️ Configuration

| File | Setting | Default | Notes |
|------|---------|---------|-------|
| `server.py` | `STOCKFISH_PATH` | `./engines/stockfish/…` | Path to your Stockfish binary |
| `server.py` | `movetime` | `0.5 s` | Analysis time per move (clamped 0.1–10 s) |
| `content.js` | `time` param | `0.5` | Passed to the server; increase for deeper analysis |
| `content.js` | `setInterval` | `3000 ms` | Fallback polling interval |
| `background.js` | `AbortController` timeout | `8000 ms` | Max wait before cancelling a slow request |

---

## 🛠️ Roadmap

- [ ] Show evaluation score (+/- centipawns) alongside the best move
- [ ] Toggle overlay on/off via the extension popup
- [ ] Package as a standalone Windows app (no terminal needed)
- [ ] Support for lichess.org

---

## 🤝 Contributing

Pull requests are welcome! Feel free to open an issue for bugs, feature requests, or questions.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙌 Acknowledgements

- [Stockfish](https://stockfishchess.org/) – the strongest open-source chess engine
- [python-chess](https://python-chess.readthedocs.io/) – FEN validation and SAN conversion
- [Flask](https://flask.palletsprojects.com/) – lightweight local web server

---

*Made with ❤️ by [JotaP-Brito](https://github.com/JotaP-Brito)*
