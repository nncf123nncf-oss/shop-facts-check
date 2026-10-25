// 投稿カード用の素材を撮る（Chrome headless / CDP・DPR2）。実行: node source/shoot.js <出力フォルダ>
// 01-x-primary: 560px幅・②の印をつけた文〜件数（Card1の第一候補）／02-results-desktop: 1000px幅・2列（Card2）／03-marks-375: 375px幅・印をつけた文（予備）
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8790, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const rect = sel => `(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}})()`;
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
const pad = (a, p) => ({ x: Math.max(0, a.x - p), y: Math.max(0, a.y - p), width: a.w + p * 2, height: a.h + p * 2 });
// 例のお店（架空）と例文（ミナトが手で作った架空の文。実際のAIの出力ではない）を入れる
const fill = `localStorage.clear();window.confirm=()=>true;document.getElementById('tab-check').click();document.getElementById('sampletext').click();document.getElementById('samplemsg').textContent=''`;

(async () => {
  const b = await launch(9471);
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  // 01: 560px・印をつけた文の見出し〜結果の件数
  await b.open(ORIGIN, 560, 2000, 2, true, 'light');
  await b.ev(fill); await b.sleep(500);
  const h3 = await b.ev(rect('#pane-check h3')), pills = await b.ev(rect('#summary .summary'));
  await b.shot(path.join(OUT, '01-x-primary.png'), pad(union(h3, pills), 14));
  // 03: 375px・印をつけた文（予備）
  await b.open(ORIGIN, 375, 2000, 2, true, 'light');
  await b.ev(fill); await b.sleep(500);
  const h3b = await b.ev(rect('#pane-check h3')), mk = await b.ev(rect('#marked'));
  await b.shot(path.join(OUT, '03-marks-375.png'), pad(union(h3b, mk), 12));
  // 02: 680px・結果の一覧（件数〜4番目の項目まで。Card1の「印をつけた文」とは別の部分）
  await b.open(ORIGIN, 680, 2400, 2, false, 'light');
  await b.ev(fill); await b.sleep(500);
  const h2 = await b.ev(rect('#pane-check .sticky h2')), li4 = await b.ev(rect('#items li:nth-child(4)'));
  await b.shot(path.join(OUT, '02-results-list.png'), pad(union(h2, li4), 14));
  // 04: 1000px・2列（予備）
  await b.open(ORIGIN, 1000, 2600, 2, false, 'light');
  await b.ev(fill); await b.sleep(500);
  const lay = await b.ev(rect('#pane-check .layout'));
  await b.shot(path.join(OUT, '04-desktop-2col.png'), pad(lay, 8));
  console.log(JSON.stringify({ h3, pills, h2, li4, lay }));
  b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
