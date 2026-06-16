const STOCKFISH_URL = 'http://127.0.0.1:5000/bestmove';

// Keep service worker alive as long as a content script is connected
chrome.runtime.onConnect.addListener(port => {
  console.log('Content script connected');
  port.onMessage.addListener(async (request) => {
    if (request.type === 'getMove') {
      try {
        const response = await fetch(`${STOCKFISH_URL}?fen=${encodeURIComponent(request.fen)}`);
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