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
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
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
      res.on('end', () => {
        const info = JSON.parse(data);
        resolve({ wsUrl: info.webSocketDebuggerUrl, targetId: info.id });
      });
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
  const { wsUrl, targetId } = await getWsUrl();
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.on('open', r));

  const consoleMessages = [];
  const errors = [];

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Console.messageAdded') {
      const entry = msg.params.message;
      if (entry.level === 'error' || entry.level === 'warning') {
        consoleMessages.push(`[${entry.level}] ${entry.text}`);
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const ex = msg.params.exceptionDetails;
      errors.push(ex.text || ex.exception?.description || JSON.stringify(ex));
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') {
        errors.push(`[LOG] ${e.text}`);
      }
    }
  });

  await cdpSend(ws, 'Console.enable');
  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Log.enable');
  await cdpSend(ws, 'Page.enable');

  await cdpSend(ws, 'Page.navigate', { url: `${BASE}${url}` });
  await new Promise(r => setTimeout(r, 3000));

  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const title = document.querySelector('h1,h2')?.textContent || '';
      const bodyLen = document.body?.innerText?.length || 0;
      const links = document.querySelectorAll('a[href]').length;
      const buttons = document.querySelectorAll('button').length;
      const errorEl = document.querySelector('.error, [data-error]');
      return JSON.stringify({ title, bodyLen, links, buttons, hasErrorEl: !!errorEl });
    })()`,
    returnByValue: true,
  });

  let pageInfo = {};
  try { pageInfo = JSON.parse(result.result.value); } catch {}

  ws.close();
  await closeTarget(targetId);

  return { url, pageInfo, consoleErrors: consoleMessages, jsErrors: errors };
}

async function main() {
  console.log('=== CDP Page Check ===\n');
  for (const page of PAGES) {
    try {
      const r = await checkPage(page);
      const status = r.jsErrors.length === 0 && !r.pageInfo.hasErrorEl ? '✅' : '❌';
      console.log(`${status} ${r.url}`);
      console.log(`   title: "${r.pageInfo.title}" | bodyLen: ${r.pageInfo.bodyLen} | links: ${r.pageInfo.links} | buttons: ${r.pageInfo.buttons}`);
      if (r.consoleErrors.length > 0) {
        console.log(`   console warnings/errors:`);
        r.consoleErrors.forEach(e => console.log(`     ${e}`));
      }
      if (r.jsErrors.length > 0) {
        console.log(`   JS exceptions:`);
        r.jsErrors.forEach(e => console.log(`     ${e}`));
      }
      console.log();
    } catch (err) {
      console.log(`❌ ${page} — failed: ${err.message}\n`);
    }
  }
}

main().catch(console.error);
