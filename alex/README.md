# Alex’s browser uploads

The numbered folders contain complete files for each step. On your Gitea branch, copy the files from the numbered folder into the matching paths under the repository root. For example, copy `02-lobby/public/game.js` to `public/game.js`. Keep the files from earlier steps and replace a file when a later step lists the same path. Commit and push one step at a time.

| Step | Files to copy into Gitea | When to use it |
|---|---|---|
| [01 Screens](01-screens/) | `public/index.html`, `public/style.css` | Already uploaded on [Alex’s Gitea branch](https://gitea.kood.tech/matisvelt/multi-player/src/branch/alex/phase-01-screens-shell). Start at 02 if these two files are already on your branch. |
| [02 Lobby](02-lobby/) | `public/index.html`, `public/game.js` | Pair with Tanel 01. Create or join a room and check the room code, roster, and ready status in two browser tabs. |
| [03 Arena and input](03-arena-and-input/) | `public/game.js` | Pair with Tanel 02. Start a match with two ready players, move with WASD or arrows, and check that both tabs show movement. Use the match menu to leave. |
| [04 Combat and match UI](04-combat-and-match-ui/) | `public/game.js` | Pair with Tanel 03 and Matis’s rules. Check shooting, explosions and wall updates, lives and scores, the clock, shared pause, results, and returning to the lobby. |
| [05 Solo and sound](05-solo-and-sound/) | `public/game.js` | Pair with Tanel 04. Start solo against three CPU pilots, check the sound toggle, then check that a multiplayer room can still start. |

Keep pushing to the existing `alex/phase-01-screens-shell` Gitea branch. Run the paired check in a checkout that contains both students’ files. Keep server and integration files out of your commit. [Tanel’s upload order](../tanel/)
