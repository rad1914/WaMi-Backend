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

  const contents = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const onlyCreds = contents.length === 1 && contents[0] === 'creds.json';

  if (contents.length === 0 || onlyCreds) {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.info(`🗑️ Deleted directory: ${dir} (${onlyCreds ? 'only creds.json' : 'empty'})`);
  }
}

export async function initClient() {
  if (!fs.existsSync(SESSION_BASE_DIR)) {
    fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
    logger.info(`📂 Created ${SESSION_BASE_DIR}`);
  }

  // Clean any empty or creds-only directories at startup
  deleteEmptyDirs(SESSION_BASE_DIR);

  try {
    for (const dirent of fs.readdirSync(SESSION_BASE_DIR, { withFileTypes: true })) {
      if (!dirent.isDirectory() || dirent.name === 'auth') continue;

      const sessionId = dirent.name;
      const sessionPath = path.join(SESSION_BASE_DIR, sessionId);

      // Clean empty/creds-only subdirectories inside this session before restore
      deleteEmptyDirs(sessionPath);

      // If cleanup removed the session directory entirely, skip restoration
      if (!fs.existsSync(sessionPath)) {
        logger.info(`🗑️ Skipping removed empty/creds-only session: ${sessionId}`);
        continue;
      }

      try {
        await initSession(sessionId);
        logger.info(`✅ [${sessionId}] session restored`);
      } catch (err) {
        logger.warn(`⚠️ Failed to restore session '${sessionId}': ${err.message}`);
        deleteEmptyDirs(sessionPath);
      }
    }
  } catch (err) {
    logger.error(`❌ Failed to scan sessions: ${err.message}`);
  }
}
