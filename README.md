# Routing Topology

An interactive network routing analysis tool with a visual topology editor, algorithm playback, and failure scenarios.

[Open the live workspace](https://network-routing-simulator.onrender.com/). The free hosting instance can take about a minute to wake after inactivity.

## What you can do

- Start with redundant, branch, or disconnected example networks.
- Drag routers, add routers and links, edit costs, and inspect connections. Keyboard users can select graph elements with Tab and move routers with arrow keys.
- Undo and redo up to 50 edits, including complete router drags. Use Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z outside text fields.
- Share a snapshot link containing the topology, layout, costs, failures, endpoints, and selected algorithm.
- Choose source and destination routers and compare Dijkstra, Bellman–Ford, and Distance Vector.
- Replay Dijkstra settlements and relaxations, Bellman–Ford passes, and synchronous Distance Vector rounds.
- Disable a router or link, recompute routes, and compare the result with the same topology when all connections are restored.
- Inspect routing tables for any enabled router. Import/export topology JSON and download routing tables as CSV or complete analysis as JSON.

## Model and limits

Links are bidirectional with integer costs from 1 to 9999. Networks support 1–30 routers and at most 120 links. Router names contain 1–20 letters, digits, underscores, or dashes. Self links and duplicate connections are rejected. Disabled routers and links do not participate in routing. Unreachable destinations have no cost or next hop.

Dijkstra and Bellman–Ford compute tables from every router; playback describes the selected source. Distance Vector uses simultaneous rounds: each router reads its neighbors' vectors from the preceding round. Comparison passes and rounds describe different operations and are not equivalent performance measures. Equal-cost routes may have different next hops or hop counts.

Failures start a fresh calculation. This is a routing algorithm laboratory, not a packet simulator or implementation of OSPF, RIP, protocol timers, split horizon, poison reverse, or count to infinity. Layout changes do not affect link costs. Browser edits and history are temporary; export JSON or save a shared link to preserve a network. Shared links store a snapshot in the URL fragment, round layout coordinates to whole pixels, and start with an empty editing history. Later edits do not change an existing link. Links are limited to 24,000 encoded characters; use JSON export for larger snapshots.

## Architecture

- **Engine:** Java 17, deterministic validated graph model and execution traces.
- **API:** Spring Boot. `POST /api/simulate` returns the path, cost, all routing tables, and trace. `GET /api/health` reports availability.
- **Interface:** React, TypeScript, Vite, and accessible SVG graph controls.
- **Deployment:** Docker builds the frontend and serves it through Spring Boot on the same origin. No separate frontend service or CORS configuration is needed. Render uses the public repository source, so future releases require Manual Deploy → Deploy latest commit.

The original Java CLI, exporters, and `/api/run` endpoint remain available. They share the corrected bidirectional routing engine. The earlier `GraphView.jsx` remains in source as a legacy component and is not used by the current interface.

## Run locally

Requirements: Java 17, Maven 3.9, and Node.js 22.

```sh
mvn package
java -Dserver.port=8083 -jar backend/network-routing-service/target/network-routing-service-1.0-SNAPSHOT.jar
```

In a second terminal:

```sh
cd frontend/network-routing-frontend
npm ci
npm run dev
```

Open the Vite address printed in the terminal. Its development proxy forwards `/api` to port 8083. Leave `VITE_API_BASE` unset; the optional `.env.example` is only for deployments with a separate API origin.

For a single container:

```sh
docker build -t routing-topology .
docker run --rm -p 8083:8080 routing-topology
```

Open `http://localhost:8083`. The service uses Render's `PORT` environment variable when present.

## Topology format

```json
{
  "nodes": [
    {"id": "A", "x": 200, "y": 270, "disabled": false},
    {"id": "B", "x": 650, "y": 270, "disabled": false}
  ],
  "links": [
    {"id": "AB", "from": "A", "to": "B", "cost": 7, "disabled": false}
  ]
}
```

Coordinates are optional during import and have no effect on routing. The API accepts the same network inside an object with `source`, `destination`, and `algorithm` (`dijkstra`, `bf`, or `dv`).

## Verification

```sh
mvn test
cd frontend/network-routing-frontend
npm test
npm run lint
npm run build
```

Tests check routes, next hops, unreachable destinations, disabled links and routers, recovery, input validation, immutable trace snapshots, synchronous vector rounds, and the legacy parser. Seeded networks are compared with an independent Floyd–Warshall reference. API tests exercise response contracts and malformed input. Frontend tests verify history restoration, grouped moves, history limits, shared snapshots, and invalid-link recovery. GitHub Actions runs the Java tests and frontend tests, lint, and production build.

Current implementation and release status: [ROADMAP](ROADMAP.md).
