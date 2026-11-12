const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { chooseWinners } = require('./game-rules');

// Shared game settings. Every room uses the same tile grid and movement rules.
const PORT = Number(process.env.PORT) || 3000;
const TILE = 32;
const COLS = 20;
const ROWS = 15;
const ARENA_W = COLS * TILE;
const ARENA_H = ROWS * TILE;
const TICK_MS = 1000 / 30;
const SPEED = 132;
const BULLET_SPEED = 300;
const FIRE_MS = 420;
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

function createRoom(socket, name, solo = false) {
  // A room owns its map, roster, bullets, timer, and match phase.
  const code = roomCode();
  const room = {
    code, hostId: socket.id, phase: 'lobby', players: new Map(), map: makeMap(), bullets: [],
    remainingMs: ROUND_MS, paused: false, lastTick: Date.now(), tickId: null, solo
  };
  rooms.set(code, room);
  addPlayer(socket, room, name, !solo);
  if (solo) {
    for (let i = 1; i <= 3; i++) addBot(room, i);
    socket.emit('room:joined', lobbyState(room));
  }
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
function addBot(room, index) {
  // CPU pilots use the same tank, lives, and score fields as human players.
  room.players.set(`cpu-${room.code}-${index}`, {
    id: `cpu-${room.code}-${index}`, name: `CPU ${index}`, color: COLORS[index], ready: true, isBot: true, botIndex: index,
    x: 0, y: 0, dir: 'up', lives: 3, kills: 0, left: false,
    input: { up: false, down: false, left: false, right: false, shoot: false },
    invulnerableUntil: 0, fireAt: 0, respawnAt: 0, nextThinkAt: 0, aimDirection: null
  });
}
function score(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, lives: p.lives, eliminated: p.lives <= 0 || p.left }));
}
function endRound(room, reason) {
  // Stop the simulation once, calculate the result on the server, and notify the whole room.
  if (room.phase !== 'game') return;
  room.phase = 'over'; room.paused = false; room.remainingMs = Math.max(0, room.remainingMs);
  if (room.tickId) clearInterval(room.tickId);
  const winners = chooseWinners([...room.players.values()], reason);
  emitRoom(room, 'game:over', { winners, reason, scores: score(room) });
  broadcastLobby(room);
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
function updateBotInput(room, bot, now) {
  // Solo bots chase the nearest living human. A grid search gives them a route around walls.
  const targets = alivePlayers(room).filter(player => !player.isBot && !player.respawnAt);
  if (!targets.length) {
    bot.input = { up: false, down: false, left: false, right: false, shoot: false };
    bot.aimDirection = null;
    return;
  }
  const target = targets.reduce((nearest, player) => {
    const distance = (player.x - bot.x) ** 2 + (player.y - bot.y) ** 2;
    return !nearest || distance < nearest.distance ? { player, distance } : nearest;
  }, null).player;
  const dx = target.x - bot.x, dy = target.y - bot.y;
  const horizontal = dx < 0 ? 'left' : 'right';
  const vertical = dy < 0 ? 'up' : 'down';
  const sameRow = Math.abs(dy) < 30;
  const sameColumn = Math.abs(dx) < 30;
  bot.aimDirection = sameRow ? horizontal : sameColumn ? vertical : null;
  bot.input.shoot = Boolean(bot.aimDirection);
  if (now < bot.nextThinkAt) return;

  const start = { x: Math.floor((bot.x + 12) / TILE), y: Math.floor((bot.y + 12) / TILE) };
  const goal = { x: Math.floor((target.x + 12) / TILE), y: Math.floor((target.y + 12) / TILE) };
  // Breadth-first search checks the four neighboring cells and records each cell's predecessor.
  const directions = [
    { name: 'up', x: 0, y: -1 }, { name: 'right', x: 1, y: 0 },
    { name: 'down', x: 0, y: 1 }, { name: 'left', x: -1, y: 0 }
  ];
  const key = cell => `${cell.x}:${cell.y}`;
  const queue = [start], previous = new Map([[key(start), null]]);
  let reached = key(start) === key(goal) ? start : null;
  for (let cursor = 0; cursor < queue.length && !reached; cursor++) {
    const cell = queue[cursor];
    for (const direction of directions) {
      const next = { x: cell.x + direction.x, y: cell.y + direction.y };
      const nextKey = key(next);
      if (next.x < 0 || next.y < 0 || next.y >= room.map.length || next.x >= room.map[0].length || previous.has(nextKey)) continue;
      if (solidAt(room, next.x * TILE + 4, next.y * TILE + 4)) continue;
      previous.set(nextKey, { cell, direction });
      if (nextKey === key(goal)) { reached = next; break; }
      queue.push(next);
    }
  }

  let routeDirection = null;
  if (reached && key(reached) !== key(start)) {
    let step = reached;
    while (key(previous.get(key(step)).cell) !== key(start)) step = previous.get(key(step)).cell;
    routeDirection = previous.get(key(step)).direction.name;
  }
  bot.input.up = bot.input.down = bot.input.left = bot.input.right = false;
  const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const toward = Math.abs(dx) > Math.abs(dy) ? horizontal : vertical;
  const alternatives = routeDirection ? [routeDirection, toward, 'up', 'right', 'down', 'left'] : [toward, 'up', 'right', 'down', 'left'];
  const move = [...new Set(alternatives)].find(direction => {
    const [vx, vy] = vectors[direction];
    return canOccupy(room, bot, bot.x + vx * 18, bot.y + vy * 18);
  });
  if (move) bot.input[move] = true;
  bot.nextThinkAt = now + 600 + bot.botIndex * 100;
}
function shoot(room, p, now) {
  // The server creates bullets from the tank's facing direction and enforces the fire cooldown.
  if (!p.input.shoot || now < p.fireAt || p.lives <= 0) return;
  p.fireAt = now + (p.isBot ? 1400 + p.botIndex * 250 : FIRE_MS);
  const vectors = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const [dx, dy] = vectors[p.dir];
  room.bullets.push({ id: `${p.id}-${now}-${Math.random()}`, ownerId: p.id, x: p.x + 12 + dx * 13, y: p.y + 12 + dy * 13, dx, dy });
  emitRoom(room, 'sound', { type: 'shoot' });
}
function updateBullets(room, dt, now) {
  // Move each bullet in small increments so thin walls and tanks cannot be skipped between ticks.
  const next = [];
  for (const b of room.bullets) {
    let keep = true;
    const distance = BULLET_SPEED * dt;
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let i = 0; i < steps && keep; i++) {
      b.x += b.dx * distance / steps; b.y += b.dy * distance / steps;
      if (b.x < 0 || b.y < 0 || b.x >= ARENA_W || b.y >= ARENA_H) { keep = false; break; }
      const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE), tile = room.map[ty][tx];
      if (tile && (tile.kind === 'b' || tile.kind === 's')) {
        if (tile.kind === 'b') { room.map[ty][tx] = null; emitRoom(room, 'tile:destroyed', { x: tx, y: ty }); }
        keep = false; emitRoom(room, 'sound', { type: 'impact' }); break;
      }
      const target = alivePlayers(room).find(p => p.id !== b.ownerId && !p.respawnAt && now >= p.invulnerableUntil && b.x >= p.x && b.x <= p.x + 24 && b.y >= p.y && b.y <= p.y + 24);
      if (target) {
        target.lives -= 1; target.input = { up: false, down: false, left: false, right: false, shoot: false };
        const owner = room.players.get(b.ownerId); if (owner) owner.kills += 1;
        keep = false;
        emitRoom(room, 'sound', { type: target.lives > 0 ? 'hit' : 'destroy' });
        emitRoom(room, 'explosion', { x: target.x, y: target.y, final: target.lives <= 0 });
        if (target.lives > 0) {
          target.respawnAt = now + 1400;
        } else {
          target.left = false;
          notice(room, `${target.name} was eliminated.`, 'danger');
        }
      }
    }
    if (keep) next.push(b);
  }
  room.bullets = next;
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
  // One authoritative 30 Hz update advances input, movement, bullets, scores, and the clock.
  if (room.phase !== 'game' || room.paused) { room.lastTick = Date.now(); return; }
  const now = Date.now();
  const dt = Math.min(0.06, (now - room.lastTick) / 1000);
  room.lastTick = now;
  room.remainingMs -= now - (room._timerTick || now); room._timerTick = now;
  for (const p of alivePlayers(room)) {
    if (p.isBot) updateBotInput(room, p, now);
    if (p.respawnAt && now >= p.respawnAt) {
      const spawnIndex = [...room.players.values()].indexOf(p);
      const choices = SPAWNS.map((_, i) => SPAWNS[(spawnIndex + i) % SPAWNS.length]);
      const spawn = choices.find(candidate => !solidAt(room, candidate.x, candidate.y) && alivePlayers(room).every(other => other.id === p.id || other.respawnAt || !overlaps({ x: candidate.x, y: candidate.y }, other, candidate.x, candidate.y)));
      if (!spawn) { p.respawnAt = now + 250; continue; }
      p.x = spawn.x; p.y = spawn.y; p.respawnAt = 0; p.invulnerableUntil = now + 1500;
    }
    if (p.respawnAt) continue;
    movePlayer(room, p, dt);
    if (p.isBot && p.aimDirection) p.dir = p.aimDirection;
    shoot(room, p, now);
  }
  updateBullets(room, dt, now);
  const snapshot = { players: publicPlayers(room), bullets: room.bullets.map(({ id, ...b }) => b), remainingMs: Math.max(0, room.remainingMs), paused: room.paused };
  emitRoom(room, 'game:state', snapshot);
  if (room.solo && !alivePlayers(room).some(player => !player.isBot)) endRound(room, 'solo-defeat');
  else if (alivePlayers(room).length <= 1) endRound(room, 'last-player');
  else if (room.remainingMs <= 0) endRound(room, 'time');
}
function removePlayer(socketId, action = 'disconnected') {
  // Handle a quit and a lost connection through the same cleanup path.
  const code = sockets.get(socketId); if (!code) return;
  const room = rooms.get(code); const socket = io.sockets.sockets.get(socketId); const player = room?.players.get(socketId);
  if (!room || !player) { sockets.delete(socketId); return; }
  let endAfterRemoval = false;
  if (room.phase === 'game' && player.lives > 0) {
    player.lives = 0; player.left = true;
    notice(room, action === 'quit' ? `${player.name} quit the match.` : `${player.name} disconnected.`, action === 'quit' ? 'info' : 'warning');
    endAfterRemoval = alivePlayers(room).length <= 1;
  } else {
    room.players.delete(socketId);
    notice(room, action === 'quit' ? `${player.name} left the room.` : `${player.name} disconnected.`, 'info');
  }
  if (socket) socket.leave(code);
  sockets.delete(socketId);
  if (room.hostId === socketId) {
    room.hostId = [...room.players.values()].find(p => p.id !== socketId && sockets.get(p.id) === code)?.id || null;
  }
  const hasConnectedPlayer = [...room.players.keys()].some(id => sockets.get(id) === code);
  if (!hasConnectedPlayer) {
    if (room.tickId) clearInterval(room.tickId);
    rooms.delete(code);
  } else {
    // Update promoted host state before announcing game over so the right client
    // gets the host-only return-to-lobby control.
    broadcastLobby(room);
    if (endAfterRemoval) endRound(room, 'last-player');
  }
}

