import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  historyFor,
  historyReducer,
  initialWorkspace,
  encodeWorkspace,
  decodeWorkspace,
  loadSharedWorkspace,
  shareLink,
} from "./workspace.ts";

const rawToken = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const payload = () =>
  JSON.parse(
    Buffer.from(encodeWorkspace(initialWorkspace()), "base64url").toString(),
  );

test("undo and redo restore topology and endpoints together; a new edit clears redo", () => {
  const original = initialWorkspace();
  const changed = {
    ...original,
    topology: {
      nodes: original.topology.nodes.slice(1),
      links: original.topology.links.filter(
        (l) => l.from !== "R1" && l.to !== "R1",
      ),
    },
    source: "R2",
    destination: "R6",
    scenario: -1,
  };
  let history = historyReducer(historyFor(original), {
    type: "edit",
    change: changed,
  });
  history = historyReducer(history, { type: "undo" });
  assert.deepEqual(history.present, original);
  history = historyReducer(history, { type: "redo" });
  assert.deepEqual(history.present, changed);
  history = historyReducer(history, { type: "undo" });
  history = historyReducer(history, {
    type: "edit",
    change: { algorithm: "dv" },
  });
  assert.equal(history.future.length, 0);
});

test("a complete drag is one edit and redo restores its final position", () => {
  const original = initialWorkspace();
  let history = historyFor(original);
  history = historyReducer(history, { type: "beginMove" });
  for (let x = 200; x < 250; x++)
    history = historyReducer(history, { type: "move", id: "R1", x, y: 300 });
  assert.equal(history.past.length, 0);
  history = historyReducer(history, { type: "endMove" });
  assert.equal(history.past.length, 1);
  history = historyReducer(history, { type: "undo" });
  assert.deepEqual(history.present, original);
  history = historyReducer(history, { type: "redo" });
  assert.equal(history.present.topology.nodes[0].x, 249);
});

test("no-op edits and clicks preserve redo, and history is bounded to 50 edits", () => {
  let history = historyReducer(historyFor(initialWorkspace()), {
    type: "edit",
    change: { source: "R2" },
  });
  history = historyReducer(history, { type: "undo" });
  history = historyReducer(history, { type: "beginMove" });
  history = historyReducer(history, { type: "endMove" });
  history = historyReducer(history, { type: "edit", change: { source: "R1" } });
  assert.equal(history.future.length, 1);
  for (let i = 0; i < 60; i++)
    history = historyReducer(history, {
      type: "move",
      id: "R1",
      x: i + 200,
      y: 300,
    });
  assert.equal(history.past.length, 50);
  assert.equal(history.future.length, 0);
});

test("share links round-trip failures, Unicode link IDs, endpoints and algorithm", () => {
  const workspace = initialWorkspace();
  workspace.topology.nodes[0] = {
    ...workspace.topology.nodes[0],
    x: 160.4,
    disabled: true,
  };
  workspace.topology.links[0] = {
    ...workspace.topology.links[0],
    id: "连接",
    disabled: true,
  };
  workspace.algorithm = "bf";
  const restored = decodeWorkspace(encodeWorkspace(workspace));
  assert.deepEqual(restored, {
    ...workspace,
    scenario: -1,
    topology: {
      ...workspace.topology,
      nodes: workspace.topology.nodes.map((n) => ({
        ...n,
        x: Math.round(n.x),
        y: Math.round(n.y),
      })),
    },
  });
  const url = new URL(
    shareLink("https://example.com/?old=value#old", workspace),
  );
  assert.equal(url.search, "");
  assert.deepEqual(loadSharedWorkspace(url.hash).workspace, restored);
});

test("malformed and unsupported shared networks safely fall back to the sample", () => {
  for (const token of [
    "bad!",
    "a".repeat(24001),
    rawToken({ v: 2 }),
    rawToken({ ...payload(), s: "missing" }),
    rawToken({ ...payload(), a: "__proto__" }),
    rawToken({ ...payload(), n: [null] }),
    rawToken({ ...payload(), l: [["bad", "R1", "R2", 0, 0]] }),
  ]) {
    assert.throws(() => decodeWorkspace(token));
    const loaded = loadSharedWorkspace("#network=" + token);
    assert.deepEqual(loaded.workspace, initialWorkspace());
    assert.match(loaded.message, /invalid/i);
  }
});

test("all routers offline can share empty endpoints", () => {
  const workspace = initialWorkspace();
  workspace.topology.nodes = workspace.topology.nodes.map((n) => ({
    ...n,
    disabled: true,
  }));
  workspace.source = workspace.destination = "";
  assert.equal(decodeWorkspace(encodeWorkspace(workspace)).source, "");
});
