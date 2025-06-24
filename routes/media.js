// @path: routes/media.js
import express from 'express';
import https from 'https';
import multer from 'multer';
import crypto from 'crypto';
import sanitize from 'sanitize-filename';
import { body } from 'express-validator';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { messageStore } from '../whatsapp-service.js';

import auth from '../middleware/auth.js';
import validate from '../middleware/validator.js';
import { normalizeJid } from '../whatsapp-service.js';
import { findMessageBySha256, getMessageById } from '../database.js';
import { logger } from '../logger.js';

const router = express.Router();
const httpsAgent = new https.Agent({ keepAlive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const sendPlaceholder = (res) => {
  const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
  res.end(img);
};

const getType = (m) => [
  'sticker', 'image', 'video', 'audio', 'document', 'conversation'
].find(type => m?.[`${type}Message`]);

router.get('/avatar/:jid', auth, async (req, res) => {
  try {
    const url = await req.session.sock.profilePictureUrl(req.params.jid, 'preview');
    https.get(url, { agent: httpsAgent }, (r) => {
      if (r.statusCode >= 400) return sendPlaceholder(res);
      res.writeHead(r.statusCode, {
        'Content-Type': r.headers['content-type'],
        'Cache-Control': 'public, max-age=86400'
      });
      r.pipe(res);
    }).on('error', () => sendPlaceholder(res));
  } catch {
    sendPlaceholder(res);
  }
});

router.get('/media/:messageId', auth, async (req, res) => {
  try {
    const { session, params: { messageId } } = req;
    let message = messageStore.get(messageId);

    if (!message) {
      const dbResult = getMessageById.get({ message_id: messageId, session_id: session.id });
      if (dbResult && dbResult.raw_message_data) {
        message = JSON.parse(dbResult.raw_message_data);
        messageStore.set(messageId, message);
      }
    }

    if (!message) {
      logger.warn(`[${session.id}] Media download request for unknown messageId: ${messageId}`);
      return res.status(404).json({ success: false, error: 'Media not found.' });
    }

    logger.info(`[${session.id}] Preparing to download media for message: ${messageId}`);

    const buffer = await downloadMediaMessage(message, 'buffer', {}, {
      logger,

    });

    logger.info(`[${session.id}] Download complete for message: ${messageId}. Size: ${buffer.length}`);
    
    const type = getType(message.message);
    const content = message.message[`${type}Message`] || message.message;
    
    res.set('Content-Type', content.mimetype || 'application/octet-stream');
    res.send(buffer);
  } catch (e) {
    logger.error({ err: e }, `[${session.id}] /media/${req.params.messageId} download failed`);
    res.status(500).json({ success: false, error: 'Failed to retrieve media from provider.' });
  }
});

router.post('/send/media',
  auth,
  upload.single('file'),
  validate([
    body('jid').isString().notEmpty(),
    body('tempId').isString().notEmpty(),
  ]),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    const { session, file } = req;
    const { jid, caption, tempId } = req.body;
    
    const fullJid = normalizeJid(jid);
    if (!fullJid) return res.status(400).json({ error: "Invalid JID" });

    try {
      const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const existingMedia = findMessageBySha256.get({ media_sha256: sha256 });

      if (existingMedia) {
        logger.info(`[${session.id}] Found existing media for JID ${jid} with SHA256 hash. Skipping re-upload to WhatsApp is not yet supported by Baileys, but logging for now.`);
      }

      const type = file.mimetype.startsWith('image/') ? 'image' :
                   file.mimetype.startsWith('video/') ? 'video' : 'document';
      
      let content = { [type]: file.buffer, mimetype: file.mimetype };
      if (type === 'image' || type === 'video') content.caption = caption;
      if (type === 'document') content.fileName = sanitize(file.originalname);

      const sent = await session.messageQueue.add(
        () => session.sock.sendMessage(fullJid, content)
      );
      
      res.json({ success: true, messageId: sent.key.id, tempId });
    } catch (e) {
      logger.error(`[${session.id}] /send/media failed`, e);
      res.status(500).json({ error: e.message, tempId: req.body.tempId });
    }
  }
);

export default router;
