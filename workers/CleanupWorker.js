// @path: workers/CleanupWorker.js
import fs from 'fs/promises';
import path from 'path';
import { deleteSessionData } from '../database.js';

const STALE_SESSION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function cleanupInMemorySessions({ sessions, createOnLogout, logger }) {
  let cleanedCount = 0;
  const now = Date.now();

  for (const [id, session] of sessions) {
    let shouldCleanup = false;
    let reason = '';

    try {
      if (!session.isAuthenticated) {
        shouldCleanup = true;
        reason = 'Session in memory is not authenticated';
      } 

      else if (session.lastActivity && (now - session.lastActivity > STALE_SESSION_THRESHOLD_MS)) {
        shouldCleanup = true;
        reason = 'Session in memory is stale (inactive)';
      }

      if (shouldCleanup) {
        logger.warn(`[${id}] ${reason}, cleaning up.`);
        createOnLogout(id)();
        cleanedCount++;
      }
    } catch (e) {
      logger.error(`[${id}] Error during in-memory session cleanup, forcing removal:`, e);

      createOnLogout(id)();
      cleanedCount++;
    }
  }
  return cleanedCount;
}

async function cleanupOrphanSessions({ sessions, SESSIONS_DIR, logger }) {
  let cleanedCount = 0;
  try {
    const dirents = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
    const orphanDirs = dirents
      .filter(dirent => dirent.isDirectory() && !sessions.has(dirent.name))
      .map(dirent => dirent.name);

    if (orphanDirs.length === 0) {
      return 0;
    }

    logger.warn(`Found ${orphanDirs.length} orphan session folder(s) on disk, cleaning up.`);

    const results = await Promise.allSettled(orphanDirs.map(async (id) => {
      const orphanPath = path.join(SESSIONS_DIR, id);

      await deleteSessionData(id);
      await fs.rm(orphanPath, { recursive: true, force: true });
      logger.info(`[${id}] Deleted orphan session folder and associated database data.`);
    }));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        cleanedCount++;
      } else {
        const id = orphanDirs[index];
        logger.error(`[${id}] Failed to delete orphan session:`, result.reason);
      }
    });

  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.error('Error during orphan session folder cleanup:', e);
    } else {
      logger.info(`Sessions directory "${SESSIONS_DIR}" does not exist; skipping on-disk cleanup.`);
    }
  }
  return cleanedCount;
}

export async function runCleanupWorker({
  sessions = new Map(),
  SESSIONS_DIR = './sessions',
  createOnLogout = () => () => {},
  logger = console,
} = {}) {
  logger.info('Running session cleanup worker...');
  let totalCleaned = 0;

  totalCleaned += cleanupInMemorySessions({ sessions, createOnLogout, logger });
  totalCleaned += await cleanupOrphanSessions({ sessions, SESSIONS_DIR, logger });

  if (totalCleaned > 0) {
    logger.info(`Session cleanup worker finished. Cleaned ${totalCleaned} item(s).`);
  } else {
    logger.info('Session cleanup worker finished. No invalid items found.');
  }
}
