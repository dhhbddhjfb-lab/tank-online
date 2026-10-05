// Tank 90 Online - relay server: serves index.html and relays player state per room.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const MAX_PER_ROOM = 8;
const page = fs.readFileSync(path.join(__dirname, 'index.html'));

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});
const wss = new WebSocketServer({ server: srv, maxPayload: 8192 });
const rooms = new Map(); // name -> Map(ws -> {id, pres})
let n = 0;
const send = (c, m) => { if (c.readyState === 1) c.send(JSON.stringify(m)); };

wss.on('connection', (ws) => {
  const id = 'p' + (++n).toString(36) + Math.random().toString(36).slice(2, 6);
  let room = null;
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'join' && !room) {
      const name = String(m.r || 'main').replace(/[^a-z0-9_.-]/gi, '').slice(0, 40) || 'main';
      const r = rooms.get(name) || new Map();
      if (r.size >= MAX_PER_ROOM) return send(ws, { t: 'full' });
      rooms.set(name, r);
      send(ws, { t: 'hello', id, peers: [...r.values()].map(v => ({ id: v.id, p: v.pres })) });
      r.set(ws, { id, pres: {} });
      room = { name, r };
    } else if (m.t === 'p' && room && m.p && typeof m.p === 'object') {
      const me = room.r.get(ws);
      for (const k of Object.keys(m.p)) {
        if (m.p[k] === null) delete me.pres[k]; else me.pres[k] = m.p[k];
      }
      if (JSON.stringify(me.pres).length > 4096) { ws.close(); return; }
      for (const c of room.r.keys()) if (c !== ws) send(c, { t: 'p', id, p: m.p });
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.r.delete(ws);
    for (const c of room.r.keys()) send(c, { t: 'left', id });
    if (!room.r.size) rooms.delete(room.name);
  });
});

// keep connections alive on hosts that drop idle sockets
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 30000);

srv.listen(PORT, () => console.log('Tank 90 running on port ' + PORT));
