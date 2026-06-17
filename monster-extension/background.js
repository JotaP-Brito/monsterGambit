const STOCKFISH_URL = 'http://127.0.0.1:5000/bestmove';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getMove') {
    const time = Math.max(0.1, Math.min(request.time || 0.5, 10.0));
    const multipv = Math.max(1, Math.min(request.multipv || 3, 5));
    const url = `${STOCKFISH_URL}?fen=${encodeURIComponent(request.fen)}&time=${time}&multipv=${multipv}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        clearTimeout(timeout);
        sendResponse({ moves: data.moves || [] });
      })
      .catch(err => {
        clearTimeout(timeout);
        console.error('MonsterGambit background error:', err);
        sendResponse({ moves: [] });
      });

    return true;
  }
});