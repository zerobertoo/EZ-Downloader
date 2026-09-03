import assert from "node:assert/strict";
import { pickAsset, detectOS, ASSET_PATTERNS } from "./asset-picker.js";

const assets = [
  { name: "EZ.Downloader_2.3.0_x64-setup.exe", browser_download_url: "u/exe" },
  { name: "EZ.Downloader_2.3.0_x64.dmg", browser_download_url: "u/dmg-intel" },
  { name: "EZ.Downloader_2.3.0_aarch64.dmg", browser_download_url: "u/dmg-arm" },
  { name: "EZ.Downloader_2.3.0_amd64.AppImage", browser_download_url: "u/appimage" },
  { name: "EZ.Downloader_2.3.0_amd64.deb", browser_download_url: "u/deb" },
  { name: "EZ.Downloader-2.3.0-1.x86_64.rpm", browser_download_url: "u/rpm" },
  { name: "latest.json", browser_download_url: "u/manifest" },
];

for (const { key } of ASSET_PATTERNS) {
  const picked = pickAsset(assets, key);
  assert.ok(picked, `esperava casar um asset pra ${key}`);
}

assert.equal(pickAsset(assets, "win").url, "u/exe");
assert.equal(pickAsset(assets, "mac-intel").url, "u/dmg-intel");
assert.equal(pickAsset(assets, "mac-arm").url, "u/dmg-arm");
assert.equal(pickAsset(assets, "linux-appimage").url, "u/appimage");
assert.equal(pickAsset(assets, "linux-deb").url, "u/deb");
assert.equal(pickAsset(assets, "linux-rpm").url, "u/rpm");
assert.equal(pickAsset(assets, "nao-existe"), null);
assert.equal(pickAsset([], "win"), null);

assert.equal(detectOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32"), "win");
assert.equal(detectOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", "MacIntel"), "mac-arm");
assert.equal(detectOS("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64"), "linux-appimage");
assert.equal(detectOS("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l"), null);
assert.equal(detectOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", "iPhone"), null);

console.log("asset-picker: todos os casos passaram");
