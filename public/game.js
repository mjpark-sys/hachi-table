/* 하치네 집밥 - 클라이언트
 * 장면: three.js 3D (그리기는 scene3d.js, 이 파일은 게임 로직·소리·UI)
 * 조작: 바닥 클릭=걷기 · 빈 의자 클릭=앉기 · 하단 중앙 바(자리에 앉기 / 밥먹기 / 대화하기)
 * 소리: WebAudio 합성음 (assets/sounds/<이름>.mp3 를 넣으면 실제 음원으로 대체)
 *   교체 가능한 이름: puff(칙), bubble(보글), steam(긴 증기), chime(완료음), lid(뚜껑), spoon(숟가락), chew(씹기), ambient(배경 루프)
 * 좌표(식당 크기, 상·의자 위치)는 layout.js 한 곳에서 정합니다. 서버와 같은 파일을 씁니다.
 */
import { createScene } from './scene3d.js';

(() => {
'use strict';
const L = window.LAYOUT;
const SPEED = 250;                                     // 걷는 속도(px/초)
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif';
const $ = id => document.getElementById(id);
const cv = $('c');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------------- 메뉴 / 문구 ---------------- */
const DISH = {
  egg: ['계란프라이', '🍳'], gim: ['김', '🟫'], miyeok: ['미역국', '🥣'],
  kimchi: ['김치', '🥬'], eggroll: ['계란말이', '🍥'], doenjang: ['된장국', '🍲'],
  jjigae: ['김치찌개', '🍲'], fish: ['생선구이', '🐟'], namul: ['나물', '🌿'],
  nurungji: ['누룽지', '🍘'], none: ['', '']
};
const MENU = {
  morning: { label: '아침', sides: ['egg', 'gim', 'miyeok'] },
  lunch:   { label: '점심', sides: ['kimchi', 'eggroll', 'doenjang'] },
  dinner:  { label: '저녁', sides: ['jjigae', 'fish', 'namul'] },
  night:   { label: '야식', sides: ['nurungji', 'gim', 'egg'] }
};
function period() {
  const h = new Date().getHours();
  return h >= 5 && h < 10 ? 'morning' : h < 15 && h >= 10 ? 'lunch' : h >= 15 && h < 21 ? 'dinner' : 'night';
}
const PERIOD = period();
const SAY = {
  cooking:  ['밥 짓는 중이에요. 조금만요.', '칙칙, 거의 다 됐어요.', '쌀이 보글보글 익고 있어요.'],
  ready:    ['다 됐어요! 뚜껑을 열어 볼까요?'],
  choosing: ['반찬은 뭘로 드릴까요?'],
  eating:   ['천천히 드세요.', '따뜻할 때 한 숟갈.', '호호 불어서요.'],
  done:     ['오늘도 잘 먹었네요.']
};
const ENDING = [
  '따뜻한 밥 한 끼면, 오늘은 충분해요.',
  '천천히 먹어도 괜찮아요.',
  '오늘도 여기까지 오느라 고생했어요.',
  '배가 부르면 마음도 조금 풀려요.',
  '밥 냄새가 나는 곳엔 늘 누군가 기다려요.'
];

/* ---------------- 말 걸기 문구 (서버 문구와 id가 같아야 합니다) ---------------- */
const MONTH = new Date().getMonth() + 1;
const WEATHER_ID = MONTH >= 12 || MONTH <= 2 ? 6 : MONTH <= 5 ? 5 : MONTH <= 8 ? 7 : MONTH <= 10 ? 8 : 9;
const ASK_ID = PERIOD === 'morning' ? 1 : PERIOD === 'dinner' ? 3 : 2;
const PRE = {
  0: '맛있게 드세요', 1: '좋은 아침이에요', 2: '식사는 하고 오셨어요?', 3: '오늘 하루 수고했어요',
  5: '봄바람이 좋네요', 6: '오늘 많이 춥네요', 7: '오늘 정말 덥네요', 8: '날씨가 선선하네요', 9: '날씨가 쌀쌀하네요', 10: '잘 먹었습니다'
};
const REP = { 20: '고맙습니다', 21: '저도요!', 22: '네, 그래요', 23: '안녕히 가세요', 24: '맛있게 드세요', 25: '네, 먹고 왔어요', 26: '아직이에요, 같이 먹어요' };
function presetOrder() {            // 지금 상황에 어울리는 말이 맨 앞에 온다
  const offer = 0, ask = ASK_ID, wx = WEATHER_ID, bye = 10;
  if (me.phase === 'done') return [bye, wx, ask, offer];
  if (me.phase === 'eating') return me.food > 0.5 ? [ask, wx, offer, bye] : [wx, bye, ask, offer];
  if (me.table >= 0) return [offer, ask, wx, bye];
  return [ask, wx, offer, bye];     // 서 있을 때는 인사·안부부터
}
function replyOptions(k, sid) {
  if (k === 'p') {
    if (sid === 0) return [20, 24];
    if (sid === 10) return [23, 20];
    if (sid === 2) return [25, 26];
    if (sid === 1 || sid === 3) return [21, 20];
    return [22, 21];
  }
  return [22, 20];
}
const SAYNO = {
  filter: '그 말은 보낼 수 없어요', cool: '잠시 뒤에 다시 말해 주세요', long: '15자까지 쓸 수 있어요',
  muted: '지금은 직접 쓰기를 쓸 수 없어요', limit: '이번 식사에서는 직접 쓰기를 다 썼어요', empty: ''
};

/* ---------------- 상태 ---------------- */
const me = {      // 나. 다른 사람(S.players)과 같은 모양
  id: 0, name: '나', look: 30, x: L.SPAWN.x, y: L.SPAWN.y, tx: L.SPAWN.x, ty: L.SPAWN.y, table: -1, seat: -1,
  phase: 'idle', dish: 'none', food: 1, bumpT: 0, b: null, lidOpen: false, pendingSit: null, sitSent: false
};
const S = {
  started: false, players: new Map(), hall: { label: '', textMax: 15 }, total: 0, online: false,
  say: '', t: 0, mouseW: { x: 0, y: 0 }, hoverSeat: null, cookEnd: 0, doneTimer: 0, lastBite: 0,
  muted: new Set(), reply: null, lastP: 0, lastT: 0, menuFor: 0, afterSit: '', soft: 0, potOpenUntil: 0, sig: '', shared: new Set()
};
const COOK_MS = 8000;
const everyone = () => [me, ...S.players.values()];
const occupied = (t, s) => everyone().some(p => p.table === t && p.seat === s);

/* ---------------- 오디오 ---------------- */
const A = { ctx: null, master: null, out: null, far: null, ambLP: null, wind: null, white: null, samples: {}, muted: false, ambNode: null, cookTimer: 0 };
const SAMPLE_NAMES = ['puff', 'bubble', 'steam', 'chime', 'lid', 'spoon', 'chew', 'ambient'];

function initAudio() {
  if (A.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  A.ctx = new AC();
  A.master = A.ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(A.ctx.destination); A.out = A.master;
  A.far = A.ctx.createGain(); A.far.gain.value = 0.35;       // 멀리서 나는 소리: 먹먹하게 + 메아리
  { const lp = A.ctx.createBiquadFilter(), d = A.ctx.createDelay(), fb = A.ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1600; d.delayTime.value = 0.28; fb.gain.value = 0.35;
    A.far.connect(lp); lp.connect(A.master); lp.connect(d); d.connect(fb); fb.connect(d); d.connect(A.master); }
  const len = A.ctx.sampleRate * 2, buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  A.white = buf;
  SAMPLE_NAMES.forEach(n => {          // 실제 음원이 있으면 불러와서 합성음을 대체
    fetch('assets/sounds/' + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => A.ctx.decodeAudioData(b)).then(buf2 => { A.samples[n] = buf2; if (n === 'ambient') startAmbient(); }).catch(() => {});
  });
}
function sample(n, vol = 1, rate = 1) {
  const b = A.samples[n]; if (!b) return false;
  const s = A.ctx.createBufferSource(), g = A.ctx.createGain();
  s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(A.out); s.start(); return true;
}
function noise(dur, { f = 3000, q = 0.7, type = 'bandpass', gain = 0.2, att = 0.015, at = 0, f2 = 0 } = {}) {
  const c = A.ctx, t = c.currentTime + at;
  const s = c.createBufferSource(); s.buffer = A.white; s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(A.out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.15, at = 0, f2 = 0 } = {}) {
  const c = A.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(A.out); o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
  puff(v = 1) { if (!A.ctx || sample('puff', v)) return; noise(0.3, { f: 5200, q: 0.6, gain: 0.2 * v }); noise(0.3, { f: 5600, q: 0.6, gain: 0.17 * v, at: 0.2 }); },
  bubble(v = 1) { if (!A.ctx || sample('bubble', v)) return; for (let i = 0; i < 4; i++) tone(rnd(280, 700), 0.05, { gain: 0.035 * v, at: rnd(0, 0.35), f2: rnd(500, 900) }); },
  steam(v = 1) { if (!A.ctx || sample('steam', v)) return; noise(2.2, { f: 3500, q: 0.5, gain: 0.26 * v, att: 0.25, f2: 6500 }); },
  chime(v = 1) { if (!A.ctx || sample('chime', v)) return; [784, 988, 1319].forEach((f, i) => { tone(f, 0.7, { gain: 0.11 * v, at: i * 0.17 }); tone(f * 2, 0.4, { gain: 0.025 * v, at: i * 0.17, type: 'triangle' }); }); },
  lid(v = 1) { if (!A.ctx || sample('lid', v)) return; tone(140, 0.18, { gain: 0.22 * v, f2: 55 }); noise(1.6, { f: 4000, q: 0.5, gain: 0.22 * v, att: 0.12, at: 0.05, f2: 7000 }); },
  spoon(v = 1) { if (!A.ctx || sample('spoon', v, rnd(0.95, 1.08))) return; tone(rnd(2300, 2800), 0.07, { type: 'triangle', gain: 0.07 * v }); tone(190, 0.07, { gain: 0.1 * v, f2: 120 }); },
  chew(v = 1) { if (!A.ctx || sample('chew', v)) return; for (let i = 0; i < 3; i++) noise(0.07, { f: 900 + rnd(-150, 150), q: 0.9, type: 'lowpass', gain: 0.09 * v, at: 0.18 + i * 0.14 }); },
  pop(v = 1) { if (A.ctx) tone(560, 0.09, { gain: 0.05 * v, f2: 760 }); },
  tap(v = 1) { if (A.ctx) tone(420, 0.06, { gain: 0.07 * v, f2: 300, type: 'triangle' }); }
};
function softBite() {          // 근처 사람이 먹는 소리: 아주 작게, 겹치지 않게
  if (!A.ctx || S.soft > 3) return;
  S.soft++; setTimeout(() => S.soft--, 700);
  SFX.spoon(0.28); setTimeout(() => SFX.chew(0.22), 120);
}
function startAmbient() {
  if (!A.ctx || A.ambNode) return;
  if (A.samples.ambient) {
    const s = A.ctx.createBufferSource(), g = A.ctx.createGain(); s.buffer = A.samples.ambient; s.loop = true; g.gain.value = 0.5;
    s.connect(g); g.connect(A.master); s.start(); A.ambNode = s; return;
  }
  const c = A.ctx, loop = off => { const n = c.createBufferSource(); n.buffer = A.white; n.loop = true; n.start(0, off); return n; };
  A.ambLP = c.createBiquadFilter(); A.ambLP.type = 'lowpass'; A.ambLP.frequency.value = 9000; A.ambLP.connect(A.master);   // 안개가 짙으면 소리도 먹먹해진다
  const rumble = loop(0), rl = c.createBiquadFilter(), rg = c.createGain(); rl.type = 'lowpass'; rl.frequency.value = 260; rg.gain.value = 0.03;   // 바닥 울림
  rumble.connect(rl); rl.connect(rg); rg.connect(A.ambLP);
  const wind = loop(0.7), wbp = c.createBiquadFilter(), wg = c.createGain(); wbp.type = 'bandpass'; wbp.frequency.value = 700; wbp.Q.value = 0.5; wg.gain.value = 0.02;   // 바람
  wind.connect(wbp); wbp.connect(wg); wg.connect(A.ambLP);
  const grass = loop(1.3), hp = c.createBiquadFilter(), gg = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();   // 풀 스치는 소리: 고음 노이즈에 5Hz 떨림
  hp.type = 'highpass'; hp.frequency.value = 3200; gg.gain.value = 0; lfo.frequency.value = 5.5; lg.gain.value = 0;
  grass.connect(hp); hp.connect(gg); gg.connect(A.ambLP); lfo.connect(lg); lg.connect(gg.gain); lfo.start();
  A.wind = { wbp, wg, gg, lg }; A.ambNode = rumble;
  const later = (fn, a, b) => setTimeout(() => { if (S.started) fn(); later(fn, a, b); }, rnd(a, b));
  later(() => gust(rnd(0.6, 1)), 5000, 12000); later(farCooker, 25000, 55000); later(startFog, 40000, 80000);
  setTimeout(farCooker, 9000); setTimeout(startFog, 20000);
}
function gust(power = 1) {       // 바람이 불어와 풀이 서걱이다 잦아든다
  if (!A.wind) return;
  const t = A.ctx.currentTime, { wbp, wg, gg, lg } = A.wind;
  wg.gain.cancelScheduledValues(t); wg.gain.setTargetAtTime(0.02 + 0.06 * power, t, 1.2); wg.gain.setTargetAtTime(0.02, t + 3.2, 1.6);
  wbp.frequency.cancelScheduledValues(t); wbp.frequency.setTargetAtTime(1500, t, 1.5); wbp.frequency.setTargetAtTime(700, t + 3.2, 1.8);
  for (const p of [gg.gain, lg.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0.012 * power, t + 0.3, 1.0); p.setTargetAtTime(0, t + 3.4, 1.4); }   // 두 값이 같아서 0 ~ 2배로 떨린다
}
function farCooker() {           // 마을 어딘가에서 밥이 다 됐다: 멀고 작게 칙 - 딩동, 솥 언덕집에서 김이 오른다
  if (!A.ctx) return;
  A.out = A.far; try { SFX.puff(1); SFX.chime(1); } finally { A.out = A.master; }
  scene3d.puff(13, 3.9, -6, 14, 5);
}
function startFog() {            // 안개가 9초에 걸쳐 짙어지고, 잠시 머물다, 14초에 걸쳐 걷힌다
  if (S.fog) return;
  S.fog = { t0: S.t, up: 9000, hold: rnd(6000, 12000), down: 14000 }; gust(0.5);
}
function fogAt(t) {
  const f = S.fog; if (!f) return 0;
  const x = t - f.t0, sm = v => v * v * (3 - 2 * v);
  if (x < f.up) return sm(x / f.up);
  if (x < f.up + f.hold) return 1;
  if (x < f.up + f.hold + f.down) return 1 - sm((x - f.up - f.hold) / f.down);
  S.fog = null; return 0;
}
function startCookSound() {
  stopCookSound();
  let n = 0;
  const tick = () => {
    if (me.phase !== 'cooking') return;
    n++;
    SFX.bubble(0.5 + Math.min(1, n / 10) * 0.6);
    if (n % 3 === 0) SFX.puff(0.55 + Math.min(1, n / 10) * 0.6);
    A.cookTimer = setTimeout(tick, 420);
  };
  tick();
}
function stopCookSound() { clearTimeout(A.cookTimer); }

/* ---------------- 네트워크 ---------------- */
let ws = null;
function connect() {
  try {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  } catch { offline(); return; }
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello' }));
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { if (S.online) { S.online = false; toast('연결이 끊겼어요. 혼자서도 식사는 계속할 수 있어요.'); renderRoom(); } };
  ws.onerror = () => {};
  setTimeout(() => { if (!S.online && ws && ws.readyState !== 1) offline(); }, 4000);
}
function offline() { S.online = false; renderRoom(); }
const sendWs = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function sendState() { sendWs({ t: 'state', phase: me.phase, dish: me.dish, food: me.food }); renderSay(); }

function newPerson(p) { return Object.assign({ tx: p.x, ty: p.y, bumpT: 0, b: null }, p); }
function onMsg(m) {
  if (m.t === 'welcome') {
    S.online = true; Object.assign(me, m.me); me.tx = me.x; me.ty = me.y; S.hall = m.hall; S.total = m.total;
    S.players.clear(); m.players.forEach(p => S.players.set(p.id, newPerson(p))); scene3d.snap();
    sendState(); renderRoom();
  } else if (m.t === 'join') { S.players.set(m.p.id, newPerson(m.p)); renderRoom();
  } else if (m.t === 'leave') {
    S.players.delete(m.id); S.muted.delete(m.id);
    if (S.reply && S.reply.from === m.id) hideReply();
  } else if (m.t === 'move') { const p = S.players.get(m.id); if (p) { p.tx = m.x; p.ty = m.y; }
  } else if (m.t === 'sit') { applySit(m.id === me.id ? me : S.players.get(m.id), m.table, m.seat);
  } else if (m.t === 'sitno') {
    me.sitSent = false; me.pendingSit = null; toast('그 자리는 이미 찼어요');
    if (S.afterSit) goSit(nearestFreeSeat());
  } else if (m.t === 'stand') { applyStand(m.id === me.id ? me : S.players.get(m.id), m.x, m.y);
  } else if (m.t === 'state') {
    const p = S.players.get(m.id); if (p) { p.phase = m.phase; p.dish = m.dish; p.food = m.food; if (m.phase === 'cooking') p.share = null; }
  } else if (m.t === 'share') {
    const from = m.from === me.id ? me : S.players.get(m.from), to = m.to === me.id ? me : S.players.get(m.to), dn = DISH[m.dish] ? DISH[m.dish][0] : '반찬';
    if (!to || !from) return;
    to.share = m.dish; from.b = { text: `🥢 ${dn} 나눠줄게요`, start: S.t, until: S.t + 3500 }; SFX.pop(0.8);
    if (to === me) { toast(`${from.name}님이 ${dn}을(를) 나눠줬어요`); if (!S.muted.has(from.id)) showReply(from, 'p', 0); }
    else if (from === me) toast(`${to.name}님께 ${dn}을(를) 나눠줬어요`);
  } else if (m.t === 'bite') {
    const p = S.players.get(m.id); if (!p) return;
    p.food = m.food; p.bumpT = S.t;
    if (dist(p, me) < 420) softBite();
    const b = p.table >= 0 ? L.bowlPos(p.table, p.seat) : p; puffAt(b.x, b.y - 10, 2, 0.5);
  } else if (m.t === 'say') {
    const p = S.players.get(m.id); if (!p || S.muted.has(m.id)) return;
    p.b = { text: m.text, start: S.t, until: S.t + 4200 }; SFX.pop(0.7);
    if (m.k !== 'r') showReply(p, m.k, m.sid);
  } else if (m.t === 'sayok') {
    me.b = { text: m.text, start: S.t, until: S.t + 4200 }; SFX.tap(0.6);
  } else if (m.t === 'sayno') {
    if (SAYNO[m.why]) toast(SAYNO[m.why]);
  } else if (m.t === 'stats') { S.total = m.total; renderRoom(); }
}
function renderRoom() {
  $('room').innerHTML = S.online ? `<b>${S.hall.label}</b> · 지금 ${S.total}명이 식당에 있어요` : '혼자 먹는 중 (서버에 연결되지 않았어요)';
}
let toastTimer = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2600); }

/* ---------------- 이동 / 앉기 ---------------- */
function nearestFreeSeat() {
  let best = null, bd = 1e9;
  L.tables.forEach((_, t) => { for (let s = 0; s < L.SEATS; s++) {
    if (occupied(t, s)) continue;
    const d = dist(me, L.seatPos(t, s)); if (d < bd) { bd = d; best = { t, s }; }
  } });
  return best;
}
function setTarget(x, y, keepPending) {
  if (me.table >= 0) standMe();
  if (!keepPending) { me.pendingSit = null; S.afterSit = ''; }
  const p = L.clampPt(x, y); me.tx = p.x; me.ty = p.y; me.sitSent = false;
  sendWs({ t: 'move', x: p.x, y: p.y });
}
function goSit(seat) {
  if (!seat) { S.afterSit = ''; me.pendingSit = null; toast('빈 자리가 없어요'); return; }
  me.pendingSit = seat; const sp = L.seatPos(seat.t, seat.s); setTarget(sp.x, sp.y, true);
}
function applySit(p, t, s) {
  if (!p) return;
  if (p !== me && me.pendingSit && me.pendingSit.t === t && me.pendingSit.s === s) {   // 내가 가던 자리를 다른 사람이 먼저 앉음
    me.pendingSit = null; me.sitSent = false; toast('그 자리는 이미 찼어요'); if (S.afterSit) goSit(nearestFreeSeat());
  }
  p.table = t; p.seat = s; const sp = L.seatPos(t, s); p.x = p.tx = sp.x; p.y = p.ty = sp.y;
  if (p === me) {
    me.pendingSit = null; me.sitSent = false; updateActs();
    if (S.afterSit === 'eat') { S.afterSit = ''; setPhase('cooking'); }
  }
}
function applyStand(p, x, y) {
  if (!p) return;
  p.table = p.seat = -1; p.x = p.tx = x; p.y = p.ty = y; p.phase = 'idle'; p.food = 1; p.dish = 'none'; p.share = null;
  if (p === me) resetMeal();
}
function standMe() {
  const o = L.standPos(me.table, me.seat);
  if (S.online) sendWs({ t: 'stand' });
  applyStand(me, o.x, o.y);            // 서버 답을 기다리지 않고 먼저 일어남(같은 좌표)
}
function resetMeal() {
  stopCookSound(); clearTimeout(S.doneTimer); me.phase = 'idle'; me.food = 1; me.dish = 'none'; me.lidOpen = false; me.share = null; S.shared.clear();
  S.say = ''; $('hachiSay').classList.add('hidden'); renderMeal(); renderSay(); updateActs();
}

/* ---------------- 하단 중앙 동작 바 ---------------- */
function updateActs() {
  if (!S.started) return;
  const sitting = me.table >= 0;
  $('actSit').querySelector('i').textContent = sitting ? '🚶' : '🪑';
  $('actSit').querySelector('span').textContent = sitting ? '일어나기' : '자리에 앉기';
  $('actEat').disabled = me.phase !== 'idle';
}
$('actSit').addEventListener('click', () => { if (me.table >= 0) standMe(); else { S.afterSit = ''; goSit(nearestFreeSeat()); } });
$('actEat').addEventListener('click', () => {
  if (me.phase !== 'idle') return;
  if (me.table >= 0) setPhase('cooking'); else { S.afterSit = 'eat'; goSit(nearestFreeSeat()); }   // 서 있으면 가장 가까운 빈자리로 가서 앉은 뒤 시작
});
$('actTalk').addEventListener('click', () => {
  const pop = $('sayPop'), open = pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open); $('actTalk').classList.toggle('on', open);
  if (open) renderSay(); else closeWrite();
});

