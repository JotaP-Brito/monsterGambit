# ♟️ MonsterGambit

**Real-time local chess analysis and automation experiments for chess.com powered by Stockfish.**

MonsterGambit combines a **persistent Stockfish engine**, a **Flask backend**, and a **Chrome extension** to analyze positions directly from the live board and render move recommendations in real time.

The project also includes optional automation components for experimentation with move execution, timing simulation, and game-flow control.

> ⚠️ **Fair-play notice**
> This project is intended for **education, local experimentation, analysis, and playing against bots/computer opponents only**.
> Using engine assistance or automated play in live competitive games may violate platform rules and fair-play policies. Always follow the platform’s terms of service.

---

## 🚀 Features

### ♟️ Real-time Analysis

* Live board extraction directly from chess.com
* Overlay rendered directly on top of the board
* Displays **top-3 engine moves**
* Shows **evaluation scores** (centipawns / mate)
* Updates automatically after position changes

### 🧠 Engine System

* Persistent **Stockfish UCI** process
* Automatic engine restart after crashes
* Local execution (no external servers)
* Adjustable analysis time
* Request deduplication for unchanged positions

### 🎮 Automation Experiments

* Optional move execution pipeline
* Automatic move submission
* Variable thinking delays
* Simulated move timing based on game phase
* Optional queue flow between completed games

### ⏱ Timing & Behaviour System

* Dynamic think-time generation
* Fast responses in obvious positions
* Longer pauses in complex positions
* Randomized delay windows
* Support for premove-style reactions

### 🏗 Move Selection Logic

* Multi-candidate evaluation
* Weighted move selection
* Position-dependent preferences
* Development and positional heuristics
* Configurable exploration vs strongest-move behavior

### 🖱 Interaction Layer

* Board-API-first move execution
* Fallback interaction mode
* Overlay controls
* Mouse movement abstractions
* Event-based synchronization

### 🔍 Board Detection

* Automatic White/Black detection
* Orientation recovery
* Multiple board-state validation paths
* Position refresh safeguards

---

## 🏗️ Architecture

```text
chess.com board
      │
      ▼
[Content Script]
Reads board state and extracts position
      │
      ▼
[Background Script]
Coordinates requests and execution
      │
      ▼
[Flask Server]
Persistent Stockfish engine
      │
      ▼
[Move Selection Layer]
Evaluation + timing logic
      │
      ▼
[Overlay / Interaction]
Display and optional execution
```

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/JotaP-Brito/monsterGambit.git
cd monsterGambit
```

---

### 2. Create a virtual environment

```bash
python -m venv venv
```

Activate:

Windows

```bash
venv\Scripts\activate
```

macOS / Linux

```bash
source venv/bin/activate
```

---

### 3. Install dependencies

```bash
pip install flask python-chess
```

---

### 4. Download Stockfish

Download Stockfish and place the binary inside:

```text
engines/stockfish/
```

Example:

```text
engines/stockfish/stockfish-windows-x86-64-avx2.exe
```

Update:

```python
STOCKFISH_PATH
```

inside `server.py` if necessary.

---

### 5. Start the server

```bash
python server.py
```

Expected output:

```text
Engine started successfully
Running on http://127.0.0.1:5000
```

---

### 6. Load the extension

Open:

```text
chrome://extensions/
```

* Enable **Developer Mode**
* Click **Load unpacked**
* Select:

```text
monster-extension/
```

---

## 🎮 Usage

1. Start the Flask server
2. Open chess.com
3. Start a practice or analysis session
4. Wait for overlay initialization
5. Review engine output
6. Adjust settings if experimenting with automation features

---

## ⚙️ Configuration

| File            | Setting          | Purpose              |
| --------------- | ---------------- | -------------------- |
| `server.py`     | `STOCKFISH_PATH` | Engine executable    |
| `server.py`     | `movetime`       | Analysis duration    |
| `content.js`    | timing constants | Overlay timing       |
| `content.js`    | automation flags | Interaction settings |
| `background.js` | timeout          | Request control      |

---

## 📁 Project Structure

```text
monsterGambit/
├── server.py
├── engines/
│   └── stockfish/
├── monster-extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   └── icon.png
├── .gitignore
└── README.md
```

---

## 🛠 Roadmap

* [ ] Engine profiles
* [ ] Overlay customization
* [ ] Extension settings UI
* [ ] Better evaluation visualizations
* [ ] Additional board support
* [ ] Desktop packaging

---

## 🤝 Contributing

Issues and pull requests are welcome.

Please include:

* reproduction steps
* environment details
* screenshots when relevant

---

## 📜 License

MIT License

---

## 🙌 Acknowledgements

* Stockfish
* python-chess
* Flask

Made with ❤️ by **JotaP-Brito**
