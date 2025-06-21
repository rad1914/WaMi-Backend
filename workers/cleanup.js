// @path: workers/cleanup.js
import dotenv from 'dotenv';
import { db, deleteOldMessages, deleteOldReactions } from '../database.js';
import { logger } from '../logger.js';

dotenv.config();

const CLEANUP_DAYS = parseInt(process.env.CLEANUP_DAYS || '30', 10);

async function autoCleanup() {
  if (CLEANUP_DAYS <= 0) {
    logger.info('Auto cleanup is disabled as CLEANUP_DAYS is set to 0 or less.');
    return;
  }

  logger.info(`Starting auto cleanup for messages older than ${CLEANUP_DAYS} days.`);
  const cutoffTimestamp = Date.now() - (CLEANUP_DAYS * 24 * 60 * 60 * 1000);

  try {
    const cleanupDb = db.transaction(() => {
      // Primero borra reacciones de mensajes que serán borrados
      const reactionResult = deleteOldReactions.run({ cutoffTimestamp });
      const messageResult = deleteOldMessages.run({ cutoffTimestamp });
      if (messageResult.changes > 0 || reactionResult.changes > 0) {
        logger.info(`Deleted ${messageResult.changes} old messages and ${reactionResult.changes} associated reactions.`);
      }
      return { deletedMessages: messageResult.changes };
    });
    
    const { deletedMessages } = cleanupDb();
    if (deletedMessages === 0) {
        logger.info('Auto cleanup finished. No old items to process.');
    } else {
        logger.info(`Auto cleanup finished. Successfully cleaned up old database entries.`);
    }

  } catch (e) {
    logger.error('Auto cleanup process failed', e);
  } finally {
    db.close((err) => {
        if (err) {
            logger.error('Error closing DB after cleanup', err);
        }
    });
  }
}

autoCleanup();
