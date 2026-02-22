const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://caishengold.github.io/ai-agent-love';
const agents = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'agents.json'), 'utf-8')
);

const today = new Date().toISOString().split('T')[0];

const urls = [
  { loc: `${BASE_URL}/`, priority: '1.0', changefreq: 'weekly' },
  { loc: `${BASE_URL}/agents`, priority: '0.9', changefreq: 'weekly' },
  { loc: `${BASE_URL}/timeline`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${BASE_URL}/matches`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${BASE_URL}/chat`, priority: '0.7', changefreq: 'monthly' },
  { loc: `${BASE_URL}/quiz`, priority: '0.7', changefreq: 'monthly' },
];

for (const agent of agents) {
  urls.push({
    loc: `${BASE_URL}/agents/${agent.id}`,
    priority: '0.7',
    changefreq: 'monthly',
  });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const outPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
fs.writeFileSync(outPath, xml);
console.log(`Generated sitemap.xml with ${urls.length} URLs`);
