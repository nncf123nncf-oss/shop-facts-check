// 純ロジックの検算。実行: node source/core-test.js
// index.html の <script id="core"> を取り出して読み込み、照らし合わせの結果を確かめる
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = { module: { exports: {} }, console, btoa, atob };
vm.createContext(ctx); vm.runInContext(src, ctx);
const SF = ctx.module.exports;
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log('NG', name, '\n  got ', g, '\n  want', w); }
}
const shop = () => SF.sanitize(JSON.parse(JSON.stringify(SF.SAMPLE_SHOP)));
// 結果を「状態:種類:見つけた文字」で並べる
const brief = (text, s) => SF.check(text, s || shop()).items.map(i => i.status + ':' + i.kind + ':' + i.found);

// S1 撮影用のサンプル
const r1 = SF.check(SF.SAMPLE_TEXT, shop());
eq('S1 items', r1.items.map(i => i.status + ':' + i.kind + ':' + i.found), [
  'diff:hours:10時〜20時', 'same:hours:10時〜17時', 'diff:day:定休日は水曜日', 'diff:price:4,500円', 'same:price:7,700円', 'check:not:駐車場', 'diff:phone:03-0000-0021']);
eq('S1 counts', r1.counts, { diff: 4, same: 2, none: 0, check: 1 });
eq('S1 tax note', /税抜の額かもしれません/.test(r1.items[3].note), true);
eq('S1 lines', r1.items.map(i => i.line), [2, 2, 3, 4, 4, 5, 6]);

// S2 時間の形
const hoursOnly = t => SF.check(t, shop()).items.filter(i => i.kind === 'hours').map(i => i.status + ':' + i.found);
eq('S2 colon', hoursOnly('月曜は10:00〜19:00です'), ['same:10:00〜19:00']);
eq('S2 ji', hoursOnly('月曜は10時〜19時です'), ['same:10時〜19時']);
eq('S2 gogo', hoursOnly('月曜は午前10時から午後7時まで'), ['same:午前10時から午後7時まで']);
eq('S2 zenkaku', hoursOnly('月曜は１０：００～１９：００'), ['same:１０：００～１９：００']);
eq('S2 bare start', hoursOnly('月曜は10〜19時'), ['same:10〜19時']);
eq('S2 hyphen', hoursOnly('月曜 10:00-19:00'), ['same:10:00-19:00']);
eq('S2 han', SF.findTimes('10時半と18:30').map(t => SF.fmt(t.min)), ['10:30', '18:30']);
eq('S2 no day, matches some', hoursOnly('営業は10時〜17時'), ['same:10時〜17時']);
eq('S2 no day, none', hoursOnly('営業は11時〜17時'), ['diff:11時〜17時']);
eq('S2 paren after', hoursOnly('10時〜17時（土日）'), ['same:10時〜17時']);
eq('S2 closed day only', hoursOnly('火曜は10時〜19時'), ['diff:10時〜19時']);
eq('S2 weekday skips closed tue', hoursOnly('平日は10時〜19時'), ['same:10時〜19時']);

// S3 単独の時刻
const timeOnly = t => SF.check(t, shop()).items.filter(i => i.kind === 'time').map(i => i.status + ':' + i.found);
eq('S3 close', timeOnly('平日は19時閉店です'), ['same:19時']);
eq('S3 close diff', timeOnly('平日は20時閉店です'), ['diff:20時']);
eq('S3 open', timeOnly('朝は10時オープン'), ['same:10時']);
eq('S3 no cue', timeOnly('14時からイベント'), []);
eq('S3 lo none', timeOnly('受付は18時まで'), ['none:18時']);
const lo = shop(); lo.lastOrder = '18:30';
eq('S3 lo same', SF.check('ラストオーダーは18:30', lo).items.map(i => i.status + ':' + i.kind), ['same:time']);

// S4 曜日
const dayOnly = t => SF.check(t, shop()).items.filter(i => i.kind === 'day').map(i => i.status + ':' + i.found);
eq('S4 tue-wed', dayOnly('火・水曜休み'), ['diff:火・水曜休み']);
eq('S4 tue', dayOnly('火曜定休です'), ['same:火曜定休']);
eq('S4 teikyu tue', dayOnly('定休日は火曜日です'), ['same:定休日は火曜日']);
eq('S4 nenjyu', dayOnly('年中無休で営業'), ['diff:年中無休']);
eq('S4 futei', dayOnly('不定休です'), ['none:不定休']);
eq('S4 open tue', dayOnly('火曜日も営業しています'), ['diff:火曜日も営業']);
eq('S4 open sat', dayOnly('土日も営業しています'), ['same:土日も営業']);
eq('S4 hol open', dayOnly('祝日も営業'), ['same:祝日も営業']);
eq('S4 hol closed', dayOnly('祝日はお休み'), ['diff:祝日はお休み']);
eq('S4 expand', [SF.expandSeq('月〜金'), SF.expandSeq('土日祝'), SF.expandSeq('火・水曜'), SF.expandSeq('平日')],
  [['mon', 'tue', 'wed', 'thu', 'fri'], ['sat', 'sun', 'hol'], ['tue', 'wed'], ['mon', 'tue', 'wed', 'thu', 'fri']]);
