const STOCKFISH_URL = 'http://127.0.0.1:5000/bestmove';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getMove') {
    const time = Math.max(0.1, Math.min(request.time || 0.5, 10.0));
    const url = `${STOCKFISH_URL}?fen=${encodeURIComponent(request.fen)}&time=${time}`;

    // AbortController lets us time out the fetch if Flask is slow
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s max

    fetch(url, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        clearTimeout(timeout);
        sendResponse({ move: data.san || data.uci || '?' });
      })
      .catch(err => {
        clearTimeout(timeout);
        const msg = err.name === 'AbortError' ? 'Timeout' : 'Server error';
        console.error('MonsterGambit background error:', err);
        sendResponse({ move: `⚠ ${msg}` });
      });

    return true; // keep message channel open
  }
});