# TANK GAME team plan

The work is split among three students and delivered in small phases. Each phase has one clear owner, a short handoff, and a check before it reaches `main`. Keep `main` runnable throughout the project.

## Who owns what

| Student | Main responsibility | Files they own |
|---|---|---|
| **Matis — integration and project review** | Keep the requirements, phase checklist, and README current. Integrate work, check each handoff, collect acceptance evidence, and make the final release decision. | `TEAM-PLAN.md`, `README.md`, `game-rules.js`, `test/` |
| **Alex — browser game** | Build the screens, controls, DOM-only game view, animation, responsive styling, and sound controls. | `public/index.html`, `public/style.css`, `public/game.js` |
| **Tanel — multiplayer server** | Build the rooms and lobby rules, authoritative simulation, match flow, and server-side validation. | `server.js` |

`package.json` and `package-lock.json` are shared setup files. Matis coordinates changes to them so two branches do not overwrite dependency updates. The server and browser agree on Socket.IO events and payloads; Tanel documents a protocol change before Alex integrates it.

## Safe upload and merge routine

1. Start from the latest `main` and create a branch for one phase, for example `alex/phase-02-dom-arena` or `tanel/phase-03-rooms`.
2. Work only on the files listed for that phase. Upload or commit complete files, not half-finished replacements. Keep each commit about one change.
3. Run the phase check below. For changes to the server or game rules, also run `npm test` and fix failures before handoff.
4. Open a pull request into `main` and include: what changed, files touched, checks run, and anything still incomplete. Do not upload unfinished work directly to `main`.
5. Matis reviews the change and checks the handoff. Merge it only when the phase check passes. The next phase starts from the updated `main`.
6. If work breaks a check, fix it on that same branch before merging. Do not stack new phases on top of a broken `main`.

Only the owner of a file edits it during a phase. When a feature needs both server and browser work, Tanel first agrees and documents the event contract; Alex then integrates against that contract. Matis checks the integrated result without silently changing another student's files.

The person implementing a fix does not edit that fix's acceptance test. Matis owns the acceptance checks and asks another student to confirm visible behavior.

## Phases and handoffs

| Phase | Owner(s) | Piece to upload | Done when |
|---|---|---|---|
| **0. Baseline and plan** | Matis | This phase plan, agreed file ownership, and a short checklist of the existing game behavior. | Everyone can install and run the current project; `npm test` passes; the current `main` is recorded as the known-good starting point. |
| **1. Screens and arena shell** | Alex | Main menu, lobby, gameplay, and game-over page structure plus responsive visual shell in `public/index.html` and `public/style.css`. | All four screens can be opened, controls and labels are readable, and no Canvas or game engine is introduced. |
| **2. DOM arena and local controls** | Alex | Map and tank DOM rendering, keyboard input, and one `requestAnimationFrame()` loop in `public/game.js`. | A local tank moves smoothly; DOM nodes are reused; walls and boundaries display correctly; the arena uses no Canvas. |
| **3. Server and room foundation** | Tanel | Express/Socket.IO setup, health route, room creation/joining, unique names, lobby state, readiness, and host start rules in `server.js`. | Server starts on the configured port; two browser clients can join one room; duplicate names and full rooms are rejected. |
| **4. Lobby connection** | Tanel, then Alex | Tanel publishes the lobby event names and payload examples; Alex connects the screens, room code, player list, ready button, and host start control. | Two clients see the same lobby and can start only when the host and at least two players are ready. |
| **5. Multiplayer movement** | Tanel, then Alex | Tanel validates held-key input and sends authoritative snapshots; Alex sends input and interpolates snapshots. | Two separate browser windows see both tanks move together; the client cannot submit its own position or score. |
| **6A. Bullets and walls** | Tanel, then Alex | Tanel adds bullet movement, wall/tank collision, brick damage, and steel blocking; Alex adds visible bullets and wall updates. | Bullets stop at boundaries and steel; bricks disappear after hits; both clients see the same map. |
| **6B. Lives and scoring** | Tanel, then Alex; Matis reviews | Tanel adds hits, lives, respawns, eliminations, invulnerability, and server-owned scores; Alex updates tank effects and scoreboard. | Hits, respawns, and scores agree in both clients; `npm test` passes. |
| **7A. Timer and winner** | Tanel, then Alex; Matis reviews | Tanel adds the synchronized timer and winner/tie rules; Alex adds the timer and game-over screen. | Both clients see the same countdown and winner; `npm test` passes. |
| **7B. Pause, quit, and rematch** | Tanel, then Alex; Matis reviews | Tanel adds shared pause/resume, quit, disconnect, and rematch state; Alex adds menu actions and status notifications. | Pause stops simulation for everyone; quit/disconnect and rematch work; `npm test` passes. |
| **8A. Sound controls** | Alex; Matis checks | Web Audio effects and mute control. | Sound starts after user interaction and mute works in a browser check. |
| **8B. Performance review** | Alex; Matis checks | Optional FPS indicator and focused rendering improvements. | Browser check confirms DOM-only rendering and no duplicate animation loops. Record FPS evidence without claiming a guaranteed 60 FPS. |
| **9. Internet demo preparation** | Matis coordinates; Alex and Tanel fix assigned issues | Deployment instructions and final fixes in their owned files. | After release review, two students on separate internet connections join and play; README evidence and remaining limits are recorded. |

### Keep phases small

- A phase can be split into smaller pull requests if its files or checks are not ready together. Keep the phase number and add a short suffix, such as `phase-06a-bullets` and `phase-06b-lives`.
- Do not change server event names and browser listeners in the same unannounced upload. Publish the server contract first, then integrate the browser.
- Do not mix formatting-only rewrites with gameplay changes. Small diffs are easier to review and safer to merge.
- If a phase check fails, stop there, describe the failure in the pull request, and repair it before starting dependent work.

## Shared technical rules

- Arena coordinates use a 640×480 logical map.
- Socket.IO events and payloads are agreed by Tanel and Alex before a protocol change is integrated.
- The server owns player positions, bullets, collisions, wall damage, lives, scores, timer, and match state. Clients send input and actions only.
- Use HTML elements and CSS for visuals. Canvas, WebGL, Phaser, PixiJS, React, and other game engines are prohibited by the assignment.
- Keep the implementation small enough for each student to explain during the project review.
