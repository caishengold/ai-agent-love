import http from 'http';

const BASE = 'http://localhost:3000';

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 30000);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) { clearTimeout(timeout); ws.removeListener('message', handler); resolve(msg.result); }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const info = await new Promise((resolve, reject) => {
    const req = http.request('http://localhost:9222/json/new', { method: 'PUT' }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
    }); req.on('error', reject); req.end();
  });

  const { WebSocket } = await import('ws');
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  const jsErrors = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      jsErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    }
  });

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Page.navigate', { url: `${BASE}/confessions` });
  await new Promise(r => setTimeout(r, 25000));

  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const h = [...document.querySelectorAll('h1')].map(h => h.textContent.trim());
      const body = document.body?.innerText?.slice(0, 500) || '';
      const hasError = body.includes('Something went wrong') || body.includes('Application error');
      return JSON.stringify({ headings: h, hasError, bodySnippet: body });
    })()`,
    returnByValue: true,
  });

  const pd = JSON.parse(result.result.value);
  ws.close();
  http.get(`http://localhost:9222/json/close/${info.id}`, () => {});

  console.log(`${jsErrors.length === 0 && !pd.hasError ? '✅' : '❌'} /confessions`);
  console.log(`  Headings: ${JSON.stringify(pd.headings)}`);
  console.log(`  Has error page: ${pd.hasError}`);
  console.log(`  JS errors: ${jsErrors.length}`);
  if (jsErrors.length > 0) jsErrors.forEach(e => console.log(`    ${e.slice(0, 200)}`));
  console.log(`  Content: ${pd.bodySnippet.split('\n').filter(Boolean).slice(3, 10).join(' | ')}`);
}

main().catch(console.error);
