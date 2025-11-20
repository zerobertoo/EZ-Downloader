const path = require("path");
const fs = require("fs");

/**
 * Configuração centralizada da aplicação
 * Lê dados do package.json para evitar duplicação
 */

// Caminho para o package.json
const packageJsonPath = path.join(__dirname, "../package.json");

// Ler o package.json
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
  // Versão da aplicação (lida do package.json)
  version: packageJson.version || "1.0.0",

  // Nome da aplicação
  name: packageJson.name || "ez-downloader",

  // Descrição
  description: packageJson.description || "A user-friendly desktop application for downloading videos",

  // Autor
  author: packageJson.author || "zerobertoo",

  // Licença
  license: packageJson.license || "MIT",

  // Repositório
  repository: packageJson.repository?.url || "https://github.com/zerobertoo/EZ-Downloader",

  // Informações da aplicação
  app: {
    name: "EZ Downloader",
    displayName: "EZ Downloader",
  },

  // Configurações de atualização
  update: {
    repo: "zerobertoo/EZ-Downloader",
    updateInterval: "1 hour",
  },

  // Configurações de desenvolvimento
  isDev: process.env.NODE_ENV === "development",
  debug: process.env.DEBUG === "true",
};

module.exports = config;