eq('S4 month not day', dayOnly('10月・11月は休みが増えます'), []);

// S5 金額
const priceOnly = (t, s) => SF.check(t, s || shop()).items.filter(i => i.kind === 'price').map(i => i.status + ':' + i.found);
eq('S5 yen sign', priceOnly('カット ¥4,950'), ['same:¥4,950']);
eq('S5 zei', priceOnly('カット4950円（税込）'), ['same:4950円']);
eq('S5 combo longest', priceOnly('カット＋カラーは11,000円'), ['same:11,000円']);
eq('S5 alias', priceOnly('カットとカラーで11,000円'), ['same:11,000円']);
eq('S5 ex floor', SF.check('カット 4,500円', shop()).items[0].note.indexOf('税抜') >= 0, true);
eq('S5 ex but zeikomi', SF.check('カット 4,500円（税込）', shop()).items[0].note.indexOf('税抜') >= 0, false);
eq('S5 off ignored', priceOnly('今だけ500円引き、送料800円'), []);
eq('S5 range lower', priceOnly('カラーは7,700円〜'), ['same:7,700円']);
eq('S5 unknown amount', priceOnly('トリートメント 3,300円'), ['none:3,300円']);
eq('S5 registered amount without name', priceOnly('ほかにも4,950円のコースがあります'), []);
const ex2 = shop(); ex2.menu = [{ name: '体験', alias: '', price: '3300' }];
eq('S5 round', SF.check('体験は3,000円です', ex2).items[0].note.indexOf('税抜') >= 0, true);

// S6 誤検出しない
eq('S6 no marks', brief('10月25日に、2026年の3名様向けに30分のお試し。詳しくは https://example.com/10:00 へ'),
  ['none:url:https://example.com/10:00']);
eq('S6 date', brief('2026/10/25 更新'), []);
eq('S6 duration', brief('施術は約2時間です'), []);

// S7 連絡先
const contact = t => SF.check(t, shop()).items.map(i => i.status + ':' + i.kind);
eq('S7 phone zen', contact('電話 ０３－００００－００１２'), ['same:phone']);
eq('S7 phone nohyphen', contact('電話 0300000012'), ['same:phone']);
eq('S7 phone paren', contact('電話 (03)0000-0012'), ['same:phone']);
eq('S7 email upper', contact('INFO@EXAMPLE.COM まで'), ['same:email']);
eq('S7 email diff', contact('info@example.jp まで'), ['diff:email']);
const u = shop(); u.urls = ['https://example.com/salon/', ''];
eq('S7 url slash', SF.check('予約は https://example.com/salon から', u).items.map(i => i.status), ['same']);
eq('S7 url bare', SF.check('予約は example.com/salon から', u).items.map(i => i.status), ['same']);
eq('S7 addr chome', contact('場所は東京都架空区見本町1丁目2番3号です'), ['same:address']);
eq('S7 addr bldg', contact('東京都架空区見本町1-2-3 みほんビル2階'), ['same:address']);
eq('S7 addr diff', contact('東京都架空区見本町1-2-4'), ['diff:address']);
eq('S7 addrKey', SF.addrKey('東京都架空区見本町１－２－３ ３階'), '東京都架空区見本町1-2-3');

// S8（ロジック側）: 文字はそのまま found に入る（表示はtextContent）
eq('S8 found raw', SF.check('<img src=x onerror=alert(1)>カット4,950円', shop()).items.map(i => i.found), ['4,950円']);

