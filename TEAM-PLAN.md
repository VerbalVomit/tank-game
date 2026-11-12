# Three-person work split

This split keeps the code ownership small enough to review while giving each person a clear deliverable. Matis is the team lead and integration point.

| Person | Owns | Deliverables |
|---|---|---|
| **Matis — team lead / product review** | Requirements and release decisions | Set priorities, review the acceptance evidence, decide when the build is ready for the class demonstration, and approve any public release. |
| **Alex — browser game** | `public/index.html`, `public/style.css`, `public/game.js` | Own the screens, accessible lobby, keyboard handling, DOM-only tank/map rendering, interpolation, responsive styles, and sound controls. Confirm the client creates map/tank nodes at match start and does not rebuild the arena each frame. |
| **Tanel — multiplayer server** | `server.js` | Own room codes, nickname rules, readiness, authoritative 30 Hz movement and bullet simulation, collisions, scoring, pause/resume/quit, timer, disconnect handling, and host-controlled rematches. Keep client messages limited to input/actions. |

## Handoff points

1. Tanel keeps the Socket.IO event names and payloads in `server.js` stable and tells Alex before changing them.
2. Alex owns the client files and checks each event against the server payloads. The map coordinates use a 640×480 logical arena.
3. Matis reviews the integrated feature flow and records results for the README checklist. The person changing a feature should not silently mark its acceptance check as passed; ask another team member to confirm it.

## Suggested sequence

1. Alex prepares the DOM arena and keyboard loop; Tanel creates the server and room state.
2. Pair the client and server through a two-browser lobby and movement session.
3. Tanel finishes hits, walls, lives, timer, and shared pause; Alex adds scoreboard and game-over screens.
4. Matis runs the multi-client acceptance session, records defects, and coordinates fixes.
5. The team prepares the deployment build and setup; Matis makes the release decision and leads the class demonstration.
