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
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 30000);
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
      jsErrors.push(ex.exception?.description || ex.text || 'unknown');
    }
  });

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');

  const start = Date.now();
  await cdpSend(ws, 'Page.navigate', { url: `${BASE}${url}` });

  // Wait for load event + hydration (longer for SSR pages)
  await new Promise(r => setTimeout(r, 25000));
  const loadTime = Date.now() - start;

  const expr = `(() => {
    const body = document.body?.innerText || '';
    const headings = [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ': ' + h.textContent.trim()).slice(0, 8);
    const inputs = [...document.querySelectorAll('input')].map(i => i.placeholder || i.type || 'input');
    const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 8);
    const title = document.title || '';
    const hasAppError = body.includes('Application error') || body.includes('Internal Server Error');
    const hasUnhydrated = document.querySelector('[data-nextjs-error]') !== null;

    // Get main content area (skip nav/footer)
    const allText = body.split('\\n').filter(Boolean);
    const navEnd = allText.findIndex(l => l === 'Register' || l === 'Sign In');
    const footerStart = allText.findIndex((l, i) => i > navEnd + 3 && l.includes('AgentLove —'));
    const mainLines = allText.slice(navEnd >= 0 ? navEnd + 1 : 0, footerStart > 0 ? footerStart : undefined);
    const mainContent = mainLines.join(' | ').slice(0, 600);

    return JSON.stringify({
      title, bodyLen: body.length,
      headings, inputs, buttons,
      hasAppError, hasUnhydrated,
      mainContent,
    });
  })()`;

  const result = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  let pageData = {};
  try { pageData = JSON.parse(result.result.value); } catch {}

  ws.close();
  await closeTarget(info.id);
  return { url, jsErrors, pageData, loadTime };
}

async function main() {
  console.log('=== CDP Full Site Check (with 25s wait per page) ===\n');
  const results = [];

  for (const url of PAGES) {
    try {
      const r = await checkPage(url);
      const hasJsErr = r.jsErrors.length > 0;
      const hasAppErr = r.pageData.hasAppError;
      const tooShort = (r.pageData.bodyLen || 0) < 50;
      const ok = !hasJsErr && !hasAppErr && !tooShort;
      const icon = ok ? '✅' : '❌';

      console.log(`${icon} ${r.url}  [${(r.loadTime/1000).toFixed(1)}s] (title: "${r.pageData.title}")`);
      console.log(`   Headings: ${JSON.stringify(r.pageData.headings)}`);
      console.log(`   Buttons: ${JSON.stringify(r.pageData.buttons)}`);
      console.log(`   Inputs: ${JSON.stringify(r.pageData.inputs)}`);
      console.log(`   Body: ${r.pageData.bodyLen} chars`);
      console.log(`   Content: ${r.pageData.mainContent}`);
      if (hasJsErr) {
        console.log(`   ❌ JS Errors:`);
        r.jsErrors.forEach(e => console.log(`     ${e.slice(0, 200)}`));
      }
      if (hasAppErr) console.log(`   ❌ Application/Server Error on page`);
      console.log();
      results.push({ url, ok, reason: hasAppErr ? 'app-error' : hasJsErr ? 'js-error' : tooShort ? 'empty' : '' });
    } catch (err) {
      console.log(`❌ ${url} — exception: ${err.message}\n`);
      results.push({ url, ok: false, reason: err.message });
    }
  }

  console.log('=== Summary ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\nFailed pages:');
    failed.forEach(r => console.log(`  ❌ ${r.url} — ${r.reason}`));
  }
}

main().catch(console.error);