/* ---------------- 식사 단계 패널 ---------------- */
const sideChoices = () => MENU[PERIOD].sides;
const POT = { x: 1410, y: 200 };      // 밥솥 위치(px). scene3d.js 의 COOK 과 같은 곳
const nearPot = () => me.table < 0 && me.phase === 'idle' && dist(me, POT) < 280;
function shareTarget() {              // 바로 옆자리에서 같이 식사 중인 친구 (이번 끼니에 아직 안 나눠준 사람)
  if (me.table < 0 || me.phase !== 'eating' || me.dish === 'none') return null;
  return [...S.players.values()].find(p => p.table === me.table && p.phase === 'eating' && [1, L.SEATS - 1].includes((p.seat - me.seat + L.SEATS) % L.SEATS) && !S.shared.has(p.id)) || null;
}
function openPot() {                  // 밥솥 앞에서 뚜껑을 열어 보는 이벤트
  if (S.t < S.potOpenUntil) return;
  S.potOpenUntil = S.t + 3600; SFX.lid(); setTimeout(() => SFX.steam(0.5), 250); setTimeout(() => SFX.chime(0.6), 900); kPuff(0, 0, 36, 2);
  toast(pick(['갓 지은 밥이에요. 따뜻해요!', '밥 냄새 좋죠? 앉아서 같이 먹어요.', '쿠첸이 맛있게 지었어요.']));
}
function shareDish(id) {              // 옆자리 친구에게 내 반찬 나눠주기
  if (!shareTarget() || !S.players.has(id)) return;
  S.shared.add(id); sendWs({ t: 'share', to: id }); renderMeal();
}
function renderMeal() {
  const el = $('meal'); let h = '';
  if (me.phase === 'cooking') h = '🍚 밥 짓는 중…<span class="bar"><i id="mbar"></i></span>';
  else if (me.phase === 'ready') h = '<button class="btn big2" data-m="open">🍚 뚜껑 열기</button>';
  else if (me.phase === 'choosing') h = sideChoices().map(k => `<button class="btn" data-m="side" data-k="${k}">${DISH[k][1]} ${DISH[k][0]}</button>`).join('');
  else if (me.phase === 'eating') { h = '<button class="btn big2" data-m="bite">🥄 한 숟갈</button>'; const nb = shareTarget(); if (nb) h += `<button class="btn" data-m="share" data-id="${nb.id}">🥢 ${nb.name}님께 ${DISH[me.dish][0]} 나눠주기</button>`; }
  else if (nearPot()) h = '<button class="btn big2" data-m="pot">🍚 밥솥 열기</button>';
  el.innerHTML = h; el.classList.toggle('hidden', !h);
}
$('meal').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.m === 'open') setPhase('choosing'); else if (b.dataset.m === 'side') chooseSide(b.dataset.k); else if (b.dataset.m === 'bite') bite(); else if (b.dataset.m === 'pot') openPot(); else if (b.dataset.m === 'share') shareDish(+b.dataset.id);
});

