(() => {
  // The browser sends input and draws server snapshots; it never decides positions or scores.
  const socket = io();
  const $ = selector => document.querySelector(selector);
  const screens = { home: $('#home-screen'), lobby: $('#lobby-screen'), game: $('#game-screen'), over: $('#over-screen') };
  const arena = $('#arena');
  const state = { room: null, localId: null, phase: 'home', ready: false, muted: false, audio: null, raf: 0, keys: { up: false, down: false, left: false, right: false, shoot: false }, mapNodes: new Map(), tanks: new Map(), bullets: [], snapshots: [], lastInputAt: 0, lastTimerText: '', scoreSignature: '', toastTimer: 0, debugFps: new URLSearchParams(location.search).has('debug') };

  const colors = ['#f5ca36', '#55d787', '#55a8f3', '#ef5d57'];
  const elements = {
    nickname: $('#nickname'), roomCode: $('#room-code'), homeError: $('#home-error'), connection: $('#connection-label'),
    lobbyCode: $('#lobby-code'), lobbyPlayers: $('#lobby-players'), rosterCount: $('#roster-count'), lobbyHint: $('#lobby-hint'),
    ready: $('#ready-button'), start: $('#start-game'), hostNote: $('#host-note'), score: $('#score-list'), timer: $('#timer'),
    menu: $('#menu-overlay'), pauseShade: $('#pause-shade'), pauseCopy: $('#pause-copy'), toast: $('#toast'),
    finalBoard: $('#final-board'), winnerLine: $('#winner-line'), returnNote: $('#return-note'), fps: $('#fps-label')
  };
  if (state.debugFps) elements.fps.classList.remove('hidden');

  // Switch between the four existing screens without replacing their HTML.
  function showScreen(name) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[name].classList.add('active'); state.phase = name;
    if (name === 'game' && !state.raf) { state.lastFrame = 0; state.raf = requestAnimationFrame(frame); }
  }
  function showError(message) { elements.homeError.textContent = message || ''; }
  function toast(message) {
    elements.toast.textContent = message; elements.toast.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2500);
  }
  function connectAction(eventName) {
    // All entry buttons share the same nickname validation and send their action to the server.
    showError('');
    const name = elements.nickname.value.trim();
    if (name.length < 2) { showError('Enter a callsign with at least 2 characters.'); elements.nickname.focus(); return; }
    socket.emit(eventName, { name, code: elements.roomCode.value });
  }
  $('#create-room').addEventListener('click', () => connectAction('room:create'));
  $('#solo-game').addEventListener('click', () => connectAction('solo:start'));
  $('#join-room').addEventListener('click', () => connectAction('room:join'));
  elements.roomCode.addEventListener('input', () => { elements.roomCode.value = elements.roomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  elements.nickname.addEventListener('keydown', event => { if (event.key === 'Enter') connectAction('room:create'); });

  // Socket events keep the lobby and match view in sync with the server's current state.
  let connectedOnce = false;
  socket.on('connect', () => {
    elements.connection.textContent = 'Online'; elements.connection.previousElementSibling.classList.add('online');
    if (connectedOnce && state.room) {
      const room = state.room;
      state.room = null;
      state.keys = { up: false, down: false, left: false, right: false, shoot: false };
      elements.roomCode.value = room.code;
      showScreen('home');
      showError(room.phase === 'lobby' ? 'Connection ended. Rejoin with this room code.' : 'Connection ended. You can rejoin after the round returns to the lobby.');
    }
    connectedOnce = true;
  });
  socket.on('disconnect', () => { elements.connection.textContent = 'Reconnecting'; elements.connection.previousElementSibling.classList.remove('online'); clearKeys(); if (state.phase === 'game') toast('Connection lost. Trying to reconnect…'); });
  socket.on('error:message', message => { if (state.phase === 'home') showError(message); else toast(message); });
  socket.on('room:joined', room => { state.localId = socket.id; state.room = room; state.ready = room.players.find(p => p.id === socket.id)?.ready || false; renderLobby(room); showScreen('lobby'); });
  socket.on('room:update', room => { state.room = room; renderLobby(room); if (room.phase === 'over' && state.phase === 'game') {} });
  socket.on('room:returned', room => {
    state.room = room; state.snapshots.length = 0;
    state.mapNodes.forEach(node => node.remove()); state.mapNodes.clear();
    state.tanks.forEach(node => node.remove()); state.tanks.clear();
    state.bullets.forEach(bullet => bullet.node.remove()); state.bullets = [];
    renderLobby(room); showScreen('lobby');
  });

  function renderLobby(room) {
    // Rebuild the small roster when room state changes; the host can start only when ready.
    elements.lobbyCode.textContent = room.code;
    $('#game-room-code').textContent = room.code;
    elements.rosterCount.textContent = `${room.players.length} / 4`;
    elements.lobbyPlayers.replaceChildren();
    room.players.forEach((player, index) => {
      const row = document.createElement('div'); row.className = 'player-row';
      const swatch = document.createElement('span'); swatch.className = 'player-swatch'; swatch.style.color = player.color || colors[index];
      const name = document.createElement('span'); name.className = 'player-name'; name.textContent = player.name + (player.id === socket.id ? ' (you)' : '');
      const meta = document.createElement('span'); meta.className = 'player-meta'; meta.textContent = player.isBot ? 'CPU' : player.host ? 'HOST' : 'PILOT';
      const ready = document.createElement('span'); ready.className = `ready-tag ${player.ready ? '' : 'wait'}`; ready.textContent = player.ready ? 'READY' : 'WAITING';
      row.append(swatch, name, meta, ready); elements.lobbyPlayers.append(row);
    });
    const me = room.players.find(player => player.id === socket.id);
    state.ready = me?.ready || false;
    elements.ready.classList.toggle('hidden', !me || room.phase !== 'lobby');
    elements.ready.innerHTML = state.ready ? 'Ready — waiting <span>✓</span>' : 'I’m ready <span>✓</span>';
    const isHost = me?.host;
    elements.start.classList.toggle('hidden', !isHost || room.phase !== 'lobby');
    elements.start.disabled = room.players.length < 2 || room.players.some(player => !player.ready);
    elements.hostNote.textContent = isHost ? (elements.start.disabled ? 'Need at least two pilots, with everyone ready.' : 'Crew ready. You can launch the match.') : 'The host starts when the crew is ready.';
    elements.lobbyHint.textContent = room.players.length < 2 ? 'Waiting for another pilot to join.' : `${room.players.length} pilots in the staging area.`;
  }
  elements.ready.addEventListener('click', () => { state.ready = !state.ready; socket.emit('player:ready', state.ready); });
  elements.start.addEventListener('click', () => socket.emit('game:start'));
  $('#leave-room').addEventListener('click', () => { socket.emit('game:quit'); state.room = null; showScreen('home'); });
  $('#copy-link').addEventListener('click', async () => {
    const url = new URL(location.href); url.searchParams.set('room', elements.lobbyCode.textContent);
    try { await navigator.clipboard.writeText(url.toString()); toast('Invite link copied.'); }
    catch { toast(`Share room code ${elements.lobbyCode.textContent}`); }
  });
  const roomFromUrl = new URLSearchParams(location.search).get('room');
  if (roomFromUrl) elements.roomCode.value = roomFromUrl.toUpperCase().slice(0, 4);

  function makeTile(tile) {
    // Each map tile gets one DOM node. The render loop moves tanks, not the whole battlefield.
    const node = document.createElement('div');
    node.className = `tile ${tile.kind === 'b' ? 'brick' : tile.kind === 's' ? 'steel' : 'bush'}`;
    node.style.transform = `translate3d(${tile.x * 100}%, ${tile.y * 100}%, 0)`;
    node.dataset.key = `${tile.x}:${tile.y}`;
    arena.append(node); state.mapNodes.set(node.dataset.key, node);
  }
  function buildMap(map) {
    state.mapNodes.forEach(node => node.remove()); state.mapNodes.clear();
    map.forEach(row => row.forEach(tile => { if (tile) makeTile(tile); }));
  }
  function makeTank(player) {
    // Tank art is assembled from ordinary HTML elements styled in style.css (no Canvas or sprites).
    const node = document.createElement('div'); node.className = 'tank'; node.dataset.id = player.id; node.style.setProperty('--tank', player.color);
    const leftTrack = document.createElement('i'); leftTrack.className = 'tank-track left';
    const rightTrack = document.createElement('i'); rightTrack.className = 'tank-track right';
    const body = document.createElement('i'); body.className = 'tank-body';
    const turret = document.createElement('i'); turret.className = 'tank-turret';
    const label = document.createElement('span'); label.className = 'tank-label'; label.textContent = player.name;
    node.append(leftTrack, rightTrack, body, turret, label); arena.append(node); state.tanks.set(player.id, node); return node;
  }
  function ensureTanks(players) {
    players.forEach(player => {
      const node = state.tanks.get(player.id) || makeTank(player);
      if (node.style.getPropertyValue('--tank') !== player.color) node.style.setProperty('--tank', player.color);
      const label = node.querySelector('.tank-label');
      if (label.textContent !== player.name) label.textContent = player.name;
    });
    for (const [id, node] of state.tanks) if (!players.some(player => player.id === id)) { node.remove(); state.tanks.delete(id); }
  }
  function buildGame(payload) {
    // Create the arena nodes once when a new match starts, then reuse them for later snapshots.
    state.snapshots.length = 0; state.bullets.forEach(b => b.node.remove()); state.bullets = [];
    state.tanks.forEach(node => node.remove()); state.tanks.clear();
    state.scoreSignature = '';
    buildMap(payload.map); ensureTanks(payload.players); renderScore(payload.players); updateTimer(payload.remainingMs);
    elements.pauseShade.classList.add('hidden'); showScreen('game'); beep('start');
  }
  socket.on('game:start', buildGame);
  socket.on('game:state', snapshot => {
    state.snapshots.push({ data: snapshot, at: performance.now() });
    if (state.snapshots.length > 8) state.snapshots.shift();
    ensureTanks(snapshot.players); renderScore(snapshot.players); updateTimer(snapshot.remainingMs);
    if (snapshot.paused) elements.pauseShade.classList.remove('hidden'); else elements.pauseShade.classList.add('hidden');
  });
  socket.on('tile:destroyed', ({ x, y }) => { const node = state.mapNodes.get(`${x}:${y}`); if (node) { node.remove(); state.mapNodes.delete(`${x}:${y}`); } });
  socket.on('explosion', event => makeExplosion(event.x, event.y));
  socket.on('game:paused', ({ paused, by }) => { elements.pauseShade.classList.toggle('hidden', !paused); elements.pauseCopy.textContent = paused ? `${by} called a hold.` : `${by} resumed the fight.`; $('#pause-toggle').innerHTML = paused ? 'Resume game <span>↗</span>' : 'Pause game <span>Ⅱ</span>'; });
  socket.on('game:over', result => showGameOver(result));
  socket.on('notice', ({ message }) => toast(message));
  socket.on('sound', ({ type }) => beep(type));

  // The scoreboard changes only when a player's name, score, lives, color, or status changes.
  function renderScore(players) {
    const signature = players.map(p => `${p.id}:${p.name}:${p.color}:${p.kills}:${p.lives}:${p.eliminated}`).join('|');
    if (signature === state.scoreSignature) return;
    state.scoreSignature = signature;
    elements.score.replaceChildren();
    players.forEach(player => {
      const row = document.createElement('div'); row.className = `score-row ${player.eliminated ? 'eliminated' : ''}`;
      const dot = document.createElement('span'); dot.className = 'score-dot'; dot.style.background = player.color;
      const name = document.createElement('span'); name.className = 'score-name'; name.textContent = player.name;
      const kills = document.createElement('span'); kills.className = 'score-stats';
      const lives = Math.max(0, player.lives);
      kills.innerHTML = `<span class="lives">${'▰'.repeat(lives)}${'▱'.repeat(3 - lives)}</span> &nbsp; ${player.kills} KILLS · ${player.eliminated ? 'ELIMINATED' : 'ALIVE'}`;
      row.append(dot, name, kills); elements.score.append(row);
    });
  }
  function updateTimer(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const text = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    if (text !== state.lastTimerText) { elements.timer.textContent = text; state.lastTimerText = text; }
  }
  function renderBullets(list) {
    // Reuse bullet nodes where possible; hide extras instead of creating DOM on every frame.
    while (state.bullets.length < list.length) {
      const node = document.createElement('i'); node.className = 'bullet'; arena.append(node); state.bullets.push({ node, data: null });
    }
    state.bullets.forEach((bullet, i) => {
      const data = list[i]; bullet.data = data;
      bullet.node.classList.toggle('hidden', !data);
      if (data) positionNode(bullet.node, data.x, data.y, 640, 480);
    });
  }
  function positionNode(node, x, y, width, height) {
    // Convert the server's 640-by-480 logical coordinates to the arena's current screen size.
    const scaleX = arena.clientWidth / width, scaleY = arena.clientHeight / height;
    node.style.transform = `translate3d(${x * scaleX}px, ${y * scaleY}px, 0)`;
  }
  function frame(now) {
    // One animation loop interpolates recent server snapshots and updates CSS transforms.
    state.raf = requestAnimationFrame(frame);
    if (state.phase !== 'game') return;
    const snapshot = interpolate(now);
    if (!snapshot) return;
    const rectW = arena.clientWidth, rectH = arena.clientHeight;
    const playerList = snapshot.players || [];
    playerList.forEach(player => {
      const node = state.tanks.get(player.id); if (!node) return;
      node.className = `tank ${player.dir} ${player.invulnerable ? 'invulnerable' : ''} ${player.eliminated || player.respawning ? 'hidden' : ''}`;
      node.style.setProperty('--tank', player.color);
      positionNode(node, player.x, player.y, 640, 480);
    });
    renderBullets(snapshot.bullets || []);
    if (state.debugFps) updateFps(now);
    if (now - state.lastInputAt > 32 && socket.connected && !snapshot.paused) { socket.emit('game:input', state.keys); state.lastInputAt = now; }
    if (rectW === 0 || rectH === 0) return;
  }
  function interpolate(now) {
    // Draw about 90ms behind live time so two server snapshots can be blended smoothly.
    const list = state.snapshots; if (!list.length) return null;
    if (list.length === 1) return list[0].data;
    const target = now - 90;
    let a = list[0], b = list[list.length - 1];
    for (let i = 0; i < list.length - 1; i++) if (list[i].at <= target && target <= list[i + 1].at) { a = list[i]; b = list[i + 1]; break; }
    const t = Math.max(0, Math.min(1, (target - a.at) / Math.max(1, b.at - a.at)));
    const oldPlayers = new Map(a.data.players.map(player => [player.id, player]));
    return {
      ...b.data,
      players: b.data.players.map(player => {
        const old = oldPlayers.get(player.id); if (!old) return player;
        return { ...player, x: old.x + (player.x - old.x) * t, y: old.y + (player.y - old.y) * t };
      })
    };
  }
  let fpsFrames = 0, fpsStart = 0;
  function updateFps(now) { if (!fpsStart) fpsStart = now; fpsFrames++; if (now - fpsStart >= 1000) { elements.fps.textContent = `FPS ${Math.round(fpsFrames * 1000 / (now - fpsStart))}`; fpsStart = now; fpsFrames = 0; } }
  function makeExplosion(x, y) {
    // The wrapper keeps the hit location fixed while its inner CSS effect scales outward.
    const node = document.createElement('i'); node.className = 'explosion'; arena.append(node); positionNode(node, x, y, 640, 480); setTimeout(() => node.remove(), 450);
  }

  // Keyboard state is held between keydown/keyup events and sent as input, not as coordinates.
  function focusedInput() { const tag = document.activeElement?.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable; }
  const keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'shoot' };
  window.addEventListener('keydown', event => {
    if (focusedInput()) return;
    if ((event.key === 'Escape' || event.key === 'Esc' || event.code === 'Escape') && state.phase === 'game') { event.preventDefault(); setMenu(elements.menu.classList.contains('hidden')); return; }
    const key = keyMap[event.code]; if (!key || state.phase !== 'game') return;
    event.preventDefault(); state.keys[key] = true;
  });
  window.addEventListener('keyup', event => { const key = keyMap[event.code]; if (key) state.keys[key] = false; });
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
  function clearKeys() {
    // Clear held keys when focus changes so a missed keyup cannot leave a tank moving.
    Object.keys(state.keys).forEach(key => state.keys[key] = false);
    if (socket.connected) socket.emit('game:input', state.keys);
  }
  function setMenu(open) { elements.menu.classList.toggle('hidden', !open); if (open) clearKeys(); }
  $('#menu-open').addEventListener('click', () => setMenu(true)); $('#menu-close').addEventListener('click', () => setMenu(false));
  $('#pause-toggle').addEventListener('click', () => socket.emit('game:pause'));
  $('#pause-resume').addEventListener('click', () => socket.emit('game:pause'));
  $('#quit-game').addEventListener('click', () => { socket.emit('game:quit'); setMenu(false); state.room = null; clearKeys(); showScreen('home'); toast('You left the match.'); });
  $('#return-lobby').addEventListener('click', () => socket.emit(state.room?.solo ? 'solo:restart' : 'game:return-lobby'));

  function showGameOver(result) {
    // The server supplies the winner and final scores; this function only formats the result screen.
    state.snapshots.length = 0; clearKeys(); setMenu(false); beep(result.winners.some(w => w.id === socket.id) ? 'win' : 'loss');
    if (!result.winners.length) elements.winnerLine.textContent = 'No winner this round';
    else if (result.winners.length > 1) elements.winnerLine.textContent = `Tied winners: ${result.winners.map(w => w.name).join(' · ')}`;
    else elements.winnerLine.textContent = `${result.winners[0].name} takes the field`;
    elements.finalBoard.replaceChildren();
    [...result.scores].sort((a, b) => b.kills - a.kills || b.lives - a.lives).forEach(player => {
      const row = document.createElement('div'); row.className = 'final-row';
      const dot = document.createElement('i'); dot.className = 'score-dot'; dot.style.background = player.color;
      const name = document.createElement('b'); name.textContent = player.name;
      const kills = document.createElement('span'); kills.textContent = `${player.kills} KILLS`;
      const lives = document.createElement('span'); lives.textContent = `${Math.max(0, player.lives)} LIVES`;
      row.append(dot, name, kills, lives); elements.finalBoard.append(row);
    });
    const me = state.room?.players.find(p => p.id === socket.id); const host = me?.host;
    $('#return-lobby').classList.toggle('hidden', !host);
    $('#return-lobby').textContent = state.room?.solo ? 'Play solo again ↗' : 'Return to lobby ↗';
    elements.returnNote.textContent = !host ? 'Waiting for the host to return everyone to the lobby.' : state.room?.solo ? 'Run it back against three CPU pilots.' : 'The host can reset the room for another round.';
    showScreen('over');
  }

  // Web Audio is created after user interaction to satisfy browser autoplay restrictions.
  const soundButton = $('#sound-toggle');
  soundButton.addEventListener('click', () => {
    state.muted = !state.muted;
    soundButton.innerHTML = `${state.muted ? '♫̸' : '♫'} <span>Sound ${state.muted ? 'off' : 'on'}</span>`;
    soundButton.setAttribute('aria-label', state.muted ? 'Unmute sound' : 'Mute sound');
    if (!state.muted) getAudio();
  });
  document.addEventListener('pointerdown', () => { if (!state.muted) getAudio(); }, { once: true });
  function getAudio() { if (!state.audio) { const AudioContext = window.AudioContext || window.webkitAudioContext; if (AudioContext) state.audio = new AudioContext(); } if (state.audio?.state === 'suspended') state.audio.resume(); return state.audio; }
  function beep(type) {
    if (state.muted) return;
    const audio = getAudio(); if (!audio) return;
    const spec = { shoot: [440, .045, 'square', .035], impact: [190, .07, 'triangle', .05], hit: [120, .12, 'sawtooth', .045], destroy: [75, .24, 'sawtooth', .06], start: [540, .18, 'square', .035], win: [700, .3, 'triangle', .05], loss: [170, .32, 'triangle', .04] }[type];
    if (!spec) return;
    const [frequency, duration, wave, volume] = spec; const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    if (type === 'start' || type === 'win') oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.65, audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  }
})();
