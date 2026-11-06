// 하치네 집밥 - 멀티 서버 (Node + ws)
// 구조: 식당(hall) 1개 = 넓은 공간 + 상 6개(좌석 6×6). 걸어 다니고, 자리에 앉아 밥을 먹고, 근처 사람에게 한마디를 건넵니다.
// 실행: node server.js   (PORT, HALL_CAP 환경변수로 조정)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { isBad } = require('./filter');
const L = require('./public/layout.js');

const PORT = +process.env.PORT || 3000;
const HALL_CAP = +process.env.HALL_CAP || 36;      // 식당 한 곳의 최대 인원
const TEXT_MAX = 15;                               // 직접 입력 글자 수 제한
const COOL_PRESET = 1800, COOL_TEXT = 8000, TEXT_PER_MEAL = 8, REPORTS_TO_MUTE = 3;
const PUBLIC = path.join(__dirname, 'public');
const REPORT_LOG = path.join(__dirname, 'reports.log');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.json': 'application/json', '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') { res.end('ok'); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Cache-Control': 'no-cache', 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ---------- 정해진 말 (클라이언트는 id만 보냅니다) ----------
const PRESET = {
  0: '맛있게 드세요', 1: '좋은 아침이에요', 2: '식사는 하고 오셨어요?', 3: '오늘 하루 수고했어요',
  5: '봄바람이 좋네요', 6: '오늘 많이 춥네요', 7: '오늘 정말 덥네요', 8: '날씨가 선선하네요', 9: '날씨가 쌀쌀하네요',
  10: '잘 먹었습니다'
};
const REPLY = {
  20: '고맙습니다', 21: '저도요!', 22: '네, 그래요', 23: '안녕히 가세요', 24: '맛있게 드세요',
  25: '네, 먹고 왔어요', 26: '아직이에요, 같이 먹어요'
};

// ---------- 식당 / 플레이어 ----------
const ADJ = ['뜨끈한', '포슬한', '말랑한', '고소한', '느긋한', '따끈한', '보송한', '몽글한', '촉촉한', '든든한', '졸린', '배부른', '노릇한', '구수한'];
const NOUN = ['숟가락', '누룽지', '김', '밥알', '뚝배기', '젓가락', '된장', '참기름', '깨소금', '밥그릇', '달걀', '숭늉', '주걱', '반찬'];
const randName = () => ADJ[Math.random() * ADJ.length | 0] + ' ' + NOUN[Math.random() * NOUN.length | 0];

let hallSeq = 0, nextPid = 1;
const halls = new Map();   // id -> { id, label, players: Map, seats: [table][seat] = 플레이어 id }

function makeHall() {
  const id = ++hallSeq;
  const h = { id, label: id + '관', players: new Map(), seats: L.tables.map(() => new Array(L.SEATS).fill(0)) };
  halls.set(id, h);
  return h;
}
function pickHall() {   // 자리가 남은 식당 중 가장 사람이 많은 곳
  let best = null;
  for (const h of halls.values()) if (h.players.size < HALL_CAP && (!best || h.players.size > best.players.size)) best = h;
  return best || makeHall();
}
const totalOnline = () => { let n = 0; for (const h of halls.values()) n += h.players.size; return n; };
const pub = p => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, table: p.table, seat: p.seat, phase: p.phase, dish: p.dish, food: p.food });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function toHall(h, obj, exceptId = 0) {
  const s = JSON.stringify(obj);
  for (const q of h.players.values()) if (q.id !== exceptId && q.ws.readyState === 1) q.ws.send(s);
}
function broadcastStats() {
  const s = JSON.stringify({ t: 'stats', total: totalOnline() });
  for (const h of halls.values()) for (const q of h.players.values()) if (q.ws.readyState === 1) q.ws.send(s);
}
function standUp(p) {     // 앉아 있으면 일으켜 세우고 서 있을 자리를 돌려준다
  if (p.table < 0) return null;
  p.hall.seats[p.table][p.seat] = 0;
  const o = L.standPos(p.table, p.seat);
  p.table = p.seat = -1; p.x = o.x; p.y = o.y; p.phase = 'idle'; p.food = 1; p.dish = 'none'; p.shared.clear();
  return o;
}

const PHASES = new Set(['idle', 'cooking', 'ready', 'choosing', 'eating', 'done']);
const DISHES = new Set(['egg', 'gim', 'miyeok', 'kimchi', 'eggroll', 'doenjang', 'jjigae', 'fish', 'namul', 'nurungji', 'none']);

function sanitizeText(v) {
  return String(v == null ? '' : v).normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
}

