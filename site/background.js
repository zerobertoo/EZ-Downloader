/* Fundo animado da landing: malha de nós conectados, como uma rede por onde
   o download passa. As conexões acendem e apagam em ondas lentas e alguns
   pacotes (círculos com brilho) caminham de nó em nó pelas arestas.

   Cores vêm das custom properties do tema, então o fundo troca junto com os
   5 temas sem duplicar tabela de cor. Custo por frame é baixo de propósito:
   as arestas são agrupadas em faixas de opacidade e desenhadas em poucos
   paths, e o brilho dos pacotes é um sprite pré-renderizado (nada de
   shadowBlur ou createLinearGradient dentro do loop).

   A parte pura (sem DOM) fica exportada pra ser testada isolada — ver
   background.test.mjs, no mesmo formato de asset-picker.test.mjs. */

const TAU = Math.PI * 2;

export function hexToRgb(hex) {
  const raw = String(hex).trim().replace("#", "");
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const n = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Espaçamento da malha: menor no celular pra rede não virar quatro pontos. */
export function gridSpacing(w) {
  return w < 640 ? 68 : 96;
}

/** Malha regular com jitter: continua lendo como grid, mas sem o aspecto de
 * papel milimetrado. Cada nó guarda as arestas que tocam nele (adj) pra os
 * pacotes poderem andar pela rede. */
export function buildGrid(w, h, spacing, rand = Math.random) {
  const cols = Math.max(2, Math.ceil(w / spacing) + 1);
  const rows = Math.max(2, Math.ceil(h / spacing) + 1);
  const offX = (w - (cols - 1) * spacing) / 2;
  const offY = (h - (rows - 1) * spacing) / 2;
  const jitter = spacing * 0.1;

  const nodes = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const bx = offX + c * spacing + (rand() - 0.5) * jitter;
      const by = offY + r * spacing + (rand() - 0.5) * jitter;
      nodes.push({
        bx,
        by,
        x: bx,
        y: by,
        phase: rand() * TAU,
        drift: 2 + rand() * 3,
        // O texto fica no centro: a malha abre espaço pra ele em vez de
        // disputar contraste com a headline.
        dim: centerFalloff(bx, by, w, h),
      });
    }
  }

  const at = (c, r) => r * cols + c;
  const edges = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (c + 1 < cols) edges.push(makeEdge(at(c, r), at(c + 1, r), rand));
      if (r + 1 < rows) edges.push(makeEdge(at(c, r), at(c, r + 1), rand));
    }
  }

  for (const node of nodes) node.adj = [];
  edges.forEach((e, i) => {
    nodes[e.a].adj.push(i);
    nodes[e.b].adj.push(i);
  });

  return { nodes, edges, cols, rows };
}

function makeEdge(a, b, rand) {
  return { a, b, phase: rand() * TAU, speed: 0.35 + rand() * 0.55 };
}

export function centerFalloff(x, y, w, h) {
  const dx = (x - w / 2) / (w / 2);
  const dy = (y - h / 2) / (h / 2);
  return 0.3 + 0.7 * Math.min(1, Math.hypot(dx, dy) / 0.75);
}

/** Próxima aresta do caminho: qualquer vizinha menos a que o pacote acabou de
 * percorrer, pra ele seguir adiante em vez de ficar indo e voltando. */
export function nextEdge(node, currentEdge, rand = Math.random) {
  const options = node.adj.filter((i) => i !== currentEdge);
  if (options.length === 0) return currentEdge;
  return options[Math.floor(rand() * options.length) % options.length];
}

/** Avança o pacote pela aresta atual; ao chegar no nó de destino, escolhe a
 * próxima aresta e devolve true (quem chama usa isso pra acender o nó). */
export function stepPacket(p, dt, nodes, edges, rand = Math.random) {
  const edge = edges[p.edge];
  const to = p.from === edge.a ? edge.b : edge.a;
  const len = Math.hypot(nodes[to].bx - nodes[p.from].bx, nodes[to].by - nodes[p.from].by) || 1;

  p.t += (p.speed * dt) / len;
  if (p.t < 1) return false;

  p.t = 0;
  p.from = to;
  p.edge = nextEdge(nodes[to], p.edge, rand);
  return true;
}

if (typeof document !== "undefined") initBackground();