/* ---------------- 말 걸기 UI ---------------- */
const textMax = () => S.hall.textMax || 15;
function renderSay() {
  if (!S.started) return;
  const ids = presetOrder();
  $('sayBtns').innerHTML = ids.map((id, i) => `<button class="btn${i === 0 ? ' lead' : ''}" data-k="p" data-id="${id}">${PRE[id]}</button>`).join('')
    + '<button class="btn write" data-write="1">✏️ 직접 쓰기</button>';
  if (S.t - S.lastP < 1800) $('sayBtns').querySelectorAll('[data-k]').forEach(b => b.classList.add('cool'));
}
function sendSay(k, id) {
  if (!S.online) { toast('혼자 먹는 중이라 말이 전해지지 않아요'); return; }
  if (S.t - S.lastP < 1800) return;
  S.lastP = S.t; sendWs({ t: 'say', k, id });
  $('sayBtns').querySelectorAll('[data-k]').forEach(b => b.classList.add('cool'));
  setTimeout(renderSay, 1850);
}
$('sayBtns').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.write) { openWrite(); return; }
  sendSay(b.dataset.k, +b.dataset.id);
});
function openWrite() {
  if (!S.online) { toast('혼자 먹는 중이라 말이 전해지지 않아요'); return; }
  $('sayBtns').classList.add('hidden'); $('sayForm').classList.remove('hidden');
  const inp = $('sayInput'); inp.value = ''; $('sayCount').textContent = '0/' + textMax(); inp.focus();
}
function closeWrite() { $('sayForm').classList.add('hidden'); $('sayBtns').classList.remove('hidden'); $('sayInput').blur(); }
$('sayInput').addEventListener('input', e => {
  const inp = e.target, chars = Array.from(inp.value);
  if (!e.isComposing && chars.length > textMax()) inp.value = chars.slice(0, textMax()).join('');
  $('sayCount').textContent = Math.min(Array.from(inp.value).length, 99) + '/' + textMax();
});
$('sayInput').addEventListener('keydown', e => { if (e.key === 'Escape') closeWrite(); });
$('sayCancel').addEventListener('click', closeWrite);
$('sayForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = Array.from($('sayInput').value.trim()).slice(0, textMax()).join('');
  if (!text) return;
  const wait = 8000 - (S.t - S.lastT);
  if (wait > 0) { toast(`잠시 뒤에 써 주세요 (${Math.ceil(wait / 1000)}초)`); return; }
  S.lastT = S.t; sendWs({ t: 'say', k: 't', text }); closeWrite();
});

