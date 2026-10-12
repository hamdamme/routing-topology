# Routing Topology roadmap

Detailed scope and architecture: [README](README.md).

| Phase | Scope | Effort | Status |
|---|---|---|---|
| Routing engine | Validation, deterministic algorithms, execution traces | 1 session | Complete |
| Interactive workspace | Graph editor, route inspector, failures, playback | 1–2 sessions | Complete |
| Verification | Algorithm tests, API tests, browser checks | 1 session | Local checks complete; CI pending |
| Publication | Repository identity, deployment, portfolio links | 1 session | In progress |

Java routing and API tests, frontend lint, and the TypeScript production build passed locally. Browser checks verified route comparison, link failure rerouting, disconnected destinations, graph editing, and playback. Hosted release verification is pending.