// S9 読み込みの検査
eq('S9 roundtrip', JSON.stringify(SF.importText(SF.exportText(shop())).shop), JSON.stringify(shop()));
eq('S9 broken', !!SF.importText('{"app":').error, true);
eq('S9 other', !!SF.importText('{"a":1}').error, true);
eq('S9 huge', !!SF.importText('x'.repeat(50001)).error, true);
const evil = SF.importText(JSON.stringify({ app: 'shop-facts-check', v: 1, shop: { name: 1, hours: { mon: { closed: 'yes', open: {}, close: '19:00' }, evil: {} }, menu: [null, 5, { name: 'a', price: '1', x: 'y' }], __proto__: { p: 1 } } })).shop;
eq('S9 sanitize', [evil.name, evil.hours.mon.closed, evil.hours.mon.open, evil.hours.mon.close, evil.menu.length, Object.keys(evil.menu[0]), evil.hours.evil], ['', false, '', '19:00', 1, ['name', 'alias', 'price'], undefined]);
eq('S9 empty', [SF.isEmpty(SF.blankShop()), SF.isEmpty(shop())], [true, false]);

// S10 0件（食い違いなし）
const ok = SF.check('火曜定休、平日10:00〜19:00、カット4,950円', shop());
eq('S10 counts', ok.counts, { diff: 0, same: 3, none: 0, check: 0 });

// レビュー①の再現入力（2026-10-25）
const all = t => SF.check(t, shop()).items.map(i => i.status + ':' + i.kind + ':' + i.found);
// 重大1 括弧の中の定休日を、営業時間の曜日として読まない
eq('R1 paren teikyu', all('営業時間 10:00〜19:00（火曜定休）'), ['same:hours:10:00〜19:00', 'same:day:火曜定休']);
eq('R1 paren teikyu ji', all('10時〜19時（火曜定休）'), ['same:hours:10時〜19時', 'same:day:火曜定休']);
// 重大2 長音で終わるメニュー名
eq('R2 color space diff', priceOnly('カラー 8,800円'), ['diff:8,800円']);
eq('R2 color nospace', priceOnly('カラー7,700円'), ['same:7,700円']);
eq('R2 color space', priceOnly('カラー 7,700円'), ['same:7,700円']);
eq('R2 combo', priceOnly('カット＋カラー 11,000円'), ['same:11,000円']);
eq('R2 two menus', priceOnly('カット 4,950円 / カラー 7,700円'), ['same:4,950円', 'same:7,700円']);
eq('R2 phone choon', SF.check('電話 03ー0000ー0012', shop()).items.map(i => i.status), ['same']);
// 重大3 全角コロンの後ろの時刻
eq('R3 colon', hoursOnly('営業時間：10:00〜20:00'), ['diff:10:00〜20:00']);
eq('R3 colon ji', hoursOnly('営業時間:10時〜20時'), ['diff:10時〜20時']);
eq('R3 seconds', SF.findTimes('12:10:00').length, 0);
// 重大4 営業時間でない範囲
['イベントは14時〜16時です', 'お昼休みは12時〜13時です', 'お電話受付は10時〜18時', '7時〜9時の朝活レッスン', 'ワークショップを13:00〜15:00に開催', '10時〜12時はお昼休み']
  .forEach((t, i) => eq('R4 not hours ' + i, hoursOnly(t), []));
eq('R4 phone uketsuke', all('電話 03-0000-0012（受付10時〜18時）'), ['same:phone:03-0000-0012']);
// 重大5 否定
eq('R5 not open', dayOnly('火曜日は営業しておりません'), []);
eq('R5 not closed', dayOnly('水曜日は休みではありません'), []);
eq('R5 not nenjyu', dayOnly('年中無休ではありません'), []);
// 重大6 部分一致
['前髪カット 1,100円', '学生カット 3,300円', '初回カット 3,960円', 'カットとシャンプーで5,500円', 'カラーリタッチ 5,500円']
  .forEach((t, i) => eq('R6 partial ' + i, priceOnly(t).filter(x => x.startsWith('diff')), []));