function showReply(p, k, sid) {
  S.reply = { from: p.id, k, sid, until: S.t + 10000 };
  $('reply').innerHTML = `<span class="who">${p.name}님에게 답하기</span>` + replyOptions(k, sid).map(id => `<button class="btn" data-rid="${id}">${REP[id]}</button>`).join('');
  $('reply').classList.remove('hidden');
}
function hideReply() { S.reply = null; $('reply').classList.add('hidden'); }
$('reply').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  sendSay('r', +b.dataset.rid); hideReply();
});

function openMenu(p, x, y) {
  S.menuFor = p.id; $('pmName').textContent = p.name;
  const m = $('pmenu'); m.classList.remove('hidden');
  m.style.left = clamp(x, 8, innerWidth - 190) + 'px'; m.style.top = clamp(y - 150, 8, innerHeight - 170) + 'px';
}
const closeMenu = () => $('pmenu').classList.add('hidden');
function hidePlayer(id) { S.muted.add(id); const p = S.players.get(id); if (p) p.b = null; if (S.reply && S.reply.from === id) hideReply(); }
$('pmHide').addEventListener('click', () => { hidePlayer(S.menuFor); closeMenu(); toast('이 사람의 말은 더 이상 보이지 않아요'); });
$('pmReport').addEventListener('click', () => { sendWs({ t: 'report', target: S.menuFor }); hidePlayer(S.menuFor); closeMenu(); toast('신고했어요. 이 사람의 말은 더 이상 보이지 않아요'); });
$('pmClose').addEventListener('click', closeMenu);

