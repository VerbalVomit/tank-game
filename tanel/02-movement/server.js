const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

// Shared game settings. Every room uses the same tile grid and movement rules.
const PORT = Number(process.env.PORT) || 3000;
const TILE = 32;
const COLS = 20;
const ROWS = 15;
const ARENA_W = COLS * TILE;
const ARENA_H = ROWS * TILE;
const TICK_MS = 1000 / 30;
const SPEED = 132;
const ROUND_MS = 180000;
const COLORS = ['#f5ca36', '#55d787', '#55a8f3', '#ef5d57'];
const SPAWNS = [
  { x: 36, y: 36 }, { x: 580, y: 36 }, { x: 36, y: 420 }, { x: 580, y: 420 }
];

function makeMap() {
  // Build a 20-by-15 tile grid, then mirror the cover so each spawn has similar protection.
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const set = (x, y, kind) => { grid[y][x] = { id: `${x}:${y}`, x, y, kind }; };
  const mirrored = (x, y, kind) => {
    for (const [mx, my] of [[x, y], [COLS - 1 - x, y], [x, ROWS - 1 - y], [COLS - 1 - x, ROWS - 1 - y]]) set(mx, my, kind);
  };
  // Corner cover, mirrored lanes, a covered center, and a leafy middle strip.
  for (const y of [1, 2, 12, 13]) for (const x of [2, 3, 16, 17]) set(x, y, 'b');
  for (const y of [1, 13]) for (const x of [9, 10]) set(x, y, 's');
  for (const y of [3, 5, 9, 11]) for (const x of [6, 13]) set(x, y, 'b');
  for (const y of [4, 10]) for (const x of [1, 2, 17, 18, 6, 13]) set(x, y, 's');
  for (const y of [6, 8]) for (const x of [4, 5, 14, 15]) set(x, y, 's');
  for (const y of [7]) for (const x of [3, 4, 7, 8, 9, 10, 11, 12, 15, 16]) set(x, y, 'g');
  // Add symmetric brick posts around the center; center itself stays traversable.
  for (const [x, y] of [[5, 3], [7, 5], [8, 6], [11, 6], [5, 11], [7, 9]]) mirrored(x, y, 'b');
  return grid;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const sockets = new Map();
// Clean nicknames before storing or broadcasting them; keep the limit small for tank labels.
const cleanName = value => String(value || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 16);
const validName = name => name.length >= 2;
const roomCode = () => {
  let code;
  do { code = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms.has(code));
  return code;
};
const alivePlayers = room => [...room.players.values()].filter(p => p.lives > 0 && !p.left);
// Only send fields the browser needs. Positions and scores still come from this server.
const publicPlayers = room => [...room.players.values()].map(p => ({
  id: p.id, name: p.name, color: p.color, ready: p.ready, host: p.id === room.hostId,
  isBot: Boolean(p.isBot),
  x: p.x, y: p.y, dir: p.dir, lives: p.lives, kills: p.kills,
  eliminated: p.lives <= 0 || p.left, invulnerable: p.invulnerableUntil > Date.now(), respawning: Boolean(p.respawnAt)
}));
function lobbyState(room) {
  return { code: room.code, hostId: room.hostId, phase: room.phase, solo: room.solo, players: publicPlayers(room), remainingMs: room.remainingMs, paused: room.paused };
}
function emitRoom(room, event, data) { io.to(room.code).emit(event, data); }
function broadcastLobby(room) { emitRoom(room, 'room:update', lobbyState(room)); }
function notice(room, message, type = 'info') { emitRoom(room, 'notice', { message, type, at: Date.now() }); }

function createRoom(socket, name) {
  // A room owns its map, roster, bullets, timer, and match phase.
  const code = roomCode();
  const room = {
    code, hostId: socket.id, phase: 'lobby', players: new Map(), map: makeMap(), bullets: [],
    remainingMs: ROUND_MS, paused: false, lastTick: Date.now(), tickId: null, solo: false
  };
  rooms.set(code, room);
  addPlayer(socket, room, name);
  return room;
}
function addPlayer(socket, room, name, announce = true) {
  // Human players begin in a lobby; solo mode adds CPU players separately.
  const p = {
    id: socket.id, name, color: COLORS.find(color => ![...room.players.values()].some(existing => existing.color === color)) || COLORS[0], ready: room.players.size === 0,
    isBot: false,
    x: 0, y: 0, dir: 'up', lives: 3, kills: 0, left: false,
    input: { up: false, down: false, left: false, right: false, shoot: false },
    invulnerableUntil: 0, fireAt: 0, respawnAt: 0
  };
  room.players.set(socket.id, p);
  socket.join(room.code);
  sockets.set(socket.id, room.code);
  if (announce) {
    socket.emit('room:joined', lobbyState(room));
    broadcastLobby(room);
  }
}

function solidAt(room, x, y) {
  // A tank occupies a 24px square, so check every tile its corners overlap.
  const left = Math.floor(x / TILE), right = Math.floor((x + 24 - 0.001) / TILE);
  const top = Math.floor(y / TILE), bottom = Math.floor((y + 24 - 0.001) / TILE);
  if (left < 0 || top < 0 || right >= COLS || bottom >= ROWS) return true;
  for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
    const tile = room.map[ty][tx];
    if (tile && (tile.kind === 'b' || tile.kind === 's')) return true;
  }
  return false;
}
function overlaps(a, b, ax = a.x, ay = a.y) {
  return ax < b.x + 24 && ax + 24 > b.x && ay < b.y + 24 && ay + 24 > b.y;
}
function canOccupy(room, p, x, y) {
  // Share one check for map walls, arena edges, and collisions with other living tanks.
  if (solidAt(room, x, y)) return false;
  return alivePlayers(room).every(other => other.id === p.id || other.respawnAt || !overlaps({ x, y }, other, x, y));
}
function movePlayer(room, p, dt) {
  // Split movement into short steps so a fast tank cannot pass through a thin wall.
  const dirs = p.input;
  let dx = (dirs.right ? 1 : 0) - (dirs.left ? 1 : 0);
  let dy = (dirs.down ? 1 : 0) - (dirs.up ? 1 : 0);
  if (!dx && !dy) return;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right'; else p.dir = dy < 0 ? 'up' : 'down';
  const stepX = dx * SPEED * dt, stepY = dy * SPEED * dt;
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(stepX), Math.abs(stepY)) / 4));
  for (let i = 0; i < count; i++) {
    const nx = p.x + stepX / count, ny = p.y + stepY / count;
    if (canOccupy(room, p, nx, ny)) { p.x = nx; p.y = ny; }
    else {
      if (canOccupy(room, p, nx, p.y)) p.x = nx;
      if (canOccupy(room, p, p.x, ny)) p.y = ny;
    }
  }
}

