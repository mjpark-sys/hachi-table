// 서버 통합 테스트: node test_server.js
process.env.PORT = 3111; process.env.HALL_CAP = 5;
const { server } = require('./server.js');
const { isBad } = require('./filter.js');
const L = require('./public/layout.js');
const WebSocket = require('ws');
const assert = require('assert');
const wait = ms => new Promise(r => setTimeout(r, ms));
const open = () => new Promise(res => {
  const ws = new WebSocket('ws://localhost:3111'); const q = [];
  ws.on('message', d => q.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello' })); res({ ws, q }); });
});
const w = x => x.q.find(m => m.t === 'welcome');
const got = (x, t) => x.q.filter(m => m.t === t);
const send = (x, o) => x.ws.send(JSON.stringify(o));

(async () => {
  await wait(200);

  // 1) 입장: 입구 근처에서 시작, 식당이 차면 새 식당
  const P = []; for (let i = 0; i < 6; i++) { P.push(await open()); await wait(40); }
  await wait(300);
  const [a, b, c, d, e, f] = P;
  assert([a, b, c, d, e].every(x => w(x).hall.id === 1) && w(f).hall.id === 2, '정원(5) 초과 시 새 식당');
  assert(Math.abs(w(a).me.x - L.SPAWN.x) <= 100 && Math.abs(w(a).me.y - L.SPAWN.y) <= 40, '입구에서 시작');
  assert.equal(w(e).players.length, 4, '같은 식당 사람들 목록을 받음');
  console.log('입장/식당 배정 OK');

  // 2) 이동 중계 + 범위 제한
  send(a, { t: 'move', x: 1000, y: 900 }); send(a, { t: 'move', x: 99999, y: -50 });
  await wait(200);
  assert.deepEqual(got(b, 'move').map(m => [m.x, m.y]), [[1000, 900], [L.BOUNDS.x1, L.BOUNDS.y0]], '이동 전달 + 범위 보정');
  assert.equal(got(a, 'move').length, 0, '자기에게는 안 옴'); assert.equal(got(f, 'move').length, 0, '다른 식당에는 안 감');
  send(a, { t: 'move', x: 'abc', y: 1 }); await wait(80);
  assert.equal(got(b, 'move').length, 2, '잘못된 좌표 무시');
  console.log('이동 OK');

  // 3) 앉기: 같은 자리는 한 명만, 일어나면 비워짐
  send(a, { t: 'sit', table: 0, seat: 0 }); await wait(100);
  send(b, { t: 'sit', table: 0, seat: 0 }); await wait(100);
  assert.equal(got(b, 'sitno').length, 1, '이미 찬 자리');
  send(b, { t: 'sit', table: 0, seat: 1 }); send(c, { t: 'sit', table: 99, seat: 0 }); await wait(100);
  assert.equal(got(e, 'sit').length, 2, '앉기는 식당 전체에 전달'); assert.equal(got(c, 'sit').filter(m => m.table === 99).length, 0, '없는 상은 무시');
  send(a, { t: 'move', x: 100, y: 400 }); await wait(80);
  assert.equal(got(b, 'move').length, 2, '앉아 있으면 이동 무시');
  send(a, { t: 'stand' }); await wait(100);
  const st = got(b, 'stand')[0]; assert(st && st.id === w(a).me.id, '일어남 전달');
  send(c, { t: 'sit', table: 0, seat: 0 }); await wait(100);
  assert(got(c, 'sit').some(m => m.id === w(c).me.id), '비워진 자리에 앉을 수 있음');
  console.log('앉기/일어나기 OK');

  // 4) 말은 근처 사람에게만 (d 를 멀리 보냄)
  send(d, { t: 'move', x: 150, y: 320 }); send(a, { t: 'move', x: 1250, y: 1420 }); await wait(100);
  send(e, { t: 'say', k: 'p', id: 0 }); await wait(150);
  assert.equal(got(e, 'sayok')[0].text, '맛있게 드세요');
  assert.equal(got(a, 'say').length, 1, '가까운 사람은 들음'); assert.equal(got(b, 'say').length, 0, '앉아 있는 먼 사람은 못 들음');
  assert.equal(got(d, 'say').length, 0, '멀리 있는 사람은 못 들음');
  send(e, { t: 'say', k: 'p', id: 10 }); await wait(100);
  assert.equal(got(e, 'sayno').filter(m => m.why === 'cool').length, 1, '프리셋 쿨다운');
  console.log('근접 말 전달 OK');

  // 5) 직접 입력 제한/필터
  const t = (x, text) => send(x, { t: 'say', k: 't', text });
  t(a, '맛있게 먹을게요'); await wait(150);
  assert.equal(got(a, 'sayok').pop().text, '맛있게 먹을게요');
  t(a, '또 말해요'); await wait(100); assert.equal(got(a, 'sayno').pop().why, 'cool', '직접 입력 쿨다운');
  t(b, '열여섯글자를넘기면안되는한마디입니다'); await wait(80); assert.equal(got(b, 'sayno').pop().why, 'long');
  t(c, '씨 발'); await wait(80); assert.equal(got(c, 'sayno').pop().why, 'filter');
  t(e, 'www.a.com'); await wait(80); assert.equal(got(e, 'sayno').pop().why, 'filter');
  assert(isBad('씨씨씨발') && isBad('시.발') && isBad('SHIT') && isBad('카톡 주세요') && !isBad('오늘 날씨 좋네요') && !isBad('맛있게 드세요'), '필터 단위 검사');
  console.log('직접 입력 제한/필터 OK');

  // 6) 신고 3건이면 직접 입력 차단
  [b, c, e].forEach(x => send(x, { t: 'report', target: w(d).me.id })); await wait(200);
  t(d, '안녕하세요'); await wait(100);
  assert.equal(got(d, 'sayno').pop().why, 'muted', '신고 누적 차단');
  console.log('신고 차단 OK');

  // 7) 상태/한 입 전달, 퇴장 시 자리 비움
  send(c, { t: 'state', phase: 'eating', dish: 'egg', food: 1 }); send(c, { t: 'bite', food: 0.9 }); await wait(150);
  assert.equal(got(b, 'bite').length, 1); assert.equal(got(f, 'bite').length, 0, '다른 식당에는 안 감');
  c.ws.close(); await wait(250);
  assert.equal(got(b, 'leave').length, 1, '떠남 전달');
  send(e, { t: 'sit', table: 0, seat: 0 }); await wait(100);
  assert(got(e, 'sit').some(m => m.id === w(e).me.id), '나간 사람의 자리가 비워짐');
  console.log('상태/퇴장 OK');

  // 8) 반찬 나눠주기: 같은 상 옆자리 + 둘 다 식사 중일 때만, 친구 한 명당 한 번
  await open(); const nb = await open(), far = await open(); await wait(200);   // 첫 사람은 식당 1을 채우고, 나머지 둘이 식당 2(f와 같은 곳)로 간다
  assert(w(nb).hall.id === 2 && w(far).hall.id === 2, '테스트용 새 사람들은 식당 2');
  send(f, { t: 'sit', table: 1, seat: 0 }); send(nb, { t: 'sit', table: 1, seat: 1 }); send(far, { t: 'sit', table: 1, seat: 3 }); await wait(150);
  [f, nb, far].forEach(x => send(x, { t: 'state', phase: 'eating', dish: 'egg', food: 1 })); await wait(120);
  send(f, { t: 'share', to: w(far).me.id }); await wait(150);
  assert.equal(got(f, 'share').length, 0, '옆자리가 아니면 나눠줄 수 없음');
  send(f, { t: 'share', to: w(nb).me.id }); await wait(150);
  const sh = got(nb, 'share')[0];
  assert(sh && sh.from === w(f).me.id && sh.to === w(nb).me.id && sh.dish === 'egg', '옆자리 친구에게 전달');
  assert.equal(got(far, 'share').length, 1, '같은 식당 사람들도 받음');
  await wait(1600); send(f, { t: 'share', to: w(nb).me.id }); await wait(150);
  assert.equal(got(nb, 'share').length, 1, '같은 친구에게는 한 끼에 한 번만');
  send(nb, { t: 'state', phase: 'done', dish: 'egg', food: 0 }); send(f, { t: 'stand' }); send(f, { t: 'sit', table: 1, seat: 0 }); await wait(150);
  send(f, { t: 'state', phase: 'eating', dish: 'egg', food: 1 }); await wait(1600);
  send(f, { t: 'share', to: w(nb).me.id }); await wait(150);
  assert.equal(got(nb, 'share').length, 1, '받는 사람이 식사 중이 아니면 안 됨');
  console.log('반찬 나눠주기 OK');

  const code = await fetch('http://localhost:3111/').then(r => r.status);
  const lay = await fetch('http://localhost:3111/layout.js').then(r => r.status);
  const esc = await fetch('http://localhost:3111/../server.js').then(r => r.status);
  assert.equal(code, 200); assert.equal(lay, 200); assert.notEqual(esc, 200);
  console.log('정적 서버 OK\n전체 통과');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
