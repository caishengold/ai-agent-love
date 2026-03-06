import http from 'http';

const BASE = 'http://localhost:3000';
const PAGES = [
  '/',
  '/agents',
  '/confessions',
  '/couples',
  '/developers',
  '/leaderboard',
  '/matches',
  '/play',
  '/privacy',
  '/protocol',
  '/register',
  '/relationship',
  '/terms',
  '/witness',
];

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 15000);
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
  const consoleErrors = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      const ex = msg.params.exceptionDetails;
      jsErrors.push(ex.exception?.description || ex.text || 'unknown');
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      consoleErrors.push(msg.params.entry.text);
    }
  });

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Log.enable');

  let httpStatus = 0;
  const navResult = await cdpSend(ws, 'Page.navigate', { url: `${BASE}${url}` });
  if (navResult.errorText) {
    ws.close();
    await closeTarget(info.id);
    return { url, httpStatus: 0, error: navResult.errorText, jsErrors, consoleErrors, pageData: {} };
  }

  await new Promise(r => setTimeout(r, 4000));

  const expr = `(() => {
    const body = document.body?.innerText || '';
    const headings = [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ': ' + h.textContent.trim());
    const inputs = [...document.querySelectorAll('input')].map(i => i.placeholder || i.type || 'input');
    const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
    const nextError = document.querySelector('#__next-route-announcer__')?.nextElementSibling;
    const hasNextError = document.body.innerHTML.includes('Application error') || document.body.innerHTML.includes('Internal Server Error') || document.body.innerHTML.includes('404');
    const title = document.title || '';
    return JSON.stringify({
      title,
      bodyLen: body.length,
      bodyText: body.slice(0, 800),
      headings,
      inputs,
      buttons: buttons.slice(0, 10),
      hasNextError,
    });
  })()`;

  const result = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });

  let pageData = {};
  try { pageData = JSON.parse(result.result.value); } catch {}

  ws.close();
  await closeTarget(info.id);
  return { url, jsErrors, consoleErrors, pageData };
}

async function main() {
  console.log('=== CDP All Pages Check ===\n');
  const results = [];

  for (const url of PAGES) {
    try {
      const r = await checkPage(url);
      const hasJsErr = r.jsErrors.length > 0;
      const hasNextErr = r.pageData.hasNextError;
      const ok = !hasJsErr && !hasNextErr;
      const icon = ok ? '✅' : '❌';

      console.log(`${icon} ${r.url}  (title: "${r.pageData.title}")`);
      console.log(`   Headings: ${JSON.stringify(r.pageData.headings || [])}`);
      console.log(`   Buttons: ${JSON.stringify(r.pageData.buttons || [])}`);
      console.log(`   Inputs: ${JSON.stringify(r.pageData.inputs || [])}`);
      console.log(`   Body length: ${r.pageData.bodyLen || 0} chars`);

      const text = (r.pageData.bodyText || '');
      const contentLines = text.split('\n').filter(Boolean);
      const navEnd = contentLines.findIndex(l => l.includes('Register') || l.includes('Sign In'));
      const mainContent = contentLines.slice(navEnd + 1).join(' | ').slice(0, 300);
      console.log(`   Main content: ${mainContent}`);

      if (hasJsErr) {
        console.log(`   ❌ JS Errors (${r.jsErrors.length}):`);
        r.jsErrors.forEach(e => console.log(`     ${e.slice(0, 250)}`));
      }
      if (r.consoleErrors.length > 0) {
        console.log(`   ⚠️ Console errors (${r.consoleErrors.length}):`);
        r.consoleErrors.forEach(e => console.log(`     ${e.slice(0, 250)}`));
      }
      if (hasNextErr) {
        console.log(`   ❌ Page contains error message (Application error / 500 / 404)`);
      }
      console.log();
      results.push({ url, ok });
    } catch (err) {
      console.log(`❌ ${url} — exception: ${err.message}\n`);
      results.push({ url, ok: false });
    }
  }

  console.log('=== Summary ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.log('Failed pages:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.url}`));
  }
}

main().catch(console.error);