function resetForMatch(room) {
  // Rebuild match state and place every roster member at a clean spawn before the timer starts.
  room.map = makeMap(); room.bullets = []; room.remainingMs = ROUND_MS; room.paused = false;
  room.lastTick = Date.now(); room._timerTick = room.lastTick;
  [...room.players.values()].forEach((p, i) => {
    p.x = SPAWNS[i].x; p.y = SPAWNS[i].y; p.dir = i < 2 ? 'down' : 'up'; p.lives = 3; p.kills = 0; p.left = false;
    p.input = { up: false, down: false, left: false, right: false, shoot: false };
    p.invulnerableUntil = Date.now() + 1500; p.respawnAt = 0;
  });
  room.phase = 'game';
  emitRoom(room, 'game:start', { map: room.map, players: publicPlayers(room), remainingMs: room.remainingMs, tile: TILE, solo: room.solo });
  room.tickId = setInterval(() => tick(room), TICK_MS);
}

function tick(room) {
  const now = Date.now();
  const seconds = Math.min(0.06, (now - room.lastTick) / 1000);
  room.lastTick = now;
  for (const player of alivePlayers(room)) movePlayer(room, player, seconds);
  emitRoom(room, 'game:state', {
    players: publicPlayers(room),
    bullets: [],
    remainingMs: room.remainingMs,
    paused: false
  });
}

function removePlayer(socketId, action) {
  const code = sockets.get(socketId);
  const room = rooms.get(code);
  if (!room) return;
  const player = room.players.get(socketId);
  io.sockets.sockets.get(socketId)?.leave(code);
  room.players.delete(socketId);
  sockets.delete(socketId);
  if (room.players.size === 0) {
    clearInterval(room.tickId);
    rooms.delete(code);
    return;
  }
  if (room.hostId === socketId) room.hostId = room.players.keys().next().value;
  const returnToLobby = room.phase === 'game' && room.players.size < 2;
  if (returnToLobby) {
    clearInterval(room.tickId);
    room.tickId = null;
    room.phase = 'lobby';
    for (const member of room.players.values()) member.ready = member.id === room.hostId;
    emitRoom(room, 'room:returned', lobbyState(room));
  }
  notice(room, `${player.name} ${action === 'quit' ? 'left the room' : 'disconnected'}.`);
  broadcastLobby(room);
}

io.on('connection', socket => {
  // Socket events carry player intent. The server checks permissions and changes room state.
  socket.on('room:create', payload => {
    if (sockets.has(socket.id)) return socket.emit('error:message', 'You are already in a room.');
    const name = cleanName(payload?.name);
    if (!validName(name)) return socket.emit('error:message', 'Use a nickname with at least 2 characters.');
    createRoom(socket, name);
  });
  socket.on('room:join', payload => {
    if (sockets.has(socket.id)) return socket.emit('error:message', 'You are already in a room.');
    const name = cleanName(payload?.name), code = String(payload?.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!validName(name)) return socket.emit('error:message', 'Use a nickname with at least 2 characters.');
    if (!room) return socket.emit('error:message', 'Room not found. Check the code and try again.');
    if (room.phase !== 'lobby') return socket.emit('error:message', 'That match has already started.');
    if (room.players.size >= 4) return socket.emit('error:message', 'That room is full.');
    if ([...room.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return socket.emit('error:message', 'That nickname is already in this room.');
    addPlayer(socket, room, name);
  });
  socket.on('player:ready', value => {
    const room = rooms.get(sockets.get(socket.id)); const player = room?.players.get(socket.id);
    if (!room || room.phase !== 'lobby' || !player) return;
    player.ready = Boolean(value); broadcastLobby(room);
  });
  socket.on('game:start', () => {
    const room = rooms.get(sockets.get(socket.id));
    if (!room || room.phase !== 'lobby' || room.hostId !== socket.id) return;
    if (room.players.size < 2 || [...room.players.values()].some(p => !p.ready)) return socket.emit('error:message', 'At least two players must join and everyone must be ready.');
    resetForMatch(room);
  });
  socket.on('game:input', input => {
    const room = rooms.get(sockets.get(socket.id)); const p = room?.players.get(socket.id);
    if (!room || room.phase !== 'game' || room.paused || !p || p.lives <= 0 || p.respawnAt) return;
    if (!input || typeof input !== 'object') return;
    for (const key of ['up', 'down', 'left', 'right', 'shoot']) p.input[key] = Boolean(input[key]);
  });
  socket.on('game:quit', () => removePlayer(socket.id, 'quit'));
  socket.on('disconnect', () => removePlayer(socket.id, 'disconnected'));
});

server.listen(PORT, '0.0.0.0', () => console.log(`TANK GAME server listening on port ${PORT}`));
