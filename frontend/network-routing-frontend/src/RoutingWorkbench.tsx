import { useEffect, useReducer, useRef, useState } from "react";
import RoutingGraph from "./RoutingGraph";
import {
  algorithms,
  download,
  parseTopology,
  sample,
  scenarios,
} from "./model";
import type { Algorithm, Result, Topology } from "./model";
import {
  historyFor,
  historyReducer,
  loadSharedWorkspace,
  shareLink,
} from "./workspace";
import type { Workspace } from "./workspace";
const API = import.meta.env.VITE_API_BASE || "";
const algorithmIds = Object.keys(algorithms) as Algorithm[];
export default function RoutingWorkbench() {
  const [initial] = useState(() => loadSharedWorkspace(window.location.hash));
  const [history, dispatch] = useReducer(
    historyReducer,
    initial.workspace,
    historyFor,
  );
  const { topology, source, destination, algorithm, scenario } =
    history.present;
  const [notice, setNotice] = useState(initial.message);
  const [sharedUrl, setSharedUrl] = useState("");
  const [selection, setSelection] = useState<string | null>(null),
    [connect, setConnect] = useState(false);
  const [results, setResults] = useState<Partial<Record<Algorithm, Result>>>(
    {},
  );
  const [baseline, setBaseline] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false);
  const [from, setFrom] = useState("R1"),
    [to, setTo] = useState("R2"),
    [cost, setCost] = useState(5);
  const [importOpen, setImportOpen] = useState(false),
    [importText, setImportText] = useState("");
  const request = useRef(0),
    abort = useRef<AbortController | null>(null);
  const result = results[algorithm],
    step = result?.steps[position];
  const finished = !!result && position === result.steps.length - 1;
  const selectedNode = topology.nodes.find((n) => n.id === selection),
    selectedLink = topology.links.find((l) => l.id === selection);
  const enabled = topology.nodes.filter((n) => !n.disabled);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!playing || !result) return;
    const timer = setInterval(
      () => setPosition((p) => Math.min(p + 1, result.steps.length - 1)),
      800,
    );
    return () => clearInterval(timer);
  }, [playing, result]);
  useEffect(() => {
    if (finished) setPlaying(false);
  }, [finished]);
  function invalidate() {
    request.current++;
    abort.current?.abort();
    setBusy(false);
    setResults({});
    setBaseline(null);
    setPosition(0);
    setPlaying(false);
    setError("");
  }
  function commit(change: Partial<Workspace>, clearSelection = true) {
    invalidate();
    dispatch({ type: "edit", change });
    setSharedUrl("");
    setNotice("");
    if (clearSelection) setSelection(null);
  }
  function edit(next: Topology) {
    commit({ topology: next });
  }
  function restoreHistory(type: "undo" | "redo") {
    invalidate();
    dispatch({ type });
    setSelection(null);
    setConnect(false);
    setSharedUrl("");
    setNotice(
      type === "undo"
        ? "Last edit undone. Run the analysis to refresh results."
        : "Edit restored. Run the analysis to refresh results.",
    );
  }
  function generateShareLink() {
    setError("");
    try {
      setSharedUrl(shareLink(window.location.href, history.present));
      setNotice("Link ready. Anyone with this link can open this network.");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to create the link.",
      );
    }
  }
  useEffect(() => {
    if (!topology.nodes.some((n) => n.id === from))
      setFrom(topology.nodes[0].id);
    if (!topology.nodes.some((n) => n.id === to))
      setTo(topology.nodes.at(-1)!.id);
  }, [topology, from, to]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        target.closest("input,select,textarea,[contenteditable=true]")
      )
        return;
      const key = event.key.toLowerCase();
      const type =
        key === "z"
          ? event.shiftKey
            ? "redo"
            : "undo"
          : key === "y"
            ? "redo"
            : null;
      if (!type) return;
      event.preventDefault();
      invalidate();
      dispatch({ type });
      setSelection(null);
      setConnect(false);
      setSharedUrl("");
      setNotice("");
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function run(network = topology, src = source, dst = destination) {
    const active = network.nodes.filter((n) => !n.disabled);
    if (
      !active.some((n) => n.id === src) ||
      !active.some((n) => n.id === dst)
    ) {
      invalidate();
      setError("Choose enabled source and destination routers.");
      return;
    }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++request.current;
    setBusy(true);
    setError("");
    setPlaying(false);
    setResults({});
    setBaseline(null);
    setPosition(0);
    const timer = setTimeout(() => controller.abort(), 60000);
    async function solve(algo: Algorithm, net: Topology) {
      const response = await fetch(`${API}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: net,
          source: src,
          destination: dst,
          algorithm: algo,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response
          .json()
          .catch(() => ({ message: "Routing service is unavailable." }));
        throw new Error(text.message || "Routing service is unavailable.");
      }
      return response.json() as Promise<Result>;
    }
    try {
      const values = await Promise.all(
        algorithmIds.map((a) => solve(a, network)),
      );
      const hasFailure =
        network.nodes.some((n) => n.disabled) ||
        network.links.some((l) => l.disabled);
      const base = hasFailure
        ? await solve("dijkstra", {
            nodes: network.nodes.map((n) => ({ ...n, disabled: false })),
            links: network.links.map((l) => ({ ...l, disabled: false })),
          })
        : values[0];
      if (id !== request.current) return;
      setResults(Object.fromEntries(values.map((v) => [v.algorithm, v])));
      setBaseline(base);
    } catch (e) {
      if (id === request.current)
        setError(
          controller.signal.aborted
            ? "The routing service timed out. It may be waking up; try again."
            : e instanceof Error
              ? e.message
              : "Unable to connect to the routing service.",
        );
    } finally {
      clearTimeout(timer);
      if (id === request.current) setBusy(false);
    }
  }
  function toggleFailure(id: string) {
    const next = {
      nodes: topology.nodes.map((n) =>
        n.id === id ? { ...n, disabled: !n.disabled } : n,
      ),
      links: topology.links.map((l) =>
        l.id === id ? { ...l, disabled: !l.disabled } : l,
      ),
    };
    commit({ topology: next }, false);
    void run(next);
  }
  function addLink(pair?: string) {
    const [a, b] = pair?.split("/") || [from, to];
    if (a === b) {
      setError("Connect two different routers.");
      return;
    }
    if (
      topology.links.some(
        (l) => (l.from === a && l.to === b) || (l.from === b && l.to === a),
      )
    ) {
      setError("These routers are already connected.");
      return;
    }
    if (!Number.isInteger(cost) || cost < 1 || cost > 9999) {
      setError("Use an integer link cost from 1 to 9999.");
      return;
    }
    if (topology.links.length >= 120) {
      setError("The limit is 120 links.");
      return;
    }
    let index = 1;
    while (topology.links.some((l) => l.id === `link-${index}`)) index++;
    edit({
      ...topology,
      links: [
        ...topology.links,
        { id: `link-${index}`, from: a, to: b, cost, disabled: false },
      ],
    });
    setConnect(false);
  }
  function addRouter() {
    if (topology.nodes.length >= 30) {
      setError("The limit is 30 routers.");
      return;
    }
    let i = 1;
    while (topology.nodes.some((n) => n.id === `R${i}`)) i++;
    edit({
      ...topology,
      nodes: [
        ...topology.nodes,
        { id: `R${i}`, x: 450, y: 270, disabled: false },
      ],
    });
    setSelection(`R${i}`);
  }
  function load(index: number) {
    const network = sample(index);
    commit({
      topology: network,
      scenario: index,
      source: "R1",
      destination: "R4",
    });
    setFrom("R1");
    setTo("R2");
    setConnect(false);
  }
  function chooseAlgorithm(value: Algorithm) {
    dispatch({ type: "edit", change: { algorithm: value } });
    setSharedUrl("");
    setPosition(0);
    setPlaying(false);
  }
  function importNetwork() {
    try {
      const next = parseTopology(JSON.parse(importText));
      const active = next.nodes.filter((n) => !n.disabled);
      commit({
        topology: next,
        source: active[0]?.id || "",
        destination: active.at(-1)?.id || "",
        scenario: -1,
      });
      setFrom(next.nodes[0].id);
      setTo(next.nodes[1]?.id || next.nodes[0].id);
      setImportOpen(false);
      setConnect(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid topology.");
    }
  }
  return (
    <main>
      <header>
        <div className="brandmark" aria-hidden="true">
          ⌘
        </div>
        <div>
          <p className="eyebrow">NETWORK SYSTEMS / INTERACTIVE LAB</p>
          <h1>
            Routing Topology<span className="version">01</span>
          </h1>
        </div>
        <a
          className="source-link"
          href="https://github.com/hamdamme/routing-topology"
          target="_blank"
          rel="noreferrer"
        >
          Source ↗
        </a>
      </header>
      <section className="intro">
        <p>
          Build a network. Follow a route.
          <br />
          <span>See what changes when a link goes down.</span>
        </p>
        <div className="intro-note">
          Java routing engine
          <br />
          Three algorithms. One workspace.
        </div>
      </section>
      <div className="toolbar">
        <label>
          Example network
          <select
            value={scenario}
            onChange={(e) => load(Number(e.target.value))}
          >
            {scenario === -1 && <option value={-1}>Custom network</option>}
            {scenarios.map((s, i) => (
              <option key={s} value={i}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button onClick={addRouter}>＋ Add router</button>
        <button
          className={connect ? "active" : ""}
          onClick={() => setConnect((v) => !v)}
        >
          ↔ {connect ? "Cancel connect" : "Connect routers"}
        </button>
        <button onClick={() => setImportOpen((v) => !v)}>Import JSON</button>
        <button
          onClick={() =>
            download("routing-topology.json", JSON.stringify(topology, null, 2))
          }
        >
          Export JSON
        </button>
        <button onClick={() => load(scenario < 0 ? 0 : scenario)}>Reset</button>
        <button
          disabled={!history.past.length && !history.gesture}
          onClick={() => restoreHistory("undo")}
          title="Ctrl/Cmd + Z"
        >
          ↶ Undo
        </button>
        <button
          disabled={!history.future.length}
          onClick={() => restoreHistory("redo")}
          title="Ctrl/Cmd + Shift + Z"
        >
          ↷ Redo
        </button>
        <button onClick={generateShareLink}>Share network</button>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {sharedUrl && (
        <section className="share-panel">
          <label>
            Shareable network link
            <input
              aria-label="Shareable network link"
              value={sharedUrl}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sharedUrl);
                setNotice("Network link copied.");
              } catch {
                setNotice("Select and copy the link above.");
              }
            }}
          >
            Copy link
          </button>
          <p className="hint">
            Includes router names, layout, link costs, failures, endpoints, and
            the selected algorithm. It is a snapshot; later edits create a new
            link.
          </p>
        </section>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {importOpen && (
        <section className="import-panel">
          <label>
            Topology JSON
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"nodes": [...], "links": [...]}'
            />
          </label>
          <div>
            <input
              aria-label="Import topology file"
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 100000) {
                    setError("Import files must be under 100 KB.");
                    return;
                  }
                  setImportText(await file.text());
                }
              }}
            />
            <button onClick={importNetwork}>Load topology</button>
            <button onClick={() => setImportOpen(false)}>Cancel</button>
          </div>
          <p>
            Export the sample to see the format. Costs: 1–9999. Up to 30 routers
            and 120 links.
          </p>
        </section>
      )}
      <div className="workspace">
        <section className="canvas-panel">
          <div className="panel-heading">
            <h2>Network canvas</h2>
            <span>
              {topology.nodes.length} routers · {topology.links.length} links
            </span>
          </div>
          <div className="canvas-wrap">
            <RoutingGraph
              topology={topology}
              source={source}
              destination={destination}
              path={finished ? result.path : []}
              step={step}
              selection={selection}
              connect={connect}
              onSelect={setSelection}
              onMoveStart={() => dispatch({ type: "beginMove" })}
              onMoveEnd={() => dispatch({ type: "endMove" })}
              onMove={(id, x, y) => {
                dispatch({ type: "move", id, x, y });
                setSharedUrl("");
              }}
              onConnect={addLink}
            />
          </div>
          <div className="graph-footer">
            <span>
              {connect
                ? "Click two routers to connect them. New links use the cost set in the inspector."
                : "Drag routers to arrange. Click a router or link to inspect."}
            </span>
            <div className="legend">
              <span className="route-dot">Route</span>
              <span className="visited-dot">Settled</span>
              <span className="down-dot">Offline</span>
            </div>
          </div>
        </section>
        <aside>
          <section className="panel">
            <p className="eyebrow">01 / ROUTE ANALYSIS</p>
            <h2>Find a path</h2>
            <div className="two-cols">
              <label>
                Source
                <select
                  aria-label="Source router"
                  value={source}
                  onChange={(e) => {
                    invalidate();
                    commit({ source: e.target.value }, false);
                  }}
                >
                  {topology.nodes.map((n) => (
                    <option key={n.id} value={n.id} disabled={n.disabled}>
                      {n.id}
                      {n.disabled ? " (offline)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination
                <select
                  aria-label="Destination router"
                  value={destination}
                  onChange={(e) => {
                    invalidate();
                    commit({ destination: e.target.value }, false);
                  }}
                >
                  {topology.nodes.map((n) => (
                    <option key={n.id} value={n.id} disabled={n.disabled}>
                      {n.id}
                      {n.disabled ? " (offline)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Algorithm
              <select
                value={algorithm}
                onChange={(e) => chooseAlgorithm(e.target.value as Algorithm)}
              >
                {algorithmIds.map((a) => (
                  <option key={a} value={a}>
                    {algorithms[a]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary wide"
              disabled={busy || !enabled.length}
              onClick={() => void run()}
            >
              {busy ? "Analyzing network…" : "Run & compare →"}
            </button>
            <p className="hint">
              All three algorithms run on the same network. No account required.
            </p>
          </section>
          <section className="panel inspector">
            <p className="eyebrow">02 / INSPECTOR</p>
            <h2>
              {selectedNode
                ? selectedNode.id
                : selectedLink
                  ? `${selectedLink.from} ↔ ${selectedLink.to}`
                  : "Select a router or link"}
            </h2>
            {selectedNode && (
              <>
                <p>
                  {selectedNode.disabled
                    ? "This router is offline."
                    : "This router is online."}
                </p>
                <button
                  onClick={() => toggleFailure(selectedNode.id)}
                  disabled={busy}
                >
                  {selectedNode.disabled
                    ? "Restore router"
                    : "Take router offline"}
                </button>
                <button
                  className="danger"
                  disabled={topology.nodes.length === 1 || busy}
                  onClick={() => {
                    const next = {
                      nodes: topology.nodes.filter(
                        (n) => n.id !== selectedNode.id,
                      ),
                      links: topology.links.filter(
                        (l) =>
                          l.from !== selectedNode.id &&
                          l.to !== selectedNode.id,
                      ),
                    };
                    commit({
                      topology: next,
                      source:
                        source === selectedNode.id
                          ? next.nodes.find((n) => !n.disabled)?.id || ""
                          : source,
                      destination:
                        destination === selectedNode.id
                          ? next.nodes.find((n) => !n.disabled)?.id || ""
                          : destination,
                    });
                    setFrom(next.nodes[0].id);
                    setTo(next.nodes.at(-1)!.id);
                  }}
                >
                  Remove router
                </button>
              </>
            )}
            {selectedLink && (
              <>
                <label>
                  Link cost
                  <input
                    aria-label="Selected link cost"
                    type="number"
                    min="1"
                    max="9999"
                    value={selectedLink.cost}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (
                        Number.isInteger(value) &&
                        value >= 1 &&
                        value <= 9999
                      ) {
                        invalidate();
                        commit(
                          {
                            topology: {
                              ...topology,
                              links: topology.links.map((l) =>
                                l.id === selectedLink.id
                                  ? { ...l, cost: value }
                                  : l,
                              ),
                            },
                          },
                          false,
                        );
                      }
                    }}
                  />
                </label>
                <button
                  onClick={() => toggleFailure(selectedLink.id)}
                  disabled={busy}
                >
                  {selectedLink.disabled ? "Restore link" : "Disable link"}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    edit({
                      ...topology,
                      links: topology.links.filter(
                        (l) => l.id !== selectedLink.id,
                      ),
                    })
                  }
                >
                  Remove link
                </button>
              </>
            )}
            {!selection && (
              <p className="hint">
                Inspect connections, change costs, or simulate a failure.
                Disabling keeps the connection so you can restore it.
              </p>
            )}
            <details>
              <summary>Add a connection</summary>
              <div className="two-cols">
                <label>
                  From
                  <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  >
                    {topology.nodes.map((n) => (
                      <option key={n.id}>{n.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select value={to} onChange={(e) => setTo(e.target.value)}>
                    {topology.nodes.map((n) => (
                      <option key={n.id}>{n.id}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                New link cost
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={cost}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </label>
              <button className="wide" onClick={() => addLink()}>
                Add connection
              </button>
            </details>
          </section>
        </aside>
      </div>
      <section className="playback panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">03 / EXECUTION TRACE</p>
            <h2>{result ? algorithms[algorithm] : "Follow the algorithm"}</h2>
          </div>
          <span>
            {result
              ? `${position + 1} / ${result.steps.length}`
              : "Run a search to begin"}
          </span>
        </div>
        <p className="trace-message" aria-live="polite">
          {step?.message ||
            "Watch how the algorithm discovers routes, then inspect the final path."}
        </p>
        <div className="playback-controls">
          <button
            disabled={!result}
            onClick={() => {
              if (finished) setPosition(0);
              setPlaying((v) => !v);
            }}
          >
            {playing ? "Ⅱ Pause" : "▶ Play"}
          </button>
          <button
            disabled={!result || position === 0}
            onClick={() => {
              setPlaying(false);
              setPosition((p) => Math.max(0, p - 1));
            }}
          >
            ← Back
          </button>
          <button
            disabled={!result || finished}
            onClick={() => {
              setPlaying(false);
              setPosition((p) => p + 1);
            }}
          >
            Next →
          </button>
          <input
            aria-label="Execution step"
            type="range"
            min="0"
            max={result ? result.steps.length - 1 : 1}
            value={position}
            disabled={!result}
            onChange={(e) => {
              setPlaying(false);
              setPosition(Number(e.target.value));
            }}
          />
          <button
            disabled={!result}
            onClick={() => {
              setPlaying(false);
              setPosition(result!.steps.length - 1);
            }}
          >
            Show route
          </button>
        </div>
      </section>
      <div className="results-grid">
        <section className="panel">
          <p className="eyebrow">04 / ROUTE RESULT</p>
          <h2>
            {result
              ? result.cost === null
                ? "Destination unreachable"
                : `Total cost ${result.cost}`
              : "Your route appears here"}
          </h2>
          <p className="route-text">
            {result?.path.length
              ? result.path.join(" → ")
              : result
                ? "No available path between the selected routers."
                : "Choose endpoints and run the analysis."}
          </p>
          {baseline &&
            result &&
            (topology.nodes.some((n) => n.disabled) ||
              topology.links.some((l) => l.disabled)) && (
              <div className="failure-note">
                <strong>Failure impact</strong>
                <p>
                  All connections restored:{" "}
                  {baseline.path.length
                    ? `${baseline.path.join(" → ")} · cost ${baseline.cost}`
                    : "unreachable"}
                </p>
                <p>
                  Current network:{" "}
                  {result.cost === null
                    ? "unreachable"
                    : `cost ${result.cost}${baseline.cost === null ? "" : ` (${result.cost - baseline.cost >= 0 ? "+" : ""}${result.cost - baseline.cost})`}`}
                </p>
                <button
                  onClick={() => {
                    const next = {
                      nodes: topology.nodes.map((n) => ({
                        ...n,
                        disabled: false,
                      })),
                      links: topology.links.map((l) => ({
                        ...l,
                        disabled: false,
                      })),
                    };
                    commit({ topology: next });
                    void run(next);
                  }}
                >
                  Restore all & rerun
                </button>
              </div>
            )}
          <button
            disabled={!result}
            onClick={() =>
              download(
                "routing-analysis.json",
                JSON.stringify(
                  { topology, source, destination, results },
                  null,
                  2,
                ),
              )
            }
          >
            Download analysis
          </button>
        </section>
        <section className="panel">
          <p className="eyebrow">05 / ALGORITHM COMPARISON</p>
          <h2>Same network, different methods</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Algorithm</th>
                  <th>Cost</th>
                  <th>Hops</th>
                  <th>Passes / rounds</th>
                </tr>
              </thead>
              <tbody>
                {algorithmIds.map((a) => (
                  <tr key={a}>
                    <th>{algorithms[a]}</th>
                    <td>
                      {results[a] ? (results[a]!.cost ?? "Unreachable") : "—"}
                    </td>
                    <td>
                      {results[a]?.path.length
                        ? results[a]!.path.length - 1
                        : "—"}
                    </td>
                    <td>
                      {results[a]
                        ? a === "dijkstra"
                          ? "—"
                          : results[a]!.rounds
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Dijkstra settles routers by lowest known cost. Bellman–Ford relaxes
            links in passes. Distance Vector exchanges all routers’ previous
            vectors in synchronous rounds.
          </p>
        </section>
      </div>
      <section className="panel routing-tables">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">06 / ROUTING TABLES</p>
            <h2>
              {selectedNode && !selectedNode.disabled
                ? selectedNode.id
                : source}{" "}
              · destinations & next hops
            </h2>
          </div>
          <button
            disabled={!result}
            onClick={() => {
              const lines = [
                "router,destination,nextHop,cost",
                ...Object.entries(result!.tables).flatMap(([router, rows]) =>
                  rows.map((row) =>
                    [
                      router,
                      row.destination,
                      row.nextHop ?? "",
                      row.cost ?? "unreachable",
                    ].join(","),
                  ),
                ),
              ];
              download("routing-tables.csv", lines.join("\n"), "text/csv");
            }}
          >
            Export CSV
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Destination</th>
                <th>Next hop</th>
                <th>Final cost</th>
                <th>Playback cost from {source}</th>
              </tr>
            </thead>
            <tbody>
              {(
                result?.tables[
                  selectedNode && !selectedNode.disabled
                    ? selectedNode.id
                    : source
                ] || []
              ).map((row) => (
                <tr key={row.destination}>
                  <th>{row.destination}</th>
                  <td>{row.nextHop ?? "—"}</td>
                  <td>{row.cost ?? "Unreachable"}</td>
                  <td>{step?.distances[row.destination] ?? "∞"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result && (
            <p className="empty">
              Run an analysis to inspect the routing tables.
            </p>
          )}
        </div>
      </section>
      <footer>
        <p>
          <strong>Model boundaries</strong> · Bidirectional links with positive
          integer costs. Failures recompute routes from scratch; playback does
          not simulate packets, protocol timers, or count to infinity.
        </p>
        <span>Routing Topology · Hamdam Aynazarov</span>
      </footer>
    </main>
  );
}
