// Lógica pura de detecção de SO e escolha de asset — sem DOM, sem fetch,
// pra poder ser testada isolada (ver asset-picker.test.mjs).

export const ASSET_PATTERNS = [
  { key: "win", label: "Windows", suffix: "_x64-setup.exe" },
  { key: "mac-arm", label: "macOS (Apple Silicon)", suffix: "_aarch64.dmg" },
  { key: "mac-intel", label: "macOS (Intel)", suffix: "_x64.dmg" },
  { key: "linux-appimage", label: "Linux (AppImage)", suffix: "_amd64.AppImage" },
  { key: "linux-deb", label: "Linux (.deb)", suffix: "_amd64.deb" },
  { key: "linux-rpm", label: "Linux (.rpm)", suffix: "-1.x86_64.rpm" },
];

/** @param {{name: string, browser_download_url: string}[]} assets */
export function pickAsset(assets, key) {
  const pattern = ASSET_PATTERNS.find((p) => p.key === key);
  if (!pattern) return null;
  const asset = assets.find((a) => a.name.endsWith(pattern.suffix));
  if (!asset) return null;
  return { url: asset.browser_download_url, name: asset.name, label: pattern.label };
}

/** Apple Silicon é o palpite padrão pra Mac: não existe sinal confiável de
 * Intel vs ARM em navigator.userAgent (Safari reporta o mesmo em ambos por
 * causa do Rosetta). */
export function detectOS(userAgent, platform) {
  const ua = `${userAgent} ${platform}`.toLowerCase();
  if (ua.includes("win")) return "win";
  if (ua.includes("mac")) return "mac-arm";
  if (ua.includes("linux") && !ua.includes("android")) return "linux-appimage";
  return null;
}
