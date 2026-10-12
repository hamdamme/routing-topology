import { algorithms, parseTopology, sample } from "./model.ts";
import type { Algorithm, Topology } from "./model.ts";

export type Workspace = {
  topology: Topology;
  source: string;
  destination: string;
  algorithm: Algorithm;
  scenario: number;
};
export type History = {
  past: Workspace[];
  present: Workspace;
  future: Workspace[];
  gesture: Workspace | null;
};
export type Action =
  | { type: "edit"; change: Partial<Workspace> }
  | { type: "beginMove" }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "endMove" }
  | { type: "undo" | "redo" };
const LIMIT = 50;
const SHARE_LIMIT = 24000;
export function initialWorkspace(): Workspace {
  return {
    topology: sample(),
    source: "R1",
    destination: "R4",
    algorithm: "dijkstra",
    scenario: 0,
  };
}
export function historyFor(present: Workspace): History {
  return { past: [], present, future: [], gesture: null };
}
function same(a: Workspace, b: Workspace) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function finish(history: History): History {
  if (!history.gesture) return history;
  return same(history.gesture, history.present)
    ? { ...history, gesture: null }
    : {
        ...history,
        past: [...history.past, history.gesture].slice(-LIMIT),
        future: [],
        gesture: null,
      };
}
export function historyReducer(history: History, action: Action): History {
  if (action.type === "beginMove")
    return { ...finish(history), gesture: history.present };
  if (action.type === "endMove") return finish(history);
  if (action.type === "move") {
    if (!history.present.topology.nodes.some((node) => node.id === action.id))
      return history;
    const next = {
      ...history.present,
      topology: {
        ...history.present.topology,
        nodes: history.present.topology.nodes.map((node) =>
          node.id === action.id ? { ...node, x: action.x, y: action.y } : node,
        ),
      },
    };
    if (same(next, history.present)) return history;
    if (history.gesture) return { ...history, present: next };
    return {
      past: [...history.past, history.present].slice(-LIMIT),
      present: next,
      future: [],
      gesture: null,
    };
  }
  history = finish(history);
  if (action.type === "edit") {
    const next = { ...history.present, ...action.change };
    if (same(next, history.present)) return history;
    return {
      past: [...history.past, history.present].slice(-LIMIT),
      present: next,
      future: [],
      gesture: null,
    };
  }
  if (action.type === "undo") {
    const previous = history.past.at(-1);
    return previous
      ? {
          past: history.past.slice(0, -1),
          present: previous,
          future: [history.present, ...history.future].slice(0, LIMIT),
          gesture: null,
        }
      : history;
  }
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present].slice(-LIMIT),
        present: next,
        future: history.future.slice(1),
        gesture: null,
      }
    : history;
}
export function encodeWorkspace(workspace: Workspace): string {
  const compact = {
    v: 1,
    n: workspace.topology.nodes.map((n) => [
      n.id,
      Math.round(n.x),
      Math.round(n.y),
      Number(n.disabled),
    ]),
    l: workspace.topology.links.map((l) => [
      l.id,
      l.from,
      l.to,
      l.cost,
      Number(l.disabled),
    ]),
    s: workspace.source,
    d: workspace.destination,
    a: workspace.algorithm,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  const token = btoa(
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (token.length > SHARE_LIMIT)
    throw new Error(
      "This topology is too large for a share link. Export JSON instead.",
    );
  return token;
}
export function decodeWorkspace(token: string): Workspace {
  if (!token || token.length > SHARE_LIMIT || !/^[A-Za-z0-9_-]+$/.test(token))
    throw new Error("The shared network link is invalid or too large.");
  try {
    const binary = atob(token.replaceAll("-", "+").replaceAll("_", "/"));
    const data = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      ),
    );
    if (
      !data ||
      data.v !== 1 ||
      !Array.isArray(data.n) ||
      !Array.isArray(data.l)
    )
      throw new Error();
    const topology = parseTopology({
      nodes: data.n.map((n: unknown[]) => {
        if (
          !Array.isArray(n) ||
          n.length !== 4 ||
          typeof n[1] !== "number" ||
          !Number.isFinite(n[1]) ||
          typeof n[2] !== "number" ||
          !Number.isFinite(n[2]) ||
          ![0, 1].includes(n[3] as number)
        )
          throw new Error();
        return { id: n[0], x: n[1], y: n[2], disabled: n[3] === 1 };
      }),
      links: data.l.map((l: unknown[]) => {
        if (
          !Array.isArray(l) ||
          l.length !== 5 ||
          ![0, 1].includes(l[4] as number)
        )
          throw new Error();
        return {
          id: l[0],
          from: l[1],
          to: l[2],
          cost: l[3],
          disabled: l[4] === 1,
        };
      }),
    });
    if (typeof data.a !== "string" || !Object.hasOwn(algorithms, data.a))
      throw new Error();
    for (const endpoint of [data.s, data.d])
      if (
        typeof endpoint !== "string" ||
        (!topology.nodes.some((n) => n.id === endpoint) &&
          !(endpoint === "" && topology.nodes.every((n) => n.disabled)))
      )
        throw new Error();
    return {
      topology,
      source: data.s,
      destination: data.d,
      algorithm: data.a,
      scenario: -1,
    };
  } catch {
    throw new Error(
      "The shared network link is invalid. The sample network is still available.",
    );
  }
}
export function loadSharedWorkspace(hash: string): {
  workspace: Workspace;
  message: string;
} {
  if (!hash.startsWith("#network="))
    return { workspace: initialWorkspace(), message: "" };
  try {
    return {
      workspace: decodeWorkspace(hash.slice(9)),
      message: "Shared network loaded. Run the analysis or edit the topology.",
    };
  } catch (error) {
    return {
      workspace: initialWorkspace(),
      message:
        error instanceof Error ? error.message : "Invalid shared network.",
    };
  }
}
export function shareLink(address: string, workspace: Workspace): string {
  const url = new URL(address);
  url.search = "";
  url.hash = `network=${encodeWorkspace(workspace)}`;
  return url.toString();
}
