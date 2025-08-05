// @path: client/client.js

import fs from 'fs';
import logger from '../utils/logger.js';
import { initSession } from './session.manager.js';
import { SESSION_BASE_DIR } from '../config/config.js';

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
