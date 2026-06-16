const STOCKFISH_URL = 'http://127.0.0.1:5000/bestmove';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getMove') {
    const time = request.time || 0.5;
    const url = `${STOCKFISH_URL}?fen=${encodeURIComponent(request.fen)}&time=${time}`;
    fetch(url)
      .then(res => res.json())
      .then(data => sendResponse({ move: data.san || '?' }))
      .catch(err => sendResponse({ move: 'Error' }));
    return true;  // keep the message channel open for async response
  }
});