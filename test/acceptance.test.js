const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const { io } = require('socket.io-client');

let child;
let baseUrl;
const clients = [];

before(async () => { await startServer(); });
after(async () => {
  clients.forEach(client => client.disconnect());
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
});

function waitFor(socket, eventName, predicate = () => true, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    function handler(value) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve(value);
    }
    socket.on(eventName, handler);
  });
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function startServer() {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });
  const startBy = Date.now() + 5000;
  while (Date.now() < startBy) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    if (child.exitCode !== null) throw new Error(`Game server exited with code ${child.exitCode}`);
    await delay(80);
  }
  throw new Error('Game server did not start');
}

async function connectClient() {
  const client = io(baseUrl, { reconnection: false, timeout: 2500 });
  clients.push(client);
  await waitFor(client, 'connect');
  return client;
}

test('multiplayer acceptance flow: lobby, four pilots, combat, pause, rematch and disconnect', { timeout: 30000 }, async () => {
  const [host, second, third, fourth, fifth] = await Promise.all(Array.from({ length: 5 }, connectClient));
  const created = waitFor(host, 'room:joined');
  host.emit('room:create', { name: 'PilotA' });
  const room = await created;

  const duplicate = waitFor(second, 'error:message');
  second.emit('room:join', { name: 'pilota', code: room.code });
  assert.match(await duplicate, /already in this room/i);

  const joinSecond = waitFor(second, 'room:joined');
  second.emit('room:join', { name: 'PilotB', code: room.code });
  await joinSecond;
  for (const [client, name] of [[third, 'PilotC'], [fourth, 'PilotD']]) {
    const joined = waitFor(client, 'room:joined');
    client.emit('room:join', { name, code: room.code });
    await joined;
  }
  const full = waitFor(fifth, 'error:message');
  fifth.emit('room:join', { name: 'PilotE', code: room.code });
  assert.match(await full, /full/i);

  const blockedStart = waitFor(host, 'error:message');
  host.emit('game:start');
  assert.match(await blockedStart, /everyone must be ready/i);
  const readyRoster = waitFor(host, 'room:update', value => value.players.length === 4 && value.players.every(player => player.ready));
  [second, third, fourth].forEach(client => client.emit('player:ready', true));
  await readyRoster;

  const startEvents = [host, second, third, fourth].map(client => waitFor(client, 'game:start'));
  host.emit('game:start');
  const starts = await Promise.all(startEvents);
  assert.equal(starts[0].players.length, 4);
  assert.equal(new Set(starts[0].players.map(player => player.color)).size, 4);
  assert.equal(starts[0].map.length, 15);
  assert.ok(starts[0].map.every(row => row.length === 20));
  const forgedScore = waitFor(host, 'game:state', value => value.players.length === 4);
  host.emit('game:input', { kills: 99, lives: 99, x: 500, y: 500 });
  const initialState = await forgedScore;
  assert.equal(initialState.players.find(player => player.id === host.id).kills, 0);
  assert.equal(initialState.players.find(player => player.id === host.id).lives, 3);

  const hostState = id => value => value.players.find(player => player.id === id);
  host.emit('game:input', { right: true });
  const wallBounded = await waitFor(host, 'game:state', value => hostState(host.id)(value)?.x > 36);
  host.emit('game:input', { right: false, shoot: false });
  assert.ok(hostState(host.id)(wallBounded).x < 64, 'tank must stop before the brick row');

  let destroyedBricks = 0;
  host.on('tile:destroyed', () => destroyedBricks++);
  host.emit('game:input', { right: false, shoot: true });
  await delay(900);
  host.emit('game:input', { shoot: false });
  assert.ok(destroyedBricks >= 2, 'repeated fire should destroy brick tiles');

  host.emit('game:input', { up: true });
  second.emit('game:input', { up: true });
  await delay(430);
  host.emit('game:input', { up: false, left: true });
  await delay(100);
  host.emit('game:input', { left: false, up: true });
  second.emit('game:input', { up: false });
  await delay(450);
  host.emit('game:input', { up: false, right: true });
  await delay(80);
  host.emit('game:input', { right: true });
  second.emit('game:input', { left: true });
  await delay(2400);
  const collisionState = await waitFor(host, 'game:state');
  const hostPosition = hostState(host.id)(collisionState);
  const secondPosition = hostState(second.id)(collisionState);
  host.emit('game:input', { right: false });
  second.emit('game:input', { left: false });
  assert.ok(secondPosition.x >= hostPosition.x + 23, 'tank bodies must not overlap');
  const hitStatePromise = waitFor(host, 'game:state', value => {
    const target = value.players.find(player => player.id === second.id);
    const shooter = value.players.find(player => player.id === host.id);
    return target?.lives === 2 && target.respawning && shooter.kills === 1;
  }, 5000);
  host.emit('game:input', { shoot: true });
  await delay(180);
  host.emit('game:input', { shoot: false });
  const hit = await hitStatePromise;
  assert.equal(hostState(second.id)(hit).lives, 2);
  const respawn = await waitFor(host, 'game:state', value => {
    const target = hostState(second.id)(value);
    return target?.lives === 2 && !target.respawning && target.invulnerable;
  }, 4000);
  assert.equal(hostState(second.id)(respawn).lives, 2);

  const timerBeforePause = respawn.remainingMs;
  const hostPaused = waitFor(host, 'game:paused', value => value.paused);
  const secondPaused = waitFor(second, 'game:paused', value => value.paused);
  host.emit('game:pause');
  await Promise.all([hostPaused, secondPaused]);
  await delay(400);
  const hostResumed = waitFor(host, 'game:paused', value => !value.paused);
  const secondResumed = waitFor(second, 'game:paused', value => !value.paused);
  const resumedStatePromise = waitFor(host, 'game:state');
  second.emit('game:pause');
  await Promise.all([hostResumed, secondResumed]);
  const resumedState = await resumedStatePromise;
  assert.ok(resumedState.remainingMs >= timerBeforePause - 120, 'paused time must not be deducted');

  const eliminatedNotice = waitFor(host, 'notice', value => /PilotD quit the match/.test(value.message));
  const ended = waitFor(host, 'game:over');
  second.emit('game:quit');
  third.emit('game:quit');
  fourth.emit('game:quit');
  const [gameOver, quitNotice] = await Promise.all([ended, eliminatedNotice]);
  assert.match(quitNotice.message, /PilotD/);
  assert.deepEqual(gameOver.winners.map(winner => winner.id), [host.id]);

  const returned = waitFor(host, 'room:returned');
  host.emit('game:return-lobby');
  const lobby = await returned;
  assert.deepEqual(lobby.players.map(player => player.id), [host.id], 'departed players should not return as ghosts');

  const rejoined = waitFor(second, 'room:joined');
  second.emit('room:join', { name: 'PilotB', code: room.code });
  await rejoined;
  const rematchReady = waitFor(host, 'room:update', value => value.players.length === 2 && value.players.every(player => player.ready));
  second.emit('player:ready', true);
  await rematchReady;
  const rematchStarts = [host, second].map(client => waitFor(client, 'game:start'));
  host.emit('game:start');
  const rematch = await Promise.all(rematchStarts);
  assert.equal(rematch[0].remainingMs, 180000, 'rematch timer starts at three minutes');

  const disconnectNotice = waitFor(host, 'notice', value => /PilotB disconnected/.test(value.message));
  const disconnectWinner = waitFor(host, 'game:over');
  second.disconnect();
  const [disconnectResult, disconnected] = await Promise.all([disconnectWinner, disconnectNotice]);
  assert.match(disconnected.message, /PilotB/);
  assert.deepEqual(disconnectResult.winners.map(winner => winner.id), [host.id]);

  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const clientCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'game.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  assert.doesNotMatch(html + clientCode + css, /<canvas\b/i);
  assert.match(clientCode, /requestAnimationFrame/);
  assert.match(clientCode, /translate3d/);
});
