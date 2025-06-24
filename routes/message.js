// @path: routes/message.js
import express from 'express';
import { body } from 'express-validator';
import auth from '../middleware/auth.js';
import validate from '../middleware/validator.js';
import { normalizeJid } from '../whatsapp-service.js';
import { getMessageKeyDetails } from '../database.js';
import { logger } from '../logger.js';

const router = express.Router();

router.post('/send',
  auth,
  validate([
    body('jid').isString().notEmpty(),
    body('text').isString().notEmpty(),
    body('tempId').isString().notEmpty(),
  ]),
  async (req, res) => {
    try {
      const { jid, text, tempId } = req.body;
      const fullJid = normalizeJid(jid);
      if (!fullJid) return res.status(400).json({ error: "Invalid JID" });

      const msg = await req.session.messageQueue.add(
        () => req.session.sock.sendMessage(fullJid, { text })
      );
      
      res.json({ success: true, messageId: msg.key.id, tempId, timestamp: Date.now() });
    } catch (e) {
      logger.error(`[${req.session.id}] /send failed`, e);
      res.status(500).json({ error: e.message, tempId: req.body.tempId });
    }
  }
);

router.post('/send/reaction',
  auth,
  validate([
    body('jid').isString().notEmpty(),
    body('messageId').isString().notEmpty(),
    body('emoji').isString().notEmpty(),
  ]),
  async (req, res) => {
    try {
      const { jid, messageId, emoji } = req.body;
      const normalizedJid = normalizeJid(jid);
      if (!normalizedJid) return res.status(400).json({ error: "Invalid JID" });

      const messageDetails = getMessageKeyDetails.get({
        message_id: messageId,
        session_id: req.session.id,
      });

      if (!messageDetails) {
        return res.status(404).json({ error: 'Message not found in database.' });
      }
      
      const key = {
        remoteJid: normalizedJid,
        id: messageId,
        fromMe: !!messageDetails.isOutgoing,
      };

      if (!key.fromMe && messageDetails.participant) {
        key.participant = messageDetails.participant;
      }
      
      await req.session.messageQueue.add(
        () => req.session.sock.sendMessage(key.remoteJid, { react: { text: emoji, key } })
      );

      res.json({ success: true });
    } catch (e) {
      logger.error(`[${req.session.id}] /send/reaction failed`, e);
      res.status(500).json({ error: e.message });
    }
  }
);

export default router;
