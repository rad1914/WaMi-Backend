// @path: client/client.js

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { initSession } from './session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

function deleteEmptyDirsRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      deleteEmptyDirsRecursive(fullPath);
    }
  }

  // After processing subdirectories, check if current is now empty
  const remaining = fs.readdirSync(dirPath);
  if (remaining.length === 0) {
    fs.rmdirSync(dirPath);
    logger.info(`🗑️ Deleted empty directory: ${dirPath}`);
  }
}

export async function initClient() {
  if (!fs.existsSync(SESSION_BASE_DIR)) {
    fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    logger.info(`📂 Created sessions directory at ${SESSION_BASE_DIR}`);
  }

  try {
    const sessionDirs = fs.readdirSync(SESSION_BASE_DIR, { withFileTypes: true })
      .filter(dir => dir.isDirectory() && dir.name !== 'auth')
      .map(dir => dir.name);

    for (const id of sessionDirs) {
      const sessionPath = path.join(SESSION_BASE_DIR, id);

      // Eliminar subdirectorios vacíos dentro del subdirectorio de sesión
      const innerDirs = fs.readdirSync(sessionPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(sessionPath, entry.name));

      for (const subdir of innerDirs) {
        deleteEmptyDirsRecursive(subdir);
      }

      try {
        await initSession(id);
        logger.info(`✅ [${id}] session restored`);
      } catch (err) {
        logger.warn(`⚠️ Failed to restore session '${id}': ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`❌ Failed to scan session directories: ${err.message}`);
  }
}
