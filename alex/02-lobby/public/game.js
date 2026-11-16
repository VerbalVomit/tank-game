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
  socket.on('disconnect', () => { elements.connection.textContent = 'Reconnecting'; elements.connection.previousElementSibling.classList.remove('online'); });
  socket.on('error:message', message => { if (state.phase === 'home') showError(message); else toast(message); });
  socket.on('room:joined', room => { state.localId = socket.id; state.room = room; state.ready = room.players.find(p => p.id === socket.id)?.ready || false; renderLobby(room); showScreen('lobby'); });
  socket.on('room:update', room => { state.room = room; renderLobby(room); if (room.phase === 'over' && state.phase === 'game') {} });
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
    elements.start.classList.add('hidden');
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

  $('#solo-game').classList.add('hidden');
  $('#sound-toggle').classList.add('hidden');
  elements.start.classList.add('hidden');
})();
