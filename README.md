# TANK GAME — multiplayer tank arena

A browser tank battle for solo play against three CPU pilots or online matches with 2–4 people. The server owns movement, bullets, collisions, lives, kills, pause state, and the three-minute timer. The client renders the arena with HTML elements and CSS; there is no Canvas, WebGL, game engine, database, or account system.

## Run locally

Requirements: Node.js 18 or newer.

```sh
npm install
npm start
```

Open <http://localhost:3000>. Choose **Play solo** to start immediately against three CPU pilots, or create/join a room for multiplayer. In multiplayer, the host starts once at least two players are ready. For a second computer on the same network, open the host computer's LAN address on port 3000.

Run the automated local acceptance suite with `npm test`. It starts an isolated server and checks four-player rooms, duplicate names, ready gating, movement and tank collisions, brick damage, score integrity, hits and respawns, pause timer behavior, quitting, disconnects, host room reset, and rematch timer reset. Three winner-selection tests check the kill/lives tie-break rules.

## Controls and rules

- **WASD** or **arrow keys** move; **Space** fires; **Escape** opens the shared pause menu.
- Select **Play solo** to fight three CPU-controlled tanks without another person.
- Tanks move in four directions, collide with other tanks and solid walls, and cannot leave the arena.
- Orange brick walls are destroyed by a hit. Grey steel walls stop bullets. Green bushes are decorative.
- Each pilot has three lives. A hit removes one life; pilots with lives left respawn after a short delay with temporary invulnerability.
- The last living pilot wins. At 03:00, the most kills wins; remaining lives break ties, and a final tie shares the win.
- Any pilot can pause or resume for everyone. The room host returns the room to the lobby after the result.

## Project files

```text
tank-game/
├── package.json
├── server.js             # Express, Socket.IO, room state and fixed-tick simulation
├── game-rules.js         # Winner selection and time-limit tie-breaks
├── render.yaml           # Render web service, health check, and manual deploy gate
├── TEAM-PLAN.md          # Suggested division for Matis, Alex and Tanel
├── REVIEW-DEFENSE.md     # Student review talking points and demo guide
├── public/
│   ├── index.html        # Four screens and static interface structure
│   ├── style.css         # Responsive layout, CSS tanks, walls and effects
│   └── game.js           # DOM renderer, input, interpolation, UI and Web Audio
├── test/
│   ├── acceptance.test.js
│   └── game-rules.test.js
└── README.md
```

## How the pieces work

### DOM rendering and animation

The HTML screen structure is created once. When a match starts, the client creates one DOM node for each map tile and tank. It keeps those nodes and updates tank positions with CSS `transform: translate3d(...)` inside one `requestAnimationFrame()` loop. Score rows are rebuilt only when scores or lives change. Server snapshots arrive 30 times per second; the browser interpolates between recent positions so motion is smoother than the network update rate. Add `?debug=1` to show the approximate client FPS.

### Multiplayer and game rules

Socket.IO serves the page and carries events over the same public origin. The client sends held-key state, not positions or scores. A fixed server tick validates movement against the walls and tanks, advances bullets, destroys bricks, applies hits, and checks the match end conditions. Every client receives the same authoritative snapshot. In solo mode, the server chooses movement and firing inputs for three CPU pilots. Room state is held in server memory, so a server restart ends active rooms; there are no accounts or persistent matches.

### Collision detection

Tank movement is broken into small steps to avoid passing through thin walls during a tick. The server checks the tank's 24×24-pixel box against arena bounds, solid map tiles, and other living tanks. Bullets also advance in small steps, checking each tile and enemy tank along their path. Bricks are removed from the room map after a hit; steel remains solid.

### Sound

Short tones are synthesized with the Web Audio API after a player interacts with the page. The sound button mutes or unmutes the effects.

## Internet deployment (Render Blueprint)

The project includes a [Render Blueprint](render.yaml) for one Frankfurt Node web service. It uses the free plan, `npm ci`, `npm start`, and `/health` checks. Automatic deploys are off so a later commit cannot promote itself without a manual release decision. The server uses `process.env.PORT`, binds to `0.0.0.0`, and Socket.IO follows the browser's origin for HTTPS/WSS. Render supports WebSocket connections on web services; see [Render WebSockets](https://render.com/docs/websocket), [Blueprints](https://render.com/docs/blueprint-spec), and [free instance limits](https://render.com/docs/free).

1. The source is in the team's private GitHub repository, `VerbalVomit/tank-game`.
2. In Render, choose **New → Blueprint** and select that repository. Render reads `render.yaml` and proposes the service settings above.
3. Review the service plan and configuration, then create and deploy the Blueprint.
4. Open the generated HTTPS URL; Socket.IO upgrades over WSS automatically. Create a room and share the URL or four-character room code.
5. Test two players from separate internet connections before using it for the class demonstration.

Use one service instance for this student build: rooms are in memory, and multiple instances would not share room state. A restart ends current matches. Free Render services can spin down after 15 minutes without inbound traffic and may restart, so the first page load can take about a minute; active WebSocket traffic prevents idle spin-down. No cost is incurred by the free compute plan, but Render's usage limits still apply.

## Project review and references

The implementation follows the assignment's DOM-only and beginner-friendly constraints. Studying `Snake-multi-player` confirmed that Socket.IO rooms, authoritative server updates, held-key input, a single `requestAnimationFrame()` loop, and smoothed DOM movement fit this assignment. The `bomberman-dom` project demonstrates a useful snapshot buffer and explicit message validation, but it uses raw WebSockets and a separate mini-framework. This project keeps the simpler Socket.IO protocol and validates each action in its own handlers. The current renderer already keeps a short snapshot buffer and interpolates between positions. Both repositories were used as learning references; no source code or assets were copied. The Snake repository has no license file, while `bomberman-dom` is MIT-licensed. Tank shapes and the map are drawn with CSS and code rather than sprite assets.

- [Snake-multi-player](https://github.com/codewithravikant/Snake-multi-player)
- [bomberman-dom](https://github.com/Alasmawi/bomberman-dom) — MIT license
- [Tank-Game](https://github.com/gblackiv/Tank-Game) — visual/gameplay reference

## Verification record

**Verified locally:** `npm test` passes the four-player networking flow and winner-selection checks. The run covers nickname uniqueness, full rooms, ready gating, server authority, map dimensions, wall and tank collisions, brick destruction, hits and respawns, paused timer behavior, quit/disconnect results, removal of departed players, and rematch timer reset. A live 180-second server timer run ended with a two-way tie. A separate two-client check compared 73 consecutive timer snapshots; both clients received identical remaining-time values in each snapshot. Two browser tabs on this computer confirmed room join/readiness, match start, both tanks visible, movement reflected in the other tab, Escape menu, and synchronized pause/resume. A solo smoke check started one player with three CPU pilots; the match timer and lives/kills updated from server snapshots. The sound toggle's accessible label was checked in the browser. The optional FPS counter showed 60 FPS in one local sample on this machine; this does not prove sustained 60 FPS. The source check confirms DOM rendering, `requestAnimationFrame()`, and CSS transforms with no Canvas element.

**Still to verify:** join and play from two separate computers over the public internet; confirm audible Web Audio effects and mute behavior; record a Chrome DevTools Performance trace with long-task/frame-drop review; and have an independent QC pass capture the required screenshots. No public deployment has been created, and 60 FPS is a target rather than a guarantee.