/* ---------------- 식사 진행 ---------------- */
function say(text) {
  S.say = text;
  const el = $('hachiSay'); el.innerHTML = '<b>하치</b>' + text; el.classList.toggle('hidden', me.phase === 'idle');
}
function setPhase(p) {
  me.phase = p;
  say(pick(SAY[p] || ['']));
  if (p === 'cooking') { me.lidOpen = false; me.dish = 'none'; me.food = 1; me.share = null; S.shared.clear(); S.cookEnd = S.t + COOK_MS; startCookSound(); }
  if (p === 'ready') { stopCookSound(); SFX.steam(0.5); SFX.chime(); kPuff(830, 175, 10, 1); }
  if (p === 'choosing') { me.lidOpen = true; SFX.lid(); kPuff(830, 170, 40, 2.2); }
  if (p === 'eating') { me.food = 1; }
  if (p === 'done') { setTimeout(showCard, 900); }
  renderMeal(); updateActs(); sendState();
}
function bite() {
  if (me.phase !== 'eating' || me.food <= 0.001 || S.t - S.lastBite < 380) return;
  S.lastBite = S.t; me.food = Math.max(0, Math.round((me.food - 0.1) * 100) / 100);
  me.bumpT = S.t; SFX.spoon(1); setTimeout(() => SFX.chew(1), 110);
  const b = L.bowlPos(me.table, me.seat); puffAt(b.x, b.y - 10, 5, 0.9); sendWs({ t: 'bite', food: me.food });
  if (Math.abs(me.food - 0.5) < 0.001) renderSay();
  if (me.food <= 0.001) { clearTimeout(S.doneTimer); S.doneTimer = setTimeout(() => { if (me.phase === 'eating') setPhase('done'); }, 900); }
}
function chooseSide(key) { me.dish = key; SFX.tap(); me.phase = 'eating'; say('밥그릇을 눌러서 한 숟갈씩'); me.food = 1; renderMeal(); sendState(); }

