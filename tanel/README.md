# Tanel’s server uploads

Start a Gitea branch from `main`, such as `tanel/server-uploads`. Copy each numbered folder’s listed files to the Gitea repository root. Each later `server.js` replaces the previous one. Commit and push one step at a time, keeping the setup files from step 01.

| Step | Files to copy into Gitea | What to check |
|---|---|---|
| [01 Server and lobby](01-server-and-lobby/) | `server.js`, `package.json`, `package-lock.json`, `.gitignore` | Coordinate the shared setup files with Matis. Run `npm ci` and `npm start`, then check `/health`. With Alex 02, try room creation, joining, ready status, and duplicate names. A match starts from step 02 onward. |
| [02 Movement](02-movement/) | `server.js` | With Alex 03, start a two-player room. Check that both clients see movement, moving tanks stop at walls and arena edges, and the room returns to the lobby if too few players remain. |
| [03 Combat and match flow](03-combat-and-match-flow/) | `server.js` | Integrate with Matis’s root `game-rules.js` before starting this server. With Alex 04, check bullets, walls, lives, respawns, winner selection, timer, pause, disconnect, and return to lobby. |
| [04 Solo](04-solo/) | `server.js` | With Alex 05, start a solo match, confirm three CPU opponents, and check that an online room still works. |

Use Node.js 18 or newer. With the paired browser files in the same checkout, open the local URL printed by the server. Keep browser files and Matis’s rule and test files out of your commit. [Alex’s upload order](../alex/)
