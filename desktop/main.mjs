#!/usr/bin/env node
// Call of Karen: HOA Warfare — Desktop Wrapper (Electron / Node)
// Window defaults: 1920x1080, borderless fullscreen option, auto-hide menu bar.
// Serves local files via internal loopback HTTP server to eliminate CORS & file:// restrictions.
// Bridges Steamworks SDK to window.SteamAPI via preload script.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SteamAPI, ACHIEVEMENTS } from './steamworks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

/**
 * Creates internal loopback HTTP server binding only to 127.0.0.1.
 * Prevents CORS issues with ES modules, WebGL textures, and local JSON loads.
 */
export function startLoopbackServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      let reqPath = normalize(decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname));
      if (reqPath === '/' || reqPath.endsWith('/')) {
        reqPath += 'web/index.html';
      }

      const filePath = join(ROOT, reqPath.startsWith('/') ? reqPath.slice(1) : reqPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      try {
        const data = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(data);
      } catch (err) {
        res.writeHead(404).end('Not Found');
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const assignedPort = server.address().port;
      resolve({ server, port: assignedPort, url: `http://127.0.0.1:${assignedPort}/web/index.html` });
    });

    server.on('error', reject);
  });
}

// Window creation configuration
export const WINDOW_CONFIG = {
  width: 1920,
  height: 1080,
  minWidth: 1280,
  minHeight: 720,
  fullscreen: process.argv.includes('--fullscreen') || process.env.FULLSCREEN === '1',
  autoHideMenuBar: true,
  backgroundColor: '#0a0f1d',
  title: 'Call of Karen: HOA Warfare',
  webPreferences: {
    preload: join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    webSecurity: true
  }
};

/**
 * Main application launcher for Electron.
 */
async function runDesktop() {
  // Check if running inside Electron runtime
  const isElectron = Boolean(process.versions.electron);

  if (!isElectron) {
    console.log('=====================================================');
    console.log('  CALL OF KAREN: HOA WARFARE — DESKTOP WRAPPER       ');
    console.log('=====================================================');
    console.log('Starting internal loopback server...');
    const { port, url } = await startLoopbackServer(8642);
    console.log(`✅ Game server running at: ${url}`);
    console.log('To run inside native Electron window:');
    console.log('  npx electron desktop/main.mjs [--fullscreen]');
    console.log('=====================================================');
    return;
  }

  // Running inside Electron: dynamically import electron modules
  const { app, BrowserWindow, ipcMain, Menu } = await import('electron');

  // Initialize Steamworks Bridge early in main process
  SteamAPI.init();

  // Register synchronous and asynchronous IPC handlers for preload script
  ipcMain.on('steam:init-sync', (event, appId) => {
    event.returnValue = SteamAPI.init(appId);
  });

  ipcMain.on('steam:unlockAchievement', (event, achId) => {
    SteamAPI.unlockAchievement(achId);
  });

  ipcMain.on('steam:isAchievementUnlocked-sync', (event, achId) => {
    event.returnValue = SteamAPI.isAchievementUnlocked(achId);
  });

  ipcMain.on('steam:getStatus-sync', (event) => {
    event.returnValue = SteamAPI.getStatus();
  });

  ipcMain.handle('steam:getAchievements', () => {
    return SteamAPI.getAchievements();
  });

  let mainWindow = null;
  let loopback = null;

  async function createWindow() {
    loopback = await startLoopbackServer(0);

    const winOptions = {
      ...WINDOW_CONFIG,
      webPreferences: {
        ...WINDOW_CONFIG.webPreferences,
        preload: join(__dirname, 'preload.cjs')
      }
    };

    mainWindow = new BrowserWindow(winOptions);

    if (winOptions.autoHideMenuBar) {
      mainWindow.setAutoHideMenuBar(true);
      mainWindow.setMenuBarVisibility(false);
      Menu.setApplicationMenu(null);
    }

    // Toggle fullscreen with F11
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F11' && input.type === 'keyDown') {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        event.preventDefault();
      }
    });

    await mainWindow.loadURL(loopback.url);

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (loopback?.server) {
      loopback.server.close();
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Only auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDesktop().catch(err => {
    console.error('Fatal desktop launch error:', err);
    process.exit(1);
  });
}