/* ---------------- 3D 장면 (그리기는 scene3d.js) ---------------- */
const scene3d = createScene(cv, L, { me, S, everyone });
const puffAt = (x, y, n, size) => scene3d.puff(x * 0.01, 0.95, y * 0.01, n, size);   // 바닥 좌표(px) -> 3D
const kPuff = (_x, _y, n, size) => scene3d.cookerPuff(n, size);
addEventListener('resize', () => scene3d.resize());

/* ---------------- 루프 / 입력 ---------------- */
let last = performance.now();
function step(p, dt) {       // 목표 지점까지 걷기. 앉아 있으면 움직이지 않는다
  if (p.table >= 0) return;
  const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
  if (d < 1) { p.x = p.tx; p.y = p.ty; return; }
  const m = Math.min(d, SPEED * dt); p.x += dx / d * m; p.y += dy / d * m;
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; S.t = now;
  everyone().forEach(p => step(p, dt));
  const fg = fogAt(now); scene3d.setFog(fg); if (A.ambLP) A.ambLP.frequency.setTargetAtTime(9000 - 7800 * fg, A.ctx.currentTime, 0.3);
  if (S.started) {
    const sig = me.phase + (nearPot() ? 'P' : '') + ((shareTarget() || {}).id || '');   // 밥솥 앞에 섰는지, 나눠줄 친구가 있는지가 바뀌면 패널을 다시 그린다
    if (sig !== S.sig) { S.sig = sig; renderMeal(); }
    if (me.phase === 'cooking') {
      if (S.t >= S.cookEnd) setPhase('ready');
      else { const bar = $('mbar'); if (bar) bar.style.width = clamp(1 - (S.cookEnd - S.t) / COOK_MS, 0, 1) * 100 + '%'; }
    }
    if (me.pendingSit && me.table < 0 && !me.sitSent && dist(me, L.seatPos(me.pendingSit.t, me.pendingSit.s)) < 8) {   // 의자에 도착
      me.sitSent = true;
      if (S.online) sendWs({ t: 'sit', table: me.pendingSit.t, seat: me.pendingSit.s }); else applySit(me, me.pendingSit.t, me.pendingSit.s);
    }
    if (S.reply && S.t > S.reply.until) hideReply();
  }
  scene3d.render(now, dt);
  requestAnimationFrame(frame);
}

