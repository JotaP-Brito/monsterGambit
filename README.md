# ♟️ MonsterGambit

**MonsterGambit** is a lightweight Python tool that uses the Stockfish chess engine to recommend the best move for any chess position.

Paste a FEN string or press **Enter** to analyse the standard starting position and get an engine recommendation in seconds.

---

## ✨ Features

* ♟️ Analyse any valid chess position using **FEN**
* ⚡ Fast move recommendations powered by **Stockfish**
* 🧠 Direct communication using the **UCI protocol**
* 🪶 Minimal setup and dependencies
* 🖥️ Simple command-line interface

---

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/JotaP-Brito/monsterGambit.git
cd monsterGambit
```

### 2. Create a virtual environment (optional)

Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

Linux / macOS:

```bash
python -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install python-chess
```

---

## ♟️ Install Stockfish

MonsterGambit requires Stockfish separately.

1. Download Stockfish from:

https://stockfishchess.org/download/

2. Create the folder:

```text
engines/stockfish/
```

3. Place the Stockfish executable inside it.

Example:

```text
engines/
└── stockfish/
    └── stockfish-windows-x86-64-avx2.exe
```

4. Update the path inside `main.py`:

```python
STOCKFISH_PATH = "./engines/stockfish/stockfish-windows-x86-64-avx2.exe"
```

> Stockfish is not bundled with this repository.

---

## 🚀 Usage

Run:

```bash
python main.py
```

You will see:

```text
Enter a FEN (or press Enter for starting position):
```

### Analyse the starting position

Just press:

```text
Enter
```

Example output:

```text
Stockfish thinking...
Best move: e2e4
```

---

### Analyse a custom position

Input a FEN string:

```text
r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4
```

Output:

```text
Stockfish thinking...
Best move: Nc3 (b1c3)
```

---

## 🧠 How It Works

MonsterGambit launches Stockfish as a subprocess and communicates through the **Universal Chess Interface (UCI)** protocol.

This keeps the project simple, reliable, and avoids unnecessary complexity.

---

## 📁 Project Structure

```text
monsterGambit/
├── main.py
├── engines/
│   └── stockfish/
├── .gitignore
├── README.md
└── LICENSE (optional)
```

---

## 🛠️ Roadmap

* [ ] Show top 3 recommended moves
* [ ] Add evaluation score (centipawns / mate)
* [ ] Adjustable analysis depth
* [ ] PGN batch analysis
* [ ] Web interface
* [ ] Desktop GUI

---

## 🤝 Contributing

Contributions, ideas, and pull requests are welcome.

If you find a bug or want to improve the project, open an issue.

---

## 📜 License

MIT License (optional — add a `LICENSE` file if you want open-source reuse).

---

## 🙌 Acknowledgements

* Stockfish — open-source chess engine
* python-chess — Python chess toolkit

Built by **JotaP-Brito**
