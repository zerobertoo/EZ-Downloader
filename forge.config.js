const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");
const fs = require("fs");
const path = require("path");

if (process.env.GITHUB_TOKEN) {
  require("dotenv").config();
}

const osxSignConfig = process.env.APPLE_IDENTITY
  ? {
      osxSign: { identity: process.env.APPLE_IDENTITY },
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
    }
  : {};

// Include the whole resources/bin/ directory so the platform subfolder
// structure is preserved inside <resources>/bin/<platform>/<binary>
const binDir = path.join("resources", "bin");
const extraResource = fs.existsSync(binDir) ? [binDir] : [];

module.exports = {
  packagerConfig: {
    name: "EZ Downloader",
    executableName: "ez-downloader",
    appBundleId: "com.ezdownloader.app",
    asar: {
      unpack: "**/node_modules/ffmpeg-static/**",
    },
    arch: process.env.TARGET_ARCH || "x64",
    appCategoryType: "public.app-category.utilities",
    extraResource,
    ...osxSignConfig,
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {},
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "zerobertoo",
          name: "EZ-Downloader",
        },
        draft: false,
        prerelease: process.env.PRERELEASE === "true",
        authToken: process.env.GITHUB_TOKEN,
        generateReleaseNotes: true,
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
