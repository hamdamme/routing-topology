import { useEffect, useRef, useState } from "react";
import type { Topology, Step } from "./model";
type Props = {
  topology: Topology;
  source: string;
  destination: string;
  path: string[];
  step: Step | undefined;
  selection: string | null;
  connect: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (id: string) => void;
};
export default function RoutingGraph({
  topology,
  source,
  destination,
  path,
  step,
  selection,
  connect,
  onSelect,
  onMove,
  onConnect,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  useEffect(() => {
    if (!connect) setConnecting(null);
  }, [connect]);
  const routePairs = new Set(
    path.slice(1).map((to, i) => [path[i], to].sort().join("/")),
  );
  function point(event: React.PointerEvent) {
    const matrix = svg.current?.getScreenCTM()?.inverse();
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix,
    );
    return {
      x: Math.max(40, Math.min(860, p.x)),
      y: Math.max(40, Math.min(500, p.y)),
    };
  }
  return (
    <svg
      ref={svg}
      className="graph"
      viewBox="0 0 900 540"
      aria-label="Interactive network topology"
      onPointerMove={(e) => {
        if (!drag.current) return;
        const p = point(e);
        if (Math.hypot(p.x - drag.current.x, p.y - drag.current.y) > 3)
          drag.current.moved = true;
        if (drag.current.moved) onMove(drag.current.id, p.x, p.y);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <defs>
        <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#d5ded9" />
        </pattern>
      </defs>
      <rect width="900" height="540" fill="url(#dots)" />
      {topology.links.map((link) => {
        const a = topology.nodes.find((n) => n.id === link.from)!,
          b = topology.nodes.find((n) => n.id === link.to)!;
        const down = link.disabled || a.disabled || b.disabled,
          active =
            step?.from &&
            step.to &&
            [step.from, step.to].sort().join("/") ===
              [link.from, link.to].sort().join("/");
        const routed = routePairs.has([link.from, link.to].sort().join("/"));
        return (
          <g
            key={link.id}
            role="button"
            tabIndex={0}
            aria-label={`Link ${link.from} to ${link.to}, cost ${link.cost}${down ? ", disabled" : ""}`}
            onClick={() => onSelect(link.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(link.id);
              }
            }}
            className={`link ${selection === link.id ? "selected" : ""}`}
          >
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth="24"
            />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={
                down
                  ? "#b89391"
                  : active
                    ? "#c98735"
                    : routed
                      ? "#337763"
                      : "#b5c5bc"
              }
              strokeWidth={routed || active ? 5 : 2.5}
              strokeDasharray={down ? "7 7" : undefined}
            />
            <rect
              x={(a.x + b.x) / 2 - 16}
              y={(a.y + b.y) / 2 - 13}
              width="32"
              height="26"
              rx="3"
              fill="#fafbf8"
              stroke={selection === link.id ? "#337763" : "#d4ded7"}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 + 5}
              textAnchor="middle"
            >
              {link.cost}
            </text>
          </g>
        );
      })}
      {topology.nodes.map((node) => {
        const selected = selection === node.id,
          visited = step?.visited.includes(node.id);
        return (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            role="button"
            tabIndex={0}
            aria-label={`Router ${node.id}${node.disabled ? ", disabled" : ""}`}
            className="router"
            onPointerDown={(e) => {
              if (connect) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                id: node.id,
                x: node.x,
                y: node.y,
                moved: false,
              };
            }}
            onClick={() => {
              if (connect) {
                if (connecting === null) {
                  setConnecting(node.id);
                } else {
                  onConnect(`${connecting}/${node.id}`);
                  setConnecting(null);
                }
              } else onSelect(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(node.id);
              }
              const delta: Record<string, [number, number]> = {
                ArrowLeft: [-10, 0],
                ArrowRight: [10, 0],
                ArrowUp: [0, -10],
                ArrowDown: [0, 10],
              };
              if (delta[e.key]) {
                e.preventDefault();
                const [dx, dy] = delta[e.key];
                onMove(
                  node.id,
                  Math.max(40, Math.min(860, node.x + dx)),
                  Math.max(40, Math.min(500, node.y + dy)),
                );
              }
            }}
          >
            <circle
              r="32"
              fill={
                node.disabled
                  ? "#f1e4e1"
                  : path.includes(node.id)
                    ? "#337763"
                    : visited
                      ? "#ddece3"
                      : "#fffefa"
              }
              stroke={
                selected || connecting === node.id
                  ? "#c98735"
                  : node.disabled
                    ? "#b89391"
                    : "#337763"
              }
              strokeWidth={selected ? 4 : 2}
            />
            <path
              d="M-12 -5h24v10h-24z M-7 -1h2 M0 -1h2 M7 -1h2"
              stroke={path.includes(node.id) ? "#fff" : "#337763"}
              fill="none"
              strokeWidth="2"
            />
            <text y="51" textAnchor="middle">
              {node.id}
            </text>
            {node.id === source && !node.disabled && (
              <text y="-43" textAnchor="middle" className="endpoint">
                SOURCE
              </text>
            )}
            {node.id === destination &&
              !node.disabled &&
              node.id !== source && (
                <text y="-43" textAnchor="middle" className="endpoint">
                  DESTINATION
                </text>
              )}
            {node.disabled && (
              <text y="-43" textAnchor="middle" className="endpoint">
                OFFLINE
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
