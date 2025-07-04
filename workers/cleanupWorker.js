// src/cleanupWorker.js
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { deleteSessionData } from '../database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Umbral de inactividad para sesiones en memoria (24 h), congelado para evitar cambios
const STALE_SESSION_THRESHOLD_MS = Object.freeze(24 * 60 * 60 * 1000);

/**
 * Elimina recursivamente carpetas vacías dentro de `dir`.
 * @param {string} dir - Ruta de la carpeta a inspeccionar.
 * @param {object} logger - Logger con métodos info, warn, error.
 * @returns {Promise<number>} Número de carpetas eliminadas.
 */
async function deleteEmptyFolders(dir, logger = console) {
  let deletedCount = 0;

  try {
    await fs.access(dir);
  } catch {
    // No existe: nada que hacer
    return 0;
  }

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.error(`No se pudo leer el directorio ${dir}:`, err);
    return 0;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subdir = path.join(dir, entry.name);
      // Recurse
      deletedCount += await deleteEmptyFolders(subdir, logger);
    }
  }

  // Verificamos de nuevo tras eliminar subcarpetas
  let remaining;
  try {
    remaining = await fs.readdir(dir);
  } catch (err) {
    logger.error(`Error al listar ${dir}:`, err);
    return deletedCount;
  }

  if (remaining.length === 0) {
    try {
      // Node 16+ recomienda fs.rm con recursive y force
      await fs.rm(dir, { recursive: true, force: true });
      deletedCount++;
      logger.info(`Deleted empty folder: ${dir}`);
    } catch (err) {
      logger.error(`Failed to delete folder ${dir}:`, err);
    }
  }

  return deletedCount;
}

/**
 * Limpia carpetas de sesiones de autenticación vacías.
 */
async function cleanupAuthSessionDirs({ AUTH_SESSIONS_DIR, logger }) {
  try {
    const count = await deleteEmptyFolders(AUTH_SESSIONS_DIR, logger);
    if (count > 0) {
      logger.info(`Removed ${count} empty auth session folder(s).`);
    }
    return count;
  } catch (err) {
    logger.error(`Error cleaning auth session dirs at "${AUTH_SESSIONS_DIR}":`, err);
    return 0;
  }
}

/**
 * Limpia sesiones en memoria que estén no autenticadas o inactivas.
 */
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
      } else if (
        session.lastActivity != null &&
        now - session.lastActivity > STALE_SESSION_THRESHOLD_MS
      ) {
        shouldCleanup = true;
        reason = 'Session in memory is stale (inactive)';
      }

      if (shouldCleanup) {
        logger.warn(`[${id}] ${reason} (lastActivity: ${session.lastActivity}), cleaning up.`);
        const logoutFn = createOnLogout(id);
        if (typeof logoutFn === 'function') {
          logoutFn();
        } else {
          logger.error(`[${id}] createOnLogout did not return a function.`);
        }
        cleanedCount++;
      }
    } catch (e) {
      logger.error(
        `[${id}] Error during in-memory session cleanup, forcing removal:`,
        e
      );
      const logoutFn = createOnLogout(id);
      if (typeof logoutFn === 'function') {
        logoutFn();
      }
      cleanedCount++;
    }
  }

  return cleanedCount;
}

/**
 * Elimina carpetas de sesiones huérfanas en disco y su información en BD.
 */
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

    logger.warn(
      `Found ${orphanDirs.length} orphan session folder(s) on disk, cleaning up.`
    );

    const results = await Promise.allSettled(
      orphanDirs.map(async id => {
        const orphanPath = path.join(SESSIONS_DIR, id);
        // Borramos datos en base de datos
        await deleteSessionData(id);
        // Borrado recursivo en disco
        await fs.rm(orphanPath, { recursive: true, force: true });
        logger.info(
          `[${id}] Deleted orphan session folder and associated database data.`
        );
      })
    );

    results.forEach((res, idx) => {
      const id = orphanDirs[idx];
      if (res.status === 'fulfilled') {
        cleanedCount++;
      } else {
        logger.error(`[${id}] Failed to delete orphan session:`, res.reason);
      }
    });
  } catch (e) {
    if (e.code !== 'ENOENT') {
      logger.error('Error during orphan session folder cleanup:', e);
    } else {
      logger.info(
        `Sessions directory "${SESSIONS_DIR}" does not exist; skipping on-disk cleanup.`
      );
    }
  }

  return cleanedCount;
}

/**
 * Orquesta las tareas de limpieza de sesiones.
 */
export async function runCleanupWorker({
  sessions = new Map(),
  SESSIONS_DIR = path.resolve(__dirname, '../sessions'),
  AUTH_SESSIONS_DIR = path.resolve(__dirname, '../auth_sessions'),
  createOnLogout = () => () => {},
  logger = console,
} = {}) {
  logger.info('Running session cleanup worker...');

  // Ejecutar en paralelo ya que no dependen entre sí
  const [
    authCleaned,
    memoryCleaned,
    orphanCleaned
  ] = await Promise.all([
    cleanupAuthSessionDirs({ AUTH_SESSIONS_DIR, logger }),
    // envolver en Promise.resolve para metodología uniforme
    Promise.resolve(cleanupInMemorySessions({ sessions, createOnLogout, logger })),
    cleanupOrphanSessions({ sessions, SESSIONS_DIR, logger })
  ]);

  const totalCleaned = authCleaned + memoryCleaned + orphanCleaned;

  if (totalCleaned > 0) {
    logger.info(`Session cleanup worker finished. Cleaned ${totalCleaned} item(s).`);
  } else {
    logger.info('Session cleanup worker finished. No invalid items found.');
  }

  return totalCleaned;
}

runCleanupWorker();
