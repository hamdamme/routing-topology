export type Router = { id: string; x: number; y: number; disabled: boolean };
export type Link = {
  id: string;
  from: string;
  to: string;
  cost: number;
  disabled: boolean;
};
export type Topology = { nodes: Router[]; links: Link[] };
export type Algorithm = "dijkstra" | "bf" | "dv";
export type Row = {
  destination: string;
  nextHop: string | null;
  cost: number | null;
};
export type Step = {
  message: string;
  from: string | null;
  to: string | null;
  visited: string[];
  distances: Record<string, number | null>;
  round: number;
};
export type Result = {
  algorithm: Algorithm;
  path: string[];
  cost: number | null;
  tables: Record<string, Row[]>;
  steps: Step[];
  relaxations: number;
  rounds: number;
};
export const algorithms: Record<Algorithm, string> = {
  dijkstra: "Dijkstra",
  bf: "Bellman–Ford",
  dv: "Distance Vector",
};
export const scenarios = [
  "Redundant network",
  "Branch network",
  "Disconnected network",
] as const;
export function sample(index = 0): Topology {
  const nodes = ["R1", "R2", "R3", "R4", "R5", "R6"].map((id, i) => ({
    id,
    x: 450 + 290 * Math.cos(Math.PI + (i * Math.PI) / 3),
    y: 270 + 185 * Math.sin(Math.PI + (i * Math.PI) / 3),
    disabled: false,
  }));
  const pairs =
    index === 1
      ? [
          [0, 1, 3],
          [1, 2, 2],
          [1, 3, 5],
          [3, 4, 2],
          [3, 5, 4],
        ]
      : index === 2
        ? [
            [0, 1, 4],
            [1, 2, 3],
            [3, 4, 2],
            [4, 5, 5],
          ]
        : [
            [0, 1, 4],
            [0, 5, 8],
            [1, 2, 3],
            [1, 4, 7],
            [2, 3, 4],
            [3, 4, 2],
            [4, 5, 3],
            [1, 5, 2],
          ];
  return {
    nodes,
    links: pairs.map(([a, b, cost]) => ({
      id: `${nodes[a].id}-${nodes[b].id}`,
      from: nodes[a].id,
      to: nodes[b].id,
      cost,
      disabled: false,
    })),
  };
}
export function parseTopology(value: unknown): Topology {
  if (!value || typeof value !== "object")
    throw new Error("Provide a topology JSON object.");
  const data = value as Partial<Topology>;
  if (
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.links) ||
    !data.nodes.length ||
    data.nodes.length > 30 ||
    data.links.length > 120
  )
    throw new Error("Use 1–30 routers and at most 120 links.");
  const ids = new Set<string>();
  const nodes = data.nodes.map((node, i) => {
    if (
      !node ||
      typeof node.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,20}$/.test(node.id) ||
      ids.has(node.id)
    )
      throw new Error(
        "Router names must be unique, using letters, digits, underscores or dashes.",
      );
    ids.add(node.id);
    return {
      id: node.id,
      x: Number.isFinite(node.x)
        ? Math.max(40, Math.min(860, node.x))
        : 450 + 280 * Math.cos((i * 2 * Math.PI) / data.nodes!.length),
      y: Number.isFinite(node.y)
        ? Math.max(40, Math.min(500, node.y))
        : 270 + 180 * Math.sin((i * 2 * Math.PI) / data.nodes!.length),
      disabled: node.disabled === true,
    };
  });
  const pairs = new Set<string>(),
    linksIds = new Set<string>();
  const links = data.links.map((link) => {
    if (
      !link ||
      typeof link.id !== "string" ||
      !link.id.trim() ||
      link.id.length > 80 ||
      linksIds.has(link.id) ||
      !ids.has(link.from) ||
      !ids.has(link.to) ||
      link.from === link.to ||
      !Number.isInteger(link.cost) ||
      link.cost < 1 ||
      link.cost > 9999
    )
      throw new Error(
        "Each link needs a unique ID, two existing routers, and an integer cost from 1 to 9999.",
      );
    linksIds.add(link.id);
    const key = [link.from, link.to].sort().join("/");
    if (pairs.has(key))
      throw new Error("Duplicate router connections are not supported.");
    pairs.add(key);
    return {
      id: link.id,
      from: link.from,
      to: link.to,
      cost: link.cost,
      disabled: link.disabled === true,
    };
  });
  return { nodes, links };
}
export function download(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
