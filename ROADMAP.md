# Routing Topology roadmap

Detailed scope and architecture: [README](README.md).

| Phase | Scope | Effort | Status |
|---|---|---|---|
| Routing engine | Validation, deterministic algorithms, execution traces | 1 session | Complete |
| Interactive workspace | Graph editor, route inspector, failures, playback | 1–2 sessions | Complete |
| Verification | Algorithm tests, API tests, browser checks | 1 session | Complete |
| Publication | Repository identity, deployment, portfolio links | 1 session | Complete |

Java routing and API tests, frontend lint, and the TypeScript production build passed locally. Browser checks verified route comparison, link failure rerouting, disconnected destinations, graph editing, and playback. GitHub Actions passed for implementation commit `b10a4c6`. Render deployed that commit successfully, and the public app was verified for route calculation, graph dragging, playback, CSV download, and a 390 px layout without horizontal overflow.

## Editing and sharing

| Scope | Effort | Status |
|---|---|---|
| Undo/redo, grouped graph moves, keyboard shortcuts | 1 session | Complete |
| Shareable topology snapshots with input validation | 1 session | Complete |
| Frontend tests, browser checks, public release | 1 session | Release pending |

Six frontend tests passed, along with lint and the TypeScript production build. Local browser checks verified undo/redo, keyboard movement, copying links, restoring a shared topology, and routing analysis from that snapshot.
