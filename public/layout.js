// 서버와 브라우저가 같이 쓰는 식당 좌표 (좌표를 바꾸려면 여기만 고치세요)
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make(); else root.LAYOUT = make();
})(this, function () {
  const WORLD_W = 2600, WORLD_H = 1600;
  const TABLE_RX = 170, TABLE_RY = 78, SEATS = 6;
  const tables = [];
  [720, 1140].forEach(y => [700, 1300, 1900].forEach(x => tables.push({ x, y })));
  const ang = s => (s * 60 - 90) * Math.PI / 180;
  const BOUNDS = { x0: 70, x1: WORLD_W - 70, y0: 290, y1: WORLD_H - 60 };
  const clampPt = (x, y) => ({ x: Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), y: Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, y)) });
  const seatPos = (t, s) => ({ x: Math.round(tables[t].x + Math.cos(ang(s)) * (TABLE_RX + 55)), y: Math.round(tables[t].y + Math.sin(ang(s)) * (TABLE_RY + 50)) });
  const bowlPos = (t, s) => ({ x: Math.round(tables[t].x + Math.cos(ang(s)) * TABLE_RX * 0.62), y: Math.round(tables[t].y + Math.sin(ang(s)) * TABLE_RY * 0.62) });
  const standPos = (t, s) => { const p = seatPos(t, s); return clampPt(Math.round(p.x + Math.cos(ang(s)) * 55), Math.round(p.y + Math.sin(ang(s)) * 40)); };
  return { WORLD_W, WORLD_H, TABLE_RX, TABLE_RY, SEATS, tables, BOUNDS, clampPt, seatPos, bowlPos, standPos, SPAWN: { x: 1300, y: 1460 }, HEAR: 330 };
});
