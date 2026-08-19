'use strict';

// Downloads yt-dlp and ffmpeg binaries into resources/bin/<platform>/, bundled
// as Tauri resources (see src-tauri/src/paths.rs).
// Usage: node scripts/download-yt-dlp.js [platform...]
//   Platforms: linux, win32, darwin (defaults to current platform)
// Example: node scripts/download-yt-dlp.js linux win32 darwin

const https = require('https');
const fs = require('fs');
const path = require('path');

const YTDLP_ASSETS = {
  win32:  { filename: 'yt-dlp.exe', asset: 'yt-dlp.exe'   },
  darwin: { filename: 'yt-dlp',     asset: 'yt-dlp_macos' },
  linux:  { filename: 'yt-dlp',     asset: 'yt-dlp'       },
};

const FFMPEG_ASSETS = {
  win32:  { filename: 'ffmpeg.exe', asset: 'ffmpeg-win32-x64' },
  darwin: { filename: 'ffmpeg',     asset: 'ffmpeg-darwin-x64'    },
  linux:  { filename: 'ffmpeg',     asset: 'ffmpeg-linux-x64'     },
};

// QuickJS-ng: runtime JS que o yt-dlp usa pra gerar o PO Token do YouTube.
// Sem ele o download de vídeos populares é cortado no meio com HTTP 403
// (reproduzido — ver comentário em src-tauri/src/download_manager.rs).
const QJS_ASSETS = {
  win32:  { filename: 'qjs.exe', asset: 'qjs-windows-x86_64.exe' },
  darwin: { filename: 'qjs',     asset: 'qjs-darwin-x86_64'      },
  linux:  { filename: 'qjs',     asset: 'qjs-linux-x86_64'       },
};

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'ez-downloader/1.0' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    https.get(url, { ...options, headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpsGet(res.headers.location, options).then(resolve).catch(reject);
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

async function fetchJson(url) {
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error(`JSON parse failed: ${e.message}`)); }
    });
    res.on('error', reject);
  });
}

async function downloadFile(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await httpsGet(url);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', reject);
  });
}

async function downloadBinary(label, repo, assetsByPlatform, platforms) {
  console.log(`Fetching ${label} latest release info...`);
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);

  if (!release.tag_name || !release.assets) {
    throw new Error(`GitHub API error: ${release.message || JSON.stringify(release)}`);
  }

  console.log(`${label} latest version: ${release.tag_name}`);

  for (const platform of platforms) {
    const { filename, asset } = assetsByPlatform[platform];
    const releaseAsset = release.assets.find((a) => a.name === asset);
    if (!releaseAsset) {
      console.error(`  [${label}/${platform}] Asset not found: ${asset}`);
      continue;
    }

    const destPath = path.join('resources', 'bin', platform, filename);
    console.log(`  [${label}/${platform}] Downloading ${asset} → ${destPath}`);
    await downloadFile(releaseAsset.browser_download_url, destPath);

    if (platform !== 'win32') {
      fs.chmodSync(destPath, 0o755);
    }

    console.log(`  [${label}/${platform}] Done (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

async function main() {
  const requested = process.argv.slice(2);
  const platforms = requested.length > 0 ? requested : [process.platform];

  const unknown = platforms.filter((p) => !YTDLP_ASSETS[p]);
  if (unknown.length > 0) {
    console.error(`Unknown platform(s): ${unknown.join(', ')}`);
    console.error(`Valid: ${Object.keys(YTDLP_ASSETS).join(', ')}`);
    process.exit(1);
  }

  await downloadBinary('yt-dlp', 'yt-dlp/yt-dlp', YTDLP_ASSETS, platforms);
  await downloadBinary('ffmpeg', 'eugeneware/ffmpeg-static', FFMPEG_ASSETS, platforms);
  await downloadBinary('quickjs', 'quickjs-ng/quickjs', QJS_ASSETS, platforms);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
