# TANK GAME review defense

Use this as a study guide, not a script to memorize. Each student should explain the parts they actually worked on and be ready to point to the code. The team plan assigns file ownership; the shared GitHub account does not prove which person wrote each individual change.

## Matis — integration, game rules, and review

### Short explanation

> My role is to keep the assignment and the implementation aligned. I organize the phase plan and README, review handoffs, and keep the winner rules and acceptance checks understandable. The winner-selection function is on the server side: when only one pilot remains, eliminated players are excluded; when time runs out, kills are compared first and remaining lives break ties. If both values tie, the game reports every tied winner.

### Be ready to show

- `TEAM-PLAN.md`: file ownership, phases, and handoff checks.
- `README.md`: setup, controls, architecture, deployment notes, and known limits.
- `game-rules.js`: the pure winner-selection function.
- `test/`: automated checks for server flows and winner rules.

### Questions to practice

- **Why keep winner selection in its own file?** It keeps the rule short and lets tests check it without starting a browser or server.
- **What breaks a tie?** Kills are compared first, then lives; a remaining tie is shared.
- **What does “server authoritative” mean?** The browser sends input, while the server decides positions, hits, score, timer, and results.

## Alex — browser game and rendering

### Short explanation

> I own the browser-facing game: the four screens, keyboard controls, CSS tank and map visuals, scoreboard, timer, and sound toggle. The client creates DOM nodes for the map and tanks when a match starts, then reuses them. One `requestAnimationFrame()` loop draws server updates. It interpolates between recent snapshots and moves tanks with CSS transforms so remote movement looks smoother than the network updates.

### Be ready to show

- `public/index.html`: home, lobby, match, and result screens.
- `public/style.css`: responsive layout and CSS-built tanks, tiles, bullets, and effects.
- `public/game.js`: Socket.IO listeners, held-key input, DOM rendering, interpolation, and Web Audio.

### Questions to practice

- **Why use ordinary DOM and CSS?** The assignment prohibits Canvas and game engines; these visuals are simple enough to build from HTML elements and CSS.
- **Why use `keydown` and `keyup`?** The client remembers which keys remain held, so movement and shooting continue smoothly without relying on repeated keydown events.
- **Why interpolate?** The server sends snapshots about 30 times per second; blending nearby positions reduces visible stepping between updates.
- **Can the browser set its own score or position?** No. It sends input only; the server sends back the accepted game state.

## Tanel — multiplayer server and simulation

### Short explanation

> I own the Node.js and Socket.IO server. It creates rooms, checks nicknames and room limits, tracks readiness, and allows the host to start. During a match, a fixed server tick applies input, movement, collision checks, bullets, wall damage, lives, and timer updates. The server broadcasts room and match state so every browser sees the same result. The separate solo action adds three CPU pilots when a player chooses Play solo; multiplayer create and join still use human players.

### Be ready to show

- `server.js`: room state, Socket.IO events, collision helpers, simulation tick, and disconnect handling.
- `game-rules.js`: winner selection called when a round ends.
- The browser event flow: `room:create` / `room:join`, `player:ready`, `game:start`, then repeated `game:input` and `game:state` updates.

### Questions to practice

- **How do you prevent two players from taking the same nickname?** The server checks the normalized nickname against the room roster before adding the player.
- **How are walls and tanks checked?** The server tests the tank's 24-pixel square against arena bounds, solid tiles, and other living tanks.
- **Why split movement and bullets into small steps?** A large update could jump over a narrow wall or tank between ticks.
- **How do CPU pilots find a route?** In solo mode, a breadth-first search explores adjacent grid cells around solid tiles and chooses a direction toward the human player.

## Demo and honest limits

1. Start the app with `npm start` and open it in two browser windows.
2. Demonstrate **Play solo** and show that three CPU pilots join only that match.
3. Return to the home screen. Create a room in one window and join it from the other with its room code; use different nicknames and show readiness before the host starts.
4. Explain that the server owns the shared game state while each browser renders it.
5. Be clear about what has not been demonstrated: play between separate computers over the public internet, a performance trace under load, and an independent quality review are still listed as outstanding in the README. The target of 60 FPS is not a guarantee.

The original assignment requires 2–4 human players and does not require CPU opponents. Solo play is an extra mode; it does not replace the multiplayer room flow.