let drag = null;     // 끌면 시점 회전, 그냥 누르면 클릭
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.moved || Math.hypot(dx, dy) > 6) { drag.moved = true; scene3d.rotate(dx, dy); drag.x = e.clientX; drag.y = e.clientY; }
    return;
  }
  if (!S.started) return;
  const k = scene3d.pick(e.clientX, e.clientY);
  S.hoverSeat = k.kind === 'seat' && !occupied(k.t, k.s) ? k : null;
  cv.style.cursor = (S.hoverSeat || k.kind === 'person') ? 'pointer' : 'default';
});
cv.addEventListener('pointerup', e => {
  const d = drag; drag = null; if (!d || d.moved || !S.started) return;
  if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  closeMenu();
  const k = scene3d.pick(e.clientX, e.clientY);
  if (k.kind === 'person') openMenu(k.p, e.clientX, e.clientY);
  else if (k.kind === 'bowl') { if (me.phase === 'eating' && k.t === me.table && k.s === me.seat) bite(); }
  else if (k.kind === 'seat') { if (occupied(k.t, k.s)) { if (!(me.table === k.t && me.seat === k.s)) toast('이미 앉아 있는 자리예요'); } else { S.afterSit = ''; goSit(k); } }
  else if (k.kind === 'ground') setTarget(k.x, k.y);
});
cv.addEventListener('wheel', e => { e.preventDefault(); scene3d.zoom(e.deltaY); }, { passive: false });
addEventListener('keydown', e => {
  if (!S.started) return;
  if (((document.activeElement && document.activeElement.tagName) || '') === 'INPUT') return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (me.phase === 'ready') setPhase('choosing'); else if (me.phase === 'eating') bite();
  } else if (me.phase === 'choosing' && '123'.includes(e.key)) chooseSide(sideChoices()[+e.key - 1]);
});