io.on('connection', socket => {
  // Socket events carry player intent. The server checks permissions and changes room state.
  socket.on('room:create', payload => {
    if (sockets.has(socket.id)) return socket.emit('error:message', 'You are already in a room.');
    const name = cleanName(payload?.name);
    if (!validName(name)) return socket.emit('error:message', 'Use a nickname with at least 2 characters.');
    createRoom(socket, name);
  });
  socket.on('solo:start', payload => {
    if (sockets.has(socket.id)) return socket.emit('error:message', 'You are already in a room.');
    const name = cleanName(payload?.name);
    if (!validName(name)) return socket.emit('error:message', 'Use a nickname with at least 2 characters.');
    const room = createRoom(socket, name, true);
    resetForMatch(room);
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
  socket.on('game:pause', () => {
    const room = rooms.get(sockets.get(socket.id)); const p = room?.players.get(socket.id);
    if (!room || room.phase !== 'game' || !p) return;
    room.paused = !room.paused; room.lastTick = Date.now(); room._timerTick = Date.now();
    for (const player of room.players.values()) player.input = { up: false, down: false, left: false, right: false, shoot: false };
    notice(room, `${p.name} ${room.paused ? 'paused' : 'resumed'} the game.`, 'info');
    emitRoom(room, 'game:paused', { paused: room.paused, by: p.name });
  });
  socket.on('game:quit', () => removePlayer(socket.id, 'quit'));
  socket.on('game:return-lobby', () => {
    const room = rooms.get(sockets.get(socket.id));
    if (!room || room.phase !== 'over') return;
    if (room.hostId !== socket.id) return socket.emit('error:message', 'Only the host can return this room to the lobby.');
    if (room.tickId) clearInterval(room.tickId);
    room.tickId = null; room.phase = 'lobby'; room.paused = false; room.bullets = []; room.map = makeMap();
    for (const [id, p] of room.players) {
      if (p.isBot || p.left || sockets.get(id) !== room.code) { room.players.delete(id); continue; }
      p.ready = p.id === room.hostId; p.left = false; p.lives = 3; p.kills = 0;
    }
    room.solo = false;
    emitRoom(room, 'room:returned', lobbyState(room)); broadcastLobby(room);
  });
  socket.on('solo:restart', () => {
    const room = rooms.get(sockets.get(socket.id));
    if (!room || !room.solo || room.phase !== 'over' || room.hostId !== socket.id) return;
    resetForMatch(room);
  });
  socket.on('disconnect', () => removePlayer(socket.id, 'disconnected'));
});

server.listen(PORT, '0.0.0.0', () => console.log(`TANK GAME server listening on port ${PORT}`));
