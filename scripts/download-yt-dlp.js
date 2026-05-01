'use strict';

// Downloads yt-dlp binaries from GitHub Releases into resources/bin/<platform>/
// Usage: node scripts/download-yt-dlp.js [platform...]
//   Platforms: linux, win32, darwin (defaults to current platform)
// Example: node scripts/download-yt-dlp.js linux win32 darwin

const https = require('https');
const fs = require('fs');
const path = require('path');

const BINARIES = {
  win32:  { filename: 'yt-dlp.exe',    asset: 'yt-dlp.exe'    },
  darwin: { filename: 'yt-dlp',        asset: 'yt-dlp_macos'  },
  linux:  { filename: 'yt-dlp',        asset: 'yt-dlp'        },
};

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { ...options, headers: { 'User-Agent': 'ez-downloader/1.0' } }, (res) => {
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

async function main() {
  const requested = process.argv.slice(2);
  const platforms = requested.length > 0 ? requested : [process.platform];

  const unknown = platforms.filter((p) => !BINARIES[p]);
  if (unknown.length > 0) {
    console.error(`Unknown platform(s): ${unknown.join(', ')}`);
    console.error(`Valid: ${Object.keys(BINARIES).join(', ')}`);
    process.exit(1);
  }

  console.log('Fetching yt-dlp latest release info...');
  const release = await fetchJson(
    'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
  );
  console.log(`Latest version: ${release.tag_name}`);

  for (const platform of platforms) {
    const { filename, asset } = BINARIES[platform];
    const releaseAsset = release.assets.find((a) => a.name === asset);
    if (!releaseAsset) {
      console.error(`  [${platform}] Asset not found: ${asset}`);
      continue;
    }

    const destPath = path.join('resources', 'bin', platform, filename);
    console.log(`  [${platform}] Downloading ${asset} → ${destPath}`);
    await downloadFile(releaseAsset.browser_download_url, destPath);

    if (platform !== 'win32') {
      fs.chmodSync(destPath, 0o755);
    }

    console.log(`  [${platform}] Done (${(fs.statSync(destPath).size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
