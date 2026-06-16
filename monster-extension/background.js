const STOCKFISH_URL = 'http://127.0.0.1:5000/bestmove';

// Keep service worker alive as long as a content script is connected
chrome.runtime.onConnect.addListener(port => {
  console.log('Content script connected');
  port.onMessage.addListener(async (request) => {
    if (request.type === 'getMove') {
      const time = request.time || 0.5;
      const url = `${STOCKFISH_URL}?fen=${encodeURIComponent(request.fen)}&time=${time}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        port.postMessage({ move: data.san || '?' });
      } catch (err) {
        port.postMessage({ move: 'Error' });
      }
    }
  });
  port.onDisconnect.addListener(() => {
    console.log('Content script disconnected');
  });
});