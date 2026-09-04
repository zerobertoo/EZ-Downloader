import { ASSET_PATTERNS, pickAsset, detectOS } from "./asset-picker.js";

const REPO = "zerobertoo/EZ-Downloader";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CACHE_KEY = "ez-latest-release";
const CACHE_TTL_MS = 10 * 60 * 1000;
// Formatos que já têm um irmão "padrão" na mesma família de SO — mostrados
// com menos peso visual pra não competir com a opção que a maioria já usa.
const SECONDARY_ASSET_KEYS = new Set(["mac-intel", "linux-deb", "linux-rpm"]);
const SECURITY_WARNING_HINT =
  "Seu sistema pode alertar que o instalador não é reconhecido — normal em apps sem assinatura paga. Código aberto, confira o repositório abaixo.";

async function fetchLatestRelease() {
  const cached = readCache();
  if (cached) return cached;

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!res.ok) throw new Error(`GitHub API respondeu ${res.status}`);
  const data = await res.json();
  const release = {
    version: data.tag_name,
    assets: data.assets.map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })),
  };
  writeCache(release);
  return release;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { savedAt, release } = JSON.parse(raw);
    if (Date.now() - savedAt > CACHE_TTL_MS) return null;
    return release;
  } catch {
    return null;
  }
}

function writeCache(release) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), release }));
  } catch {
    // localStorage indisponível (modo privado etc.) — cache é só otimização, segue sem ele.
  }
}

// Só true quando o botão aponta pro instalador direto — no fallback ele leva
// pra página de releases do GitHub, e "confira sua pasta de Downloads" não
// faz sentido pra uma navegação de página.
let isDirectDownload = false;

function setCta(url, label) {
  const btn = document.getElementById("downloadBtn");
  btn.href = url;
  document.getElementById("downloadBtnLabel").textContent = label;
  btn.classList.remove("is-loading");
  document.getElementById("downloadHint").textContent = SECURITY_WARNING_HINT;
  isDirectDownload = true;
}

function setFallback() {
  const btn = document.getElementById("downloadBtn");
  btn.href = RELEASES_URL;
  document.getElementById("downloadBtnLabel").textContent = "Ver todos os downloads no GitHub";
  btn.classList.remove("is-loading");
  document.getElementById("detectNote").hidden = false;
  document.getElementById("downloadHint").textContent = "";
  isDirectDownload = false;
}

// Reforça a mesma mensagem no instante de maior ansiedade do fluxo: o clique.
function confirmDownloadStarted() {
  if (!isDirectDownload) return;
  document.getElementById("downloadHint").textContent =
    "Download iniciado — confira sua pasta de Downloads. " + SECURITY_WARNING_HINT;
}

function renderSwitcher(release, activeKey) {
  const wrap = document.getElementById("osSwitcher");
  wrap.innerHTML = "";
  for (const p of ASSET_PATTERNS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "os-pill" + (p.key === activeKey ? " is-active" : "") + (SECONDARY_ASSET_KEYS.has(p.key) ? " is-secondary" : "");
    btn.setAttribute("aria-pressed", String(p.key === activeKey));
    btn.textContent = p.label;
    btn.addEventListener("click", () => selectOS(release, p.key));
    wrap.appendChild(btn);
  }
}

function showSwitcher(release, activeKey) {
  document.getElementById("osToggle").hidden = true;
  document.getElementById("osSwitcher").hidden = false;
  renderSwitcher(release, activeKey);
}

function selectOS(release, key) {
  const picked = release && pickAsset(release.assets, key);
  if (picked) {
    const versionSuffix = release.version ? ` (${release.version})` : "";
    setCta(picked.url, `Baixar para ${picked.label}${versionSuffix}`);
    document.getElementById("detectNote").hidden = true;
  } else {
    setFallback();
  }
  // Só re-renderiza se o seletor já estiver visível (usuário abriu via
  // toggle ou a detecção falhou); com detecção automática ele fica
  // escondido e não precisa ser montado.
  if (!document.getElementById("osSwitcher").hidden) {
    renderSwitcher(release, key);
  }
}

async function init() {
  document.getElementById("downloadBtn").addEventListener("click", confirmDownloadStarted);

  let release = null;
  try {
    release = await fetchLatestRelease();
  } catch {
    setFallback();
    showSwitcher(null, null);
    return;
  }

  const detected = detectOS(navigator.userAgent, navigator.platform);
  if (detected) {
    selectOS(release, detected);
    const toggle = document.getElementById("osToggle");
    toggle.hidden = false;
    toggle.addEventListener("click", () => showSwitcher(release, detected), { once: true });
  } else {
    setFallback();
    showSwitcher(release, null);
  }
}

init();
