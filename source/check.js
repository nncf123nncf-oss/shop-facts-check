// 実画面の確認（Chrome headless / CDP）。実行: node source/check.js <出力フォルダ>
// 375px/1000pxの矩形、ライト/ダーク、例文→照らし合わせ、XSS、端末への保存の中身、操作中の通信、書き出し→読み込み
const fs = require('fs'), path = require('path'), http = require('http');
const { launch } = require('./cdp');
const OUT = path.resolve(process.argv[2] || 'check-out');
fs.mkdirSync(OUT, { recursive: true });
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'));
const PORT = 8788, ORIGIN = 'http://127.0.0.1:' + PORT + '/';
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(PORT);
const measure = `(()=>{const out={sw:document.documentElement.scrollWidth,iw:innerWidth,over:[],small:[]};
  document.querySelectorAll('main *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>innerWidth+0.5)out.over.push(e.tagName+'.'+e.className)});
  document.querySelectorAll('main button, main input, main summary, main textarea, main label.chk').forEach(e=>{if(e.type==='checkbox')return;const r=e.getBoundingClientRect();if(r.width&&(r.height<43.5||r.width<43.5))out.small.push((e.textContent||e.type||e.tagName).slice(0,14)+':'+Math.round(r.width)+'x'+Math.round(r.height))});
  out.over=[...new Set(out.over)].slice(0,8);out.small=out.small.slice(0,8);return out})()`;
const setVal = (id, v) => `(()=>{const e=document.getElementById('${id}');e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`;
const click = id => `document.getElementById('${id}').click()`;
const summary = `[document.getElementById('summary').innerText.replace(/\\n+/g,' / '), [...document.querySelectorAll('#marked .mk')].map(e=>e.className.replace('mk ','')+':'+e.textContent)]`;