function initBackground() {
  const canvas = document.getElementById("bgCanvas");
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;

  const GLOW_SIZE = 26;
  const EDGE_BANDS = 4; // faixas de opacidade: menos trocas de strokeStyle
  const FLASH_LIFE = 0.9;

  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  let w = 0;
  let h = 0;
  let nodes = [];
  let edges = [];
  let packets = [];
  let flashes = [];
  let accent = { r: 249, g: 115, b: 22 };
  let accentBright = { r: 251, g: 146, b: 60 };
  let glow = null;
  let running = false;
  let last = 0;
  let clock = 0;

  /** Brilho do pacote pré-renderizado: shadowBlur por frame é passe de blur na
   * CPU, um drawImage de 26px não é. */
  function buildGlow() {
    const c = document.createElement("canvas");
    c.width = GLOW_SIZE;
    c.height = GLOW_SIZE;
    const g = c.getContext("2d");
    const half = GLOW_SIZE / 2;
    const rad = g.createRadialGradient(half, half, 0, half, half, half);
    const rgb = `${accentBright.r}, ${accentBright.g}, ${accentBright.b}`;
    rad.addColorStop(0, `rgba(${rgb}, 1)`);
    rad.addColorStop(0.22, `rgba(${rgb}, 0.5)`);
    rad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = rad;
    g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    glow = c;
  }

  function readColors() {
    const style = getComputedStyle(root);
    accent = hexToRgb(style.getPropertyValue("--accent"));
    accentBright = hexToRgb(style.getPropertyValue("--accent-bright"));
    buildGlow();
  }

  function spawnPackets() {
    const count = w < 640 ? 4 : 7;
    packets = Array.from({ length: count }, () => {
      const edge = Math.floor(Math.random() * edges.length);
      return {
        edge,
        from: Math.random() < 0.5 ? edges[edge].a : edges[edge].b,
        t: Math.random(),
        speed: 70 + Math.random() * 90, // px/s
      };
    });
    flashes = [];
  }

  function resize() {
    // 1.5 já basta pra linha fina não serrilhar e evita backing store gigante
    // em telas grandes.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";

    ({ nodes, edges } = buildGrid(w, h, gridSpacing(w)));
    spawnPackets();
  }

  function draw() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    for (const n of nodes) {
      n.x = n.bx + Math.cos(clock * 0.24 + n.phase) * n.drift;
      n.y = n.by + Math.sin(clock * 0.31 + n.phase) * n.drift;
    }

    // Arestas: opacidade em onda lenta, agrupadas em faixas pra sair em
    // EDGE_BANDS paths em vez de um stroke por conexão.
    const bands = Array.from({ length: EDGE_BANDS }, () => []);
    for (const e of edges) {
      const wave = 0.5 + 0.5 * Math.sin(clock * e.speed + e.phase);
      const dim = (nodes[e.a].dim + nodes[e.b].dim) / 2;
      const level = Math.min(EDGE_BANDS - 1, Math.floor(wave * EDGE_BANDS * dim));
      bands[level].push(e);
    }

    ctx.lineWidth = 1;
    bands.forEach((band, i) => {
      if (band.length === 0) return;
      ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${0.05 + i * 0.045})`;
      ctx.beginPath();
      for (const e of band) {
        ctx.moveTo(nodes[e.a].x, nodes[e.a].y);
        ctx.lineTo(nodes[e.b].x, nodes[e.b].y);
      }
      ctx.stroke();
    });

    // Nós: um path por faixa, mesma ideia.
    const dots = [[], [], []];
    for (const n of nodes) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 0.5 + n.phase);
      dots[Math.min(2, Math.floor(pulse * 3 * n.dim))].push(n);
    }
    dots.forEach((group, i) => {
      if (group.length === 0) return;
      ctx.fillStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${0.16 + i * 0.15})`;
      ctx.beginPath();
      for (const n of group) {
        ctx.moveTo(n.x + 1.7, n.y);
        ctx.arc(n.x, n.y, 1.7, 0, TAU);
      }
      ctx.fill();
    });

    // Nó recém-visitado: anel curto, o "chegou aqui" da rede.
    for (const f of flashes) {
      const p = f.t / FLASH_LIFE;
      const n = nodes[f.node];
      ctx.strokeStyle = `rgba(${accentBright.r}, ${accentBright.g}, ${accentBright.b}, ${0.5 * (1 - p) ** 1.5})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3 + p * 16, 0, TAU);
      ctx.stroke();
    }

    // Pacotes: o elemento que se move e brilha.
    for (const p of packets) {
      const edge = edges[p.edge];
      const from = nodes[p.from];
      const to = nodes[p.from === edge.a ? edge.b : edge.a];
      const x = from.x + (to.x - from.x) * p.t;
      const y = from.y + (to.y - from.y) * p.t;

      if (glow) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(glow, x - GLOW_SIZE / 2, y - GLOW_SIZE / 2);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = `rgba(${accentBright.r}, ${accentBright.g}, ${accentBright.b}, 0.95)`;
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, TAU);
      ctx.fill();
    }
  }

  function frame(now) {
    if (!running) return;
    // Volta de aba escondida não deve teleportar tudo de uma vez.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    clock += dt;

    for (const p of packets) {
      if (stepPacket(p, dt, nodes, edges)) flashes.push({ node: p.from, t: 0 });
    }
    for (const f of flashes) f.t += dt;
    flashes = flashes.filter((f) => f.t < FLASH_LIFE);

    draw();
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced.matches) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  readColors();
  resize();

  if (reduced.matches) {
    draw(); // frame único: a rede continua desenhada, só não se mexe
  } else {
    start();
  }

  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      if (!running) draw();
    }, 180);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      stop();
      draw();
    } else {
      start();
    }
  });

  // O tema é trocado no meio da animação do seletor; reler as custom
  // properties aqui evita duplicar a tabela de cores dos temas. Nada de
  // resize: a malha e o backing store continuam os mesmos.
  new MutationObserver(() => {
    readColors();
    if (!running) draw();
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}
