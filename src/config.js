const path = require("path");
const fs = require("fs");

/**
 * Configuração centralizada da aplicação
 * Lê dados do package.json para evitar duplicação
 */

const packageJsonPath = path.join(__dirname, "../package.json");

let packageJson = {};
try {
  const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
  packageJson = JSON.parse(packageJsonContent);
} catch (error) {
  console.error("Erro ao ler package.json:", error);
}

/**
 * Configuração da aplicação
 */
const config = {
  version: packageJson.version || "1.0.0",
  name: packageJson.name || "ez-downloader",
  description:
    packageJson.description ||
    "A user-friendly desktop application for downloading videos",
  author: packageJson.author || "zerobertoo",
  license: packageJson.license || "MIT",
  repository:
    packageJson.repository?.url ||
    "https://github.com/zerobertoo/EZ-Downloader",
  app: {
    name: "EZ Downloader",
    displayName: "EZ Downloader",
  },
  update: {
    repo: "zerobertoo/EZ-Downloader",
    updateInterval: "1 hour",
  },
  isDev: process.env.NODE_ENV || "development",
  debug: process.env.DEBUG || "true",
};

module.exports = config;