(async () => {
  const b = await launch(9451);
  const reqs = []; let phase = 'load';
  b.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push(phase + ' ' + m.params.request.url.slice(0, 80)); });
  await b.send('Network.enable');
  if (!process.env.CHECK_BEACON) await b.send('Network.setBlockedURLs', { urls: ['*cloudflareinsights.com*'] });
  await b.send('Browser.grantPermissions', { origin: ORIGIN.slice(0, -1), permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});

  // 初回: 未登録なので①が開く
  await b.open(ORIGIN, 375, 667, 2, true, 'light');
  console.log('first-tab', JSON.stringify(await b.ev(`[document.getElementById('tab-shop').getAttribute('aria-selected'), Math.round(document.getElementById('shopname').getBoundingClientRect().top), innerHeight]`)));
  console.log('light-375-shop-empty', JSON.stringify(await b.ev(measure)));
  for (const scheme of ['light', 'dark']) {
    await b.open(ORIGIN, 375, 812, 2, true, scheme);
    phase = 'ops-' + scheme;
    await b.ev(`window.confirm=()=>true;localStorage.clear();location.reload()`); await b.sleep(800);
    await b.ev(click('tab-check')); await b.sleep(100);
    console.log(scheme + '-gate', JSON.stringify(await b.ev(`!document.getElementById('gate').hidden`)));
    await b.ev(`window.confirm=()=>true;` + click('sampletext')); await b.sleep(400);
    console.log(scheme + '-375-check', JSON.stringify(await b.ev(measure)));
    console.log(scheme + '-ai-top', JSON.stringify(await b.ev(`[Math.round(document.getElementById('ai').getBoundingClientRect().top+scrollY), innerHeight]`)));
    console.log(scheme + '-summary', JSON.stringify(await b.ev(summary)));
    await b.shot(path.join(OUT, 'check-375-' + scheme + '.png'), { x: 0, y: 0, width: 375, height: Math.min(9000, await b.ev('document.documentElement.scrollHeight')) });
    await b.ev(click('tab-shop')); await b.sleep(200);
    console.log(scheme + '-375-shop', JSON.stringify(await b.ev(measure)));
    await b.shot(path.join(OUT, 'check-375-shop-' + scheme + '.png'), { x: 0, y: 0, width: 375, height: Math.min(9000, await b.ev('document.documentElement.scrollHeight')) });
  }
  phase = 'after';
  // 端末への保存: 店の情報だけ。貼った文は入らない
  await b.ev(click('tab-check')); await b.ev(setVal('ai', 'ひみつの文ABC カット4,950円')); await b.sleep(400);
  console.log('storage', JSON.stringify(await b.ev(`(async()=>{const v=localStorage.getItem('mw-day079-shop')||'';return {keys:Object.keys(localStorage), hasShop:v.includes('ヘアサロン'), hasText:v.includes('ひみつ'), ss:sessionStorage.length, idb:(indexedDB.databases?(await indexedDB.databases()).length:'n/a'), cookie:document.cookie}})()`)));
  // 再読み込み: 登録は残り②が開く、貼った文は消える
  await b.ev('location.reload()'); await b.sleep(900);
  console.log('reload', JSON.stringify(await b.ev(`[document.getElementById('tab-check').getAttribute('aria-selected'), document.getElementById('ai').value]`)));
  // 登録を直すと②の結果が変わる（終了を20:00に）
  await b.ev(click('tab-shop'));
  await b.ev(`(()=>{const i=[...document.querySelectorAll('#hours input[type=text]')];['mon','tue','wed','thu','fri'];[1,5,7,9].forEach(k=>{i[k].value='20:00';i[k].dispatchEvent(new Event('input'))})})()`); await b.sleep(300);
  await b.ev(click('tab-check')); await b.ev(setVal('ai', '平日10時〜20時')); await b.sleep(400);
  console.log('edit-shop', JSON.stringify(await b.ev(summary)));
  // 曜日の休みの切り替え
  await b.ev(click('tab-shop')); await b.ev(`(()=>{const c=document.querySelectorAll('#hours input[type=checkbox]')[2];c.checked=true;c.dispatchEvent(new Event('change'))})()`); await b.sleep(300);
  await b.ev(click('tab-check')); await b.ev(setVal('ai', '水曜定休')); await b.sleep(400);
  console.log('toggle-closed', JSON.stringify(await b.ev(summary)));
  // 開け閉めの欄が「押せる」見た目か（▶の印・枠）。押すと開いて「登録を文字でコピー」が見える
  await b.ev(click('tab-shop'));
  // 「登録を文字でコピー」は欄を開かなくても見える。読み込みの欄は ▶ と枠つき、押すと ▼ になり貼る欄が見える
  console.log('summary-look', JSON.stringify(await b.ev(`(()=>{const s=document.querySelector('details > summary');const cs=getComputedStyle(s);return {exportVisible:document.getElementById('exportbtn').getBoundingClientRect().height>0, marker:getComputedStyle(s,'::before').content, border:cs.borderTopWidth, h:Math.round(s.getBoundingClientRect().height), importVisibleBefore:document.getElementById('importbox').getBoundingClientRect().height>0}})()`)));
  await b.ev(`document.querySelector('details > summary').click()`); await b.sleep(100);
  console.log('summary-open', JSON.stringify(await b.ev(`[getComputedStyle(document.querySelector('details > summary'),'::before').content, document.getElementById('importbox').getBoundingClientRect().height>0]`)));
  // 書き出し→消す→読み込み
  await b.ev(click('exportbtn')); await b.sleep(300);
  // headlessではクリップボードを読めないことがある。そのときは手動コピー用の欄（コピーできなかったときに出る）から取る
  let exported = await b.ev(`(async()=>{try{return await navigator.clipboard.readText()}catch(e){return 'read-failed:'+e.name}})()`);
  if (exported.startsWith('read-failed')) exported = await b.ev(`document.getElementById('exportbox').value`);
  console.log('export', JSON.stringify([await b.ev(`document.getElementById('exportmsg').textContent`), exported.slice(0, 50)]));
  // 書き出した全文が欄に出て、手でコピーする経路では最後の文字まで選ばれている
  console.log('export-box', JSON.stringify(await b.ev(`(()=>{const x=document.getElementById('exportbox');const r=x.getBoundingClientRect();return {shown:!x.hidden, len:x.value.length, selStart:x.selectionStart, selEnd:x.selectionEnd, endsWith:x.value.slice(-2), fullyVisible:x.scrollHeight<=x.clientHeight+2, h:Math.round(r.height), share:!document.getElementById('sharebtn').hidden}})()`)));
  await b.ev(`window.confirm=()=>true;` + click('resetshop')); await b.sleep(200);
  console.log('after-reset', JSON.stringify(await b.ev(`[localStorage.getItem('mw-day079-shop'), document.getElementById('updated').textContent]`)));
  await b.ev(setVal('importbox', '{"app":')); await b.ev(click('importbtn'));
  console.log('import-broken', JSON.stringify(await b.ev(`document.getElementById('importmsg').textContent`)));
  await b.ev(setVal('importbox', exported)); await b.ev(click('importbtn')); await b.sleep(200);
  console.log('import-ok', JSON.stringify(await b.ev(`[document.getElementById('importmsg').textContent, document.getElementById('shopname').value, document.querySelectorAll('#hours input[type=checkbox]:checked').length]`)));
  // XSS
  await b.ev(`window.__x=0;` + setVal('shopname', '<img src=x onerror="window.__x=1">'));
  await b.ev(`(()=>{const n=document.querySelector('#nots input');n.value='<img src=x onerror="window.__x=2">';n.dispatchEvent(new Event('input'))})()`); await b.sleep(300);
  await b.ev(click('tab-check')); await b.ev(setVal('ai', '<img src=x onerror="window.__x=3">"><script>window.__x=4</script> <img src=x onerror="window.__x=2"> カット4,950円')); await b.sleep(400);
  console.log('xss', JSON.stringify(await b.ev(`({x:window.__x, imgs:document.querySelectorAll('main img').length, scripts:document.querySelectorAll('main script').length, marked:document.getElementById('marked').innerText.slice(0,60)})`)));
  // 印のラベルだけが行末に残り、対象の文字が次の行へ送られる数（tadasuの指摘の再計測。0件であること）
  await b.open(ORIGIN, 375, 2000, 2, true, 'light');
  await b.ev(`window.confirm=()=>true;document.getElementById('tab-check').click()`);
  await b.ev(setVal('ai', 'ご予約は https://example.com/very/long/path/to/reservation/page/salon-mihon から。お店は東京都架空区見本町1-2-3。料金 123,456,789円。営業時間は平日10時〜20時。電話 03-0000-0021')); await b.sleep(400);
  console.log('label-orphans', JSON.stringify(await b.ev(`(()=>{const ms=[...document.querySelectorAll('#marked .mk')];return {marks:ms.length, orphans:ms.filter(m=>{const l=m.querySelector('.lb').getBoundingClientRect();const t=m.querySelector('.head').lastChild;const r=document.createRange();r.setStart(t,0);r.setEnd(t,t.length);return Math.abs(r.getBoundingClientRect().top-l.top)>12}).length, sw:document.documentElement.scrollWidth}})()`)));
  // 一覧から本文の印へ
  await b.ev(`document.querySelector('#items button').click()`); await b.sleep(100);
  console.log('jump', JSON.stringify(await b.ev(`document.querySelectorAll('#marked .mk.flash').length`)));
  // 1000px（Card2の幅）
  await b.open(ORIGIN, 1000, 900, 2, false, 'light');
  phase = 'ops2';
  await b.ev(`window.confirm=()=>true;localStorage.clear();location.reload()`); await b.sleep(800);
  await b.ev(click('tab-check')); await b.ev(`window.confirm=()=>true;` + click('sampletext')); await b.sleep(400);
  console.log('1000', JSON.stringify(await b.ev(measure)), JSON.stringify(await b.ev(`getComputedStyle(document.querySelector('.layout')).gridTemplateColumns`)));
  await b.shot(path.join(OUT, 'check-1000.png'), { x: 0, y: 0, width: 1000, height: Math.min(9000, await b.ev('document.documentElement.scrollHeight')) });
  await b.ev(click('tab-shop')); await b.sleep(200);
  console.log('1000-shop', JSON.stringify(await b.ev(measure)));
  // 10,000字
  await b.ev(click('tab-check'));
  const big = await b.ev(`(SF.SAMPLE_TEXT+'\\n').repeat(80).slice(0,10000)`);
  const ms = await b.ev(`(()=>{const e=document.getElementById('ai');e.value=${JSON.stringify(big)};const t=performance.now();e.dispatchEvent(new Event('input'));return new Promise(r=>setTimeout(()=>r(Math.round(performance.now()-t)),400))})()`);
  console.log('10000chars', JSON.stringify(await b.ev(`document.getElementById('summary').innerText.replace(/\\n+/g,' / ')`)), 'settled-within', ms + 'ms(150ms待ち込み)');
  console.log('requests', JSON.stringify(reqs.filter(x => !x.startsWith('load'))));
  b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