eq('R6 ryokin', priceOnly('カット料金は4,950円'), ['same:4,950円']);
// 中7 並び
eq('R7 sorezore', priceOnly('カット・カラーはそれぞれ4,950円、7,700円です').filter(x => x.startsWith('diff')), []);
eq('R7 list', priceOnly('カット、カラー、パーマ：4,950円／7,700円／9,900円').filter(x => x.startsWith('diff')), []);
eq('R7 pre', priceOnly('4,950円のカットと7,700円のカラー').filter(x => x.startsWith('diff')), []);
// 中8 休みの曜日を含むまとまり・第n
eq('R8 weekday note', SF.check('平日は10時〜19時です', shop()).items[0].note, '登録では火曜は休みです（文の「平日」に含まれます）');
eq('R8 nth', dayOnly('定休日 火曜・第2月曜'), ['none:定休日 火曜']);
eq('R8 nth2', dayOnly('定休日は火曜日・第3水曜日'), ['none:定休日は火曜日']);
// 中9 夜・予約の締め切り
eq('R9 yoru', hoursOnly('営業は朝10時〜夜7時まで'), ['same:朝10時〜夜7時まで']);
eq('R9 yoyaku', timeOnly('ご予約は18時まで'), []);
eq('R9 eigyo made', timeOnly('平日は19時まで営業'), []);
eq('R9 eigyo made2', timeOnly('営業は19時まで'), ['same:19時']);
// 中10 FAX
eq('R10 fax', SF.check('TEL: 03-0000-0012 / FAX: 03-0000-0013', shop()).items.map(i => i.status), ['same', 'none']);
// 中11 税抜の明記
eq('R11 zeinuki', SF.check('カット 4,500円（税抜）', shop()).items.map(i => i.status), ['check']);
// 軽12 漢数字の丁目
eq('R12 kanji chome', contact('東京都架空区見本町一丁目2番3号'), ['same:address']);
eq('R12 addrKey 21', SF.addrKey('東京都架空区見本町二十一丁目5'), '東京都架空区見本町21-5');

// 移す文字（iPhoneで途中までしかコピーされなかった件の再現。2026-10-25）
const full = SF.exportText(shop());
eq('X1 cut in the middle', /途中で切れて/.test(SF.importText(full.slice(0, 300)).error || ''), true);
const legacy = JSON.stringify({ app: 'shop-facts-check', v: 1, shop: shop() });
eq('X2 legacy json with curly quotes', SF.summarize(SF.importText(legacy.replace(/"/g, '”')).shop || SF.blankShop()), SF.summarize(shop()));
eq('X3 summary', SF.summarize(shop()), '営業時間・休み 8日分／メニュー 3行／住所 あり／電話 1つ／メール あり／URL 0つ／やっていないこと 1行');
const withEmpty = shop(); withEmpty.menu.push({ name: '', alias: '', price: '' }); withEmpty.nots.push({ word: '', note: '' });
eq('X4 drop empty rows', SF.exportText(withEmpty).length, full.length);
eq('X5 roundtrip summary', SF.summarize(SF.importText(full).shop), SF.summarize(shop()));
eq('X6 token shape', /^SFC1\.[A-Za-z0-9_-]+\.[0-9a-z]+$/.test(full), true);
eq('X7 spaces and newlines inserted', SF.summarize(SF.importText('LINEで送ります\n' + full.slice(0, 40) + ' \n ' + full.slice(40, 120) + ' ' + full.slice(120) + '\nよろしく').shop || SF.blankShop()), SF.summarize(shop()));
const flip = full.slice(0, 50) + (full[50] === 'A' ? 'B' : 'A') + full.slice(51);
eq('X8 altered char detected', /書き換わって/.test(SF.importText(flip).error || ''), true);
eq('X9 translated legacy keys lose fields (why the token exists)', SF.importText(legacy.replace('"address"', '"住所"')).shop.address, '');
eq('X10 fullwidth period', SF.summarize(SF.importText(full.replace(/\./g, '。')).shop || SF.blankShop()), SF.summarize(shop()));

// 時刻・金額の入力の読み方
eq('parseTime', ['10', '1000', '10:30', '１０：３０', '9時', '25:00', '30:00', 'abc', ''].map(SF.parseTime),
  [600, 600, 630, 630, 540, 1500, null, null, null]);
eq('parsePrice', ['4,950', '４９５０円', '¥4950', 'abc'].map(SF.parsePrice), [4950, 4950, 4950, null]);

// 往復: 印の区切りで元の文字が欠けない
const segs = SF.segment(SF.SAMPLE_TEXT, r1.items).map(x => x.t).join('');
eq('segment join', segs, SF.SAMPLE_TEXT);
const emo = '😀𠮷野家 カット4,950円\t😀\r\n火曜定休';
eq('segment emoji', SF.segment(emo, SF.check(emo, shop()).items).map(x => x.t).join(''), emo);

// S12 10,000字の処理時間（純ロジック）
const big = (SF.SAMPLE_TEXT + '\n').repeat(80).slice(0, 10000);
const t0 = Date.now(); const rb = SF.check(big, shop()); const ms = Date.now() - t0;
console.log('S12 10000chars', ms + 'ms', 'items=' + rb.items.length);
eq('S12 under 1s', ms < 1000, true);

console.log('pass', pass, 'fail', fail);
process.exit(fail ? 1 : 0);