const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let me = null;
  const rate = { bite: [0, 0], move: [0, 0], report: [0, 0], share: [0, 0] };
  const limited = (key, max, ms) => {
    const now = Date.now(), r = rate[key];
    if (now - r[0] > ms) { r[0] = now; r[1] = 0; }
    return ++r[1] > max;
  };
  const deny = why => send(ws, { t: 'sayno', why });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello' && !me) {
      const hall = pickHall();
      me = {
        id: nextPid++, ws, hall, name: randName(), look: Math.random() * 360 | 0,
        x: L.SPAWN.x + Math.round(Math.random() * 200 - 100), y: L.SPAWN.y + Math.round(Math.random() * 80 - 40),
        table: -1, seat: -1, phase: 'idle', dish: 'none', food: 1,
        lastP: 0, lastT: 0, texts: 0, muted: false, reporters: new Set(), lastText: '', shared: new Set()
      };
      hall.players.set(me.id, me);
      send(ws, {
        t: 'welcome', me: pub(me), hall: { id: hall.id, label: hall.label, textMax: TEXT_MAX },
        players: [...hall.players.values()].filter(p => p.id !== me.id).map(pub), total: totalOnline()
      });
      toHall(hall, { t: 'join', p: pub(me) }, me.id);
      broadcastStats();
      return;
    }
    if (!me) return;
    const hall = me.hall;

    if (m.t === 'move') {
      if (me.table >= 0 || limited('move', 12, 1000) || !Number.isFinite(+m.x) || !Number.isFinite(+m.y)) return;
      const p = L.clampPt(+m.x, +m.y); me.x = p.x; me.y = p.y;
      toHall(hall, { t: 'move', id: me.id, x: p.x, y: p.y }, me.id);
    } else if (m.t === 'sit') {
      const t = m.table | 0, s = m.seat | 0;
      if (me.table >= 0 || t < 0 || t >= L.tables.length || s < 0 || s >= L.SEATS) return;
      if (hall.seats[t][s]) return send(ws, { t: 'sitno' });
      hall.seats[t][s] = me.id; me.table = t; me.seat = s;
      const sp = L.seatPos(t, s); me.x = sp.x; me.y = sp.y;
      toHall(hall, { t: 'sit', id: me.id, table: t, seat: s });
    } else if (m.t === 'stand') {
      const o = standUp(me);
      if (o) toHall(hall, { t: 'stand', id: me.id, x: o.x, y: o.y });
    } else if (m.t === 'state') {
      if (PHASES.has(m.phase)) me.phase = m.phase;
      if (DISHES.has(m.dish)) me.dish = m.dish;
      if (typeof m.food === 'number') me.food = Math.max(0, Math.min(1, m.food));
      if (m.phase === 'cooking') { me.texts = 0; me.shared.clear(); }   // 새 끼니가 시작되면 직접 입력 횟수·나눠주기 기록 초기화
      toHall(hall, { t: 'state', id: me.id, phase: me.phase, dish: me.dish, food: me.food }, me.id);
    } else if (m.t === 'share') {   // 같은 상에서 바로 옆자리 친구에게 내 반찬 나눠주기 (끼니마다 친구 한 명당 한 번)
      const to = hall.players.get(+m.to);
      if (!to || to === me || me.table < 0 || to.table !== me.table) return;
      const d = (to.seat - me.seat + L.SEATS) % L.SEATS;
      if ((d !== 1 && d !== L.SEATS - 1) || me.phase !== 'eating' || to.phase !== 'eating' || me.dish === 'none' || me.shared.has(to.id) || limited('share', 1, 1500)) return;
      me.shared.add(to.id);
      toHall(hall, { t: 'share', from: me.id, to: to.id, dish: me.dish });
    } else if (m.t === 'bite') {
      if (limited('bite', 8, 1000)) return;
      me.food = Math.max(0, Math.min(1, +m.food || 0));
      toHall(hall, { t: 'bite', id: me.id, food: me.food }, me.id);
    } else if (m.t === 'say') {
      const now = Date.now();
      let text = '', kind = m.k, sid = null;
      if (kind === 'p' || kind === 'r') {
        text = (kind === 'p' ? PRESET : REPLY)[m.id];
        if (!text) return;
        if (now - me.lastP < COOL_PRESET) return deny('cool');
        me.lastP = now; sid = m.id;
      } else if (kind === 't') {
        if (me.muted) return deny('muted');
        if (now - me.lastT < COOL_TEXT) return deny('cool');
        if (me.texts >= TEXT_PER_MEAL) return deny('limit');
        text = sanitizeText(m.text);
        if (!text) return deny('empty');
        if (Array.from(text).length > TEXT_MAX) return deny('long');
        if (isBad(text)) return deny('filter');
        me.lastT = now; me.texts++;
      } else return;
      me.lastText = text;
      send(ws, { t: 'sayok', k: kind, sid, text });
      const s = JSON.stringify({ t: 'say', id: me.id, k: kind, sid, text });
      for (const q of hall.players.values()) if (q.id !== me.id && dist(q, me) <= L.HEAR && q.ws.readyState === 1) q.ws.send(s);   // 근처 사람에게만
    } else if (m.t === 'report') {
      if (limited('report', 3, 10000)) return;
      const target = hall.players.get(m.target);
      if (!target || target.id === me.id) return;
      target.reporters.add(me.id);
      fs.appendFile(REPORT_LOG, JSON.stringify({ ts: new Date().toISOString(), target: target.name, text: target.lastText, by: target.reporters.size }) + '\n', () => {});
      if (target.reporters.size >= REPORTS_TO_MUTE) target.muted = true;   // 직접 입력만 차단
    }
  });

  ws.on('close', () => {
    if (!me) return;
    standUp(me);
    me.hall.players.delete(me.id);
    toHall(me.hall, { t: 'leave', id: me.id });
    if (me.hall.players.size === 0 && me.hall.id !== 1) halls.delete(me.hall.id);
    broadcastStats();
  });
  ws.on('error', () => {});
});

setInterval(() => {   // 죽은 연결 정리
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; try { ws.ping(); } catch {}
  }
}, 30000);

server.listen(PORT, () => console.log(`하치네 집밥 → http://localhost:${PORT}  (식당 정원 ${HALL_CAP}명, 상 ${L.tables.length}개)`));
module.exports = { server, wss };