$('mute').addEventListener('click', () => {
  A.muted = !A.muted; if (A.master) A.master.gain.value = A.muted ? 0 : 0.9; $('mute').textContent = A.muted ? '🔇' : '🔊';
});
$('start').addEventListener('click', () => {
  $('intro').classList.add('hidden'); S.started = true;
  initAudio(); if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); startAmbient();
  $('actbar').classList.remove('hidden'); $('pops').classList.remove('hidden');
  connect(); renderRoom(); renderSay(); updateActs(); renderMeal();
  setTimeout(() => toast('바닥을 눌러 걸어 보세요. 끌면 시점이 돌아가요.'), 400);
});

/* ---------------- 엔딩 카드 ---------------- */
let cardBlob = null;
function makeCard() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1350);
  const tone = { morning: ['#fff3d6', '#f7d9a8'], lunch: ['#fff0cf', '#f5cd92'], dinner: ['#ffe0c0', '#eeaa7c'], night: ['#f1d7b0', '#b98866'] }[PERIOD];
  grad.addColorStop(0, tone[0]); grad.addColorStop(1, tone[1]); g.fillStyle = grad; g.fillRect(0, 0, 1080, 1350);
  const T = (t, x, y, size, color = '#4a3322', weight = 700) => { g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  T('하치네 집밥', 540, 120, 40, '#a8714a');
  for (let i = 0; i < 7; i++) { const rg = g.createRadialGradient(540 + Math.sin(i) * 90, 420 - i * 28, 0, 540 + Math.sin(i) * 90, 420 - i * 28, 90); rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.arc(540 + Math.sin(i) * 90, 420 - i * 28, 90, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(80,45,20,.2)'; g.beginPath(); g.ellipse(540, 640, 330, 70, 0, 0, 7); g.fill();
  g.fillStyle = '#f7efe2'; g.strokeStyle = '#d8c9b2'; g.lineWidth = 6; g.beginPath(); g.ellipse(540, 600, 310, 82, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(540, 590, 250, 58, 0, 0, 7); g.fill();
  g.fillStyle = '#fffefb'; g.beginPath(); g.ellipse(540, 540, 200, 78, 0, 0, 7); g.fill(); g.strokeStyle = '#efe6d5'; g.stroke();
  if (me.dish !== 'none') { g.font = `110px ${FONT}`; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(DISH[me.dish][1], 860, 660); }
  T('오늘도 잘 먹었습니다', 540, 820, 64);
  g.font = `500 36px ${FONT}`; g.fillStyle = '#6a4a34'; g.textAlign = 'center';
  wrapText(g, pick(ENDING), 540, 920, 780, 56);
  const withN = me.table >= 0 ? [...S.players.values()].filter(p => p.table === me.table).length : 0;
  T(`${MENU[PERIOD].label} 한 끼${me.dish !== 'none' ? ' · ' + DISH[me.dish][0] : ''}`, 540, 1060, 38, '#a8714a');
  if (S.online && withN > 0) T(`${withN + 1}명이 한 상에 둘러앉아`, 540, 1112, 30, '#8a6a52', 500);
  const d = new Date();
  T(`${me.name || '손님'} · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`, 540, 1160, 30, '#8a6a52', 500);
  T('밥은 쿠첸이 지었어요', 540, 1260, 30, '#1f3b5c', 700);
  return c;
}
function wrapText(g, t, x, y, maxW, lh) {
  const words = t.split(' '); let line = '', yy = y;
  for (const w of words) { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = test; }
  g.fillText(line, x, yy);
}
function showCard() {
  if (me.phase !== 'done') return;     // 그 사이 일어났으면 보여 주지 않는다
  const c = makeCard(); $('cardImg').src = c.toDataURL('image/png');
  c.toBlob(b => { cardBlob = b; }, 'image/png');
  $('card').classList.remove('hidden');
}
function closeCard(next) { $('card').classList.add('hidden'); if (me.phase === 'done') { if (next) setPhase('cooking'); else resetMealKeepSeat(); } }
function resetMealKeepSeat() { me.phase = 'idle'; me.food = 1; me.dish = 'none'; me.lidOpen = false; me.share = null; S.shared.clear(); $('hachiSay').classList.add('hidden'); renderMeal(); updateActs(); sendState(); }
$('card').addEventListener('click', e => { if (e.target === $('card')) closeCard(false); });
$('bye').addEventListener('click', () => { sendSay('p', 10); });
$('save').addEventListener('click', () => {
  if (!cardBlob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(cardBlob); a.download = '하치네집밥.png'; a.click();
});
$('share').addEventListener('click', async () => {
  if (!cardBlob) return;
  const file = new File([cardBlob], '하치네집밥.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: '하치네 집밥', text: '오늘도 따뜻하게 먹었어요', url: location.href });
    else if (navigator.share) await navigator.share({ title: '하치네 집밥', text: '같이 밥 먹을래요?', url: location.href });
    else { await navigator.clipboard.writeText(location.href); toast('링크를 복사했어요'); }
  } catch {}
});
$('again').addEventListener('click', () => closeCard(true));

requestAnimationFrame(frame);
})();
