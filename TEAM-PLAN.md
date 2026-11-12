# Battle City team plan

The work is split among three students and delivered in small phases. Each phase has one clear owner, a handoff, and a check before it reaches main. Keep main runnable throughout the project.

## Who owns what

| Student | Main responsibility | Files they own |
|---|---|---|
| **Matis — integration and project review** | Keep requirements, phase checklist, and README current. Integrate work, check handoffs, collect acceptance evidence, and make the release decision. | TEAM-PLAN.md, README.md, game-rules.js, test/ |
| **Alex — browser game** | Build the screens, controls, DOM-only game view, animation, responsive styling, and sound controls. | public/index.html, public/style.css, public/game.js |
| **Tanel — multiplayer server** | Build rooms and lobby rules, authoritative simulation, match flow, and server-side validation. | server.js |

package.json and package-lock.json are shared setup files. Matis coordinates changes to them so branches do not overwrite dependency updates. The server and browser agree on Socket.IO events and payloads; Tanel documents a protocol change before Alex integrates it.

## Safe upload and merge routine

1. Start from the latest main and create a branch for one phase, for example alex/phase-02-dom-arena or tanel/phase-03-rooms.
2. Work only on the files listed for that phase. Upload or commit complete files, not half-finished replacements. Keep each commit about one change.
3. Run the phase check below. For server or game-rule changes, also run npm test and fix failures before handoff.
4. Open a pull request into main. Include what changed, files touched, checks run, and anything incomplete. Do not upload unfinished work directly to main.
5. Matis reviews the change and checks the handoff. Merge it only when the phase check passes. The next phase starts from updated main.
6. If a check fails, fix it on that same branch before merging. Do not stack new phases on top of a broken main.

Only the owner of a file edits it during a phase. When a feature needs both server and browser work, Tanel first agrees and documents the event contract; Alex then integrates against it. Matis checks the result without silently changing another student's files.

## Phases and handoffs

| Phase | Owner(s) | Piece to upload | Done when |
|---|---|---|---|
| **0. Baseline and plan** | Matis | This phase plan, agreed file ownership, and checklist of existing behavior. | Everyone can install and run the project; npm test passes; current main is the known-good starting point. |
| **1. Screens and arena shell** | Alex | Main menu, lobby, gameplay, and game-over page structure plus responsive visual shell in public/index.html and public/style.css. | All four screens open; labels are readable; no Canvas or game engine is introduced. |
| **2. DOM arena and local controls** | Alex | Map and tank DOM rendering, keyboard input, and one requestAnimationFrame loop in public/game.js. | A local tank moves smoothly; DOM nodes are reused; walls and boundaries display; no Canvas is used. |
| **3. Server and room foundation** | Tanel | Express/Socket.IO setup, health route, room creation/joining, unique names, lobby state, readiness, and host start rules in server.js. | Server starts on the configured port; two browser clients can join one room; duplicate names and full rooms are rejected. |
| **4. Lobby connection** | Tanel, then Alex | Tanel publishes lobby event names and payload examples; Alex connects the screens, room code, player list, ready button, and host start control. | Two clients see the same lobby; only the host can start when at least two players are ready. |
| **5. Multiplayer movement** | Tanel, then Alex | Tanel validates held-key input and sends authoritative snapshots; Alex sends input and interpolates snapshots. | Two browser windows see both tanks move together; the client cannot submit its own position or score. |
| **6. Combat and scoring** | Tanel, then Alex; Matis reviews | Tanel adds bullets, collisions, brick damage, lives, respawns, eliminations, and server-owned scores; Alex adds visible bullets, effects, and scoreboard updates. | Shooting, walls, damage, respawns, and scores agree in both clients; npm test passes. |
| **7. Match flow** | Tanel, then Alex; Matis reviews | Tanel adds synchronized timer, winner rules, pause/resume, quit, disconnect, and rematch state; Alex adds timer, menu, notifications, and game-over UI. | Both clients see the same timer and match state; pause stops simulation; quit/disconnect and rematch work; npm test passes. |
| **8. Sound and performance pass** | Alex; Matis checks | Web Audio effects, mute control, optional FPS indicator, and focused rendering improvements. | Sound starts after interaction and mute works; browser check confirms DOM-only rendering and no duplicate animation loops. Record FPS evidence without claiming a guaranteed 60 FPS. |
| **9. Internet demo preparation** | Matis coordinates; Alex and Tanel fix assigned issues | Deployment instructions and final fixes in their owned files. | After review, two students on separate internet connections join and play; README evidence and remaining limits are recorded. |

## Keep phases small

- Split a phase into smaller pull requests if files or checks are not ready together. Keep the phase number and add a suffix, such as phase-06a-bullets and phase-06b-lives.
- Do not change server event names and browser listeners in the same unannounced upload. Publish the server contract first, then integrate the browser.
- Do not mix formatting-only rewrites with gameplay changes. Small diffs are easier to review and safer to merge.
- If a phase check fails, stop, describe the failure in the pull request, and repair it before starting dependent work.

## Shared technical rules

- Arena coordinates use a 640×480 logical map.
- Socket.IO events and payloads are agreed by Tanel and Alex before a protocol change is integrated.
- The server owns positions, bullets, collisions, wall damage, lives, scores, timer, and match state. Clients send input and actions only.
- Use HTML elements and CSS for visuals. Canvas, WebGL, Phaser, PixiJS, React, and other game engines are prohibited by the assignment.
- Keep the implementation small enough for every student to explain during the project review.
