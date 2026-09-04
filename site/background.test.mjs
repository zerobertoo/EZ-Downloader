import assert from "node:assert/strict";
import {
  hexToRgb,
  gridSpacing,
  buildGrid,
  centerFalloff,
  nextEdge,
  stepPacket,
} from "./background.js";

assert.deepEqual(hexToRgb("#f97316"), { r: 249, g: 115, b: 22 });
assert.deepEqual(hexToRgb("f97316"), { r: 249, g: 115, b: 22 });
assert.deepEqual(hexToRgb("  #fff  "), { r: 255, g: 255, b: 255 });
assert.deepEqual(hexToRgb("#0a0709"), { r: 10, g: 7, b: 9 });
assert.deepEqual(hexToRgb("nope"), { r: 255, g: 255, b: 255 }, "hex inválido cai no branco");

assert.ok(gridSpacing(375) < gridSpacing(1440), "celular usa malha mais fechada");

// Centro apaga, borda acende: é o que abre espaço pro texto do hero.
assert.ok(centerFalloff(500, 400, 1000, 800) < centerFalloff(0, 0, 1000, 800));
assert.ok(centerFalloff(0, 0, 1000, 800) <= 1);
assert.ok(centerFalloff(500, 400, 1000, 800) >= 0.3);

const { nodes, edges, cols, rows } = buildGrid(400, 300, 100, () => 0.5);
assert.equal(nodes.length, cols * rows);
assert.equal(edges.length, (cols - 1) * rows + cols * (rows - 1), "só arestas ortogonais");
for (const n of nodes) assert.ok(n.adj.length >= 2, "todo nó tem pelo menos duas conexões");
for (const [i, e] of edges.entries()) {
  assert.ok(nodes[e.a].adj.includes(i) && nodes[e.b].adj.includes(i), "adjacência nos dois lados");
}

// nextEdge nunca devolve a aresta de onde o pacote veio (havendo alternativa).
const node = nodes[edges[0].b];
for (const r of [0, 0.3, 0.99]) {
  const chosen = nextEdge(node, 0, () => r);
  assert.notEqual(chosen, 0);
  assert.ok(node.adj.includes(chosen), "escolhe uma aresta que toca o nó");
}
assert.equal(nextEdge({ adj: [7] }, 7, () => 0), 7, "sem alternativa, mantém a aresta");

// Pacote atravessa a aresta e salta pro nó vizinho.
const edge = edges[0];
const p = { edge: 0, from: edge.a, t: 0, speed: 100 };
assert.equal(stepPacket(p, 0.1, nodes, edges, () => 0), false, "no meio do caminho não salta");
assert.ok(p.t > 0 && p.t < 1);

const arrived = stepPacket(p, 10, nodes, edges, () => 0);
assert.equal(arrived, true, "ao chegar no nó, sinaliza");
assert.equal(p.from, edge.b, "passa a sair do nó de destino");
assert.equal(p.t, 0);
assert.ok(nodes[p.from].adj.includes(p.edge), "a nova aresta toca o nó atual");
assert.notEqual(p.edge, 0, "não volta pela aresta de onde veio");

console.log("background: todos os casos passaram");
