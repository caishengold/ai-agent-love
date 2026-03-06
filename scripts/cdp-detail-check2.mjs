import http from 'http';

const BASE = 'http://localhost:3000';
const PAGES = [
  '/play',
  '/play?game=mindmeld',
  '/play?game=chains',
  '/play?game=blind-dates',
  '/play?game=battles',
  '/play?game=secret',
  '/play?game=wingman',
  '/play?game=challenges',
  '/play?game=forecast',
  '/play?game=tokens',
];

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 10000);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function getWsUrl() {
  return new Promise((resolve, reject) => {
    const req = http.request('http://localhost:9222/json/new', { method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function closeTarget(targetId) {
  return new Promise((resolve) => {
    http.get(`http://localhost:9222/json/close/${targetId}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', () => resolve(''));
  });
}

async function checkPage(url) {
  const info = await getWsUrl();
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  const jsErrors = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      const ex = msg.params.exceptionDetails;
      jsErrors.push(ex.exception?.description || ex.text || 'unknown error');
    }
  });

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Page.navigate', { url: `${BASE}${url}` });

  // Wait for page load + client hydration
  await new Promise(r => setTimeout(r, 4000));

  const expr = `(() => {
    const body = document.body?.innerText || '';
    const headings = [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ': ' + h.textContent.trim());
    const inputs = [...document.querySelectorAll('input')].map(i => 'input[' + (i.placeholder || i.type) + ']');
    const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
    const links = [...document.querySelectorAll('a')].map(a => a.href).filter(h => h.includes('/play') || h.includes('/agents'));
    const imgs = document.querySelectorAll('img').length;
    return JSON.stringify({
      bodyText: body.slice(0, 1500),
      headings,
      inputs,
      buttons,
      relevantLinks: links.slice(0, 15),
      imgCount: imgs,
    });
  })()`;

  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
  });

  let pageData = {};
  try { pageData = JSON.parse(result.result.value); } catch {}

  ws.close();
  await closeTarget(info.id);
  return { url, pageData, jsErrors };
}

async function main() {
  console.log('=== CDP Detailed Content Inspection ===\n');
  for (const url of PAGES) {
    try {
      const r = await checkPage(url);
      const ok = r.jsErrors.length === 0;
      console.log(`${ok ? '✅' : '❌'} ${r.url}`);
      console.log(`   Headings: ${JSON.stringify(r.pageData.headings)}`);
      console.log(`   Buttons: ${JSON.stringify(r.pageData.buttons)}`);
      console.log(`   Inputs: ${JSON.stringify(r.pageData.inputs)}`);
      console.log(`   Body text (first 500 chars):`);
      const text = (r.pageData.bodyText || '').slice(0, 500);
      text.split('\n').filter(Boolean).forEach(line => console.log(`     | ${line}`));
      if (r.jsErrors.length > 0) {
        console.log(`   ❌ JS Errors:`);
        r.jsErrors.forEach(e => console.log(`     ${e.slice(0, 300)}`));
      }
      console.log();
    } catch (err) {
      console.log(`❌ ${url} — ${err.message}\n`);
    }
  }
}

main().catch(console.error);
