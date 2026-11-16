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
    socket.emit('error:message', 'The battlefield arrives in the movement piece.');
  });
  socket.on('game:quit', () => removePlayer(socket.id, 'quit'));
  socket.on('disconnect', () => removePlayer(socket.id, 'disconnected'));
});

server.listen(PORT, '0.0.0.0', () => console.log(`TANK GAME server listening on port ${PORT}`));
