import http from 'http';

const BASE = 'http://localhost:3000';
const PAGES = [
  { url: '/play', check: `(() => {
    const cards = document.querySelectorAll('a[href*="/play?game="]');
    const titles = [...cards].map(c => c.querySelector('h3')?.textContent || '');
    const icons = [...cards].map(c => c.querySelector('div')?.textContent?.trim() || '');
    return JSON.stringify({ cardCount: cards.length, titles, icons });
  })()` },
  { url: '/play?game=mindmeld', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const badge = document.querySelector('.bg-red-500\\/20')?.textContent || '';
    const howItWorks = document.querySelector('h3')?.textContent || '';
    const steps = document.querySelectorAll('.text-primary.font-bold');
    const apiSection = [...document.querySelectorAll('h3')].find(e => e.textContent.includes('API'));
    const leaderboard = [...document.querySelectorAll('h3')].find(e => e.textContent.includes('Leaderboard'));
    const pre = document.querySelector('pre')?.textContent?.slice(0, 80) || '';
    return JSON.stringify({ h, badge, howItWorks, stepCount: steps.length, hasApi: !!apiSection, hasLeaderboard: !!leaderboard, preSnippet: pre });
  })()` },
  { url: '/play?game=chains', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const desc = document.querySelector('p.text-white\\/60')?.textContent || '';
    const backLink = document.querySelector('a[href="/play"]')?.textContent || '';
    const emptyMsg = document.body.innerText.includes('No chains yet');
    const chainItems = document.querySelectorAll('button.glass');
    return JSON.stringify({ h, desc, backLink, emptyMsg, chainItemCount: chainItems.length });
  })()` },
  { url: '/play?game=blind-dates', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const desc = document.querySelector('p.text-white\\/60')?.textContent || '';
    const queueBox = document.querySelector('.glass.rounded-xl.p-4.text-center')?.textContent || '';
    const emptyMsg = document.body.innerText.includes('No blind dates yet');
    const dateCards = document.querySelectorAll('.glass.rounded-xl.p-4.flex');
    return JSON.stringify({ h, desc, queueBox, emptyMsg, dateCardCount: dateCards.length });
  })()` },
  { url: '/play?game=battles', check: `(() => {
    const h = document.querySelector('.gradient-text')?.textContent || '';
    const subtitle = document.querySelector('p.text-white\\/50')?.textContent || '';
    const tabs = [...document.querySelectorAll('button.px-4.py-2')].map(b => b.textContent.trim());
    const emptyMsg = document.body.innerText.includes('No battles');
    const battleCards = document.querySelectorAll('.relative.rounded-2xl.overflow-hidden');
    return JSON.stringify({ h, subtitle, tabs, emptyMsg, battleCardCount: battleCards.length });
  })()` },
  { url: '/play?game=secret', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const desc = document.querySelector('p.text-white\\/60')?.textContent || '';
    const input = document.querySelector('input[placeholder]');
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Check'));
    return JSON.stringify({ h, desc, hasInput: !!input, placeholder: input?.placeholder || '', hasCheckBtn: !!btn });
  })()` },
  { url: '/play?game=wingman', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const desc = document.querySelector('p.text-white\\/60')?.textContent || '';
    const emptyMsg = document.body.innerText.includes('No wingmen yet');
    const leaderItems = document.querySelectorAll('.glass.rounded-xl.p-4.flex');
    return JSON.stringify({ h, desc, emptyMsg, leaderItemCount: leaderItems.length });
  })()` },
  { url: '/play?game=challenges', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const challengeCards = document.querySelectorAll('.glass.rounded-xl.p-5');
    const completedHeader = [...document.querySelectorAll('h3')].find(e => e.textContent.includes('Completed'));
    return JSON.stringify({ h, challengeCardCount: challengeCards.length, hasCompletedSection: !!completedHeader });
  })()` },
  { url: '/play?game=forecast', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const input = document.querySelector('input[placeholder]');
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Get Forecast'));
    return JSON.stringify({ h, hasInput: !!input, placeholder: input?.placeholder || '', hasForecastBtn: !!btn });
  })()` },
  { url: '/play?game=tokens', check: `(() => {
    const h = document.querySelector('h2')?.textContent || '';
    const desc = document.querySelector('p.text-white\\/60')?.textContent || '';
    const table = document.querySelector('table');
    const rows = table ? table.querySelectorAll('tbody tr') : [];
    const rowTexts = [...rows].map(r => r.textContent.trim());
    const input = document.querySelector('input[placeholder]');
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Check'));
    return JSON.stringify({ h, desc, hasTable: !!table, rowCount: rows.length, rowTexts, hasInput: !!input, hasCheckBtn: !!btn });
  })()` },
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

async function checkPage(page) {
  const { wsUrl, targetId } = await getWsUrl();
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.on('open', r));

  const jsErrors = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      const ex = msg.params.exceptionDetails;
      jsErrors.push(ex.exception?.description || ex.text || JSON.stringify(ex));
    }
  });

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Page.navigate', { url: `${BASE}${page.url}` });
  await new Promise(r => setTimeout(r, 3500));

  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression: page.check,
    returnByValue: true,
  });

  let info = {};
  try { info = JSON.parse(result.result.value); } catch {}

  ws.close();
  await closeTarget(targetId);
  return { url: page.url, info, jsErrors };
}

async function main() {
  console.log('=== CDP Detailed Content Check ===\n');
  for (const page of PAGES) {
    try {
      const r = await checkPage(page);
      const hasErr = r.jsErrors.length > 0;
      console.log(`${hasErr ? '❌' : '✅'} ${r.url}`);
      console.log(`   ${JSON.stringify(r.info, null, 2).split('\n').join('\n   ')}`);
      if (hasErr) {
        console.log(`   JS Errors:`);
        r.jsErrors.forEach(e => console.log(`     ${e.slice(0, 200)}`));
      }
      console.log();
    } catch (err) {
      console.log(`❌ ${page.url} — failed: ${err.message}\n`);
    }
  }
}

main().catch(console.error);
