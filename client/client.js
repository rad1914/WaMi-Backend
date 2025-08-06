// @path: client/client.js

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { initSession } from './session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

function deleteEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      deleteEmptyDirs(fullPath);
    }
  }
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    logger.info(`🗑️ Deleted empty directory: ${dir}`);
  }
}

export async function initClient() {
  if (!fs.existsSync(SESSION_BASE_DIR)) {
    fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    logger.info(`📂 Created ${SESSION_BASE_DIR}`);
  }

  try {
    for (const dirent of fs.readdirSync(SESSION_BASE_DIR, { withFileTypes: true })) {
      if (!dirent.isDirectory() || dirent.name === 'auth') continue;

      const sessionId = dirent.name;
      const sessionPath = path.join(SESSION_BASE_DIR, sessionId);

      for (const sub of fs.readdirSync(sessionPath, { withFileTypes: true })) {
        if (sub.isDirectory()) deleteEmptyDirs(path.join(sessionPath, sub.name));
      }

      try {
        await initSession(sessionId);
        logger.info(`✅ [${sessionId}] session restored`);
      } catch (err) {
        logger.warn(`⚠️ Failed to restore session '${sessionId}': ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`❌ Failed to scan sessions: ${err.message}`);
  }
}
