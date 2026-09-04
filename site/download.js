import { ASSET_PATTERNS, pickAsset, detectOS } from "./asset-picker.js";

const REPO = "zerobertoo/EZ-Downloader";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CACHE_KEY = "ez-latest-release";
const CACHE_TTL_MS = 10 * 60 * 1000;

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

function setCta(url, label) {
  const btn = document.getElementById("downloadBtn");
  btn.href = url;
  document.getElementById("downloadBtnLabel").textContent = label;
  btn.classList.remove("is-loading");
}

function setFallback() {
  const btn = document.getElementById("downloadBtn");
  btn.href = RELEASES_URL;
  document.getElementById("downloadBtnLabel").textContent = "Ver todos os downloads no GitHub";
  btn.classList.remove("is-loading");
  document.getElementById("detectNote").hidden = false;
}

function renderSwitcher(release, activeKey) {
  const wrap = document.getElementById("osSwitcher");
  wrap.innerHTML = "";
  for (const p of ASSET_PATTERNS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "os-pill" + (p.key === activeKey ? " is-active" : "");
    btn.setAttribute("aria-pressed", String(p.key === activeKey));
    btn.textContent = p.label;
    btn.addEventListener("click", () => selectOS(release, p.key));
    wrap.appendChild(btn);
  }
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
  renderSwitcher(release, key);
}

async function init() {
  let release = null;
  try {
    release = await fetchLatestRelease();
  } catch {
    setFallback();
    renderSwitcher(null, null);
    return;
  }

  const detected = detectOS(navigator.userAgent, navigator.platform);
  if (detected) {
    selectOS(release, detected);
  } else {
    setFallback();
    renderSwitcher(release, null);
  }
}

init();
