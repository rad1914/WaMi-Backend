// @path: routes/chat.js
import express from 'express';
import auth from '../middleware/auth.js';
import { normalizeJid } from '../whatsapp-service.js';
import {
  getChats,
  resetChatUnreadCount,
  getMessagesByJid,
  getReactionsForMessages,
} from '../database.js';
import { logger } from '../logger.js';

const router = express.Router();

router.get('/chats', auth, (req, res) => {
  try {
    const chats = getChats.all({ session_id: req.session.id });
    res.json(chats);
  } catch (e) {
    logger.error(`[${req.session.id}] /chats failed`, e);
    res.status(500).json({ error: 'Failed to fetch chats.' });
  }
});

router.get('/history/:jid', auth, (req, res) => {
  const jid = normalizeJid(decodeURIComponent(req.params.jid));
  if (!jid) {
    return res.status(400).json({ error: 'Invalid JID provided.' });
  }
  
  try {
    resetChatUnreadCount.run({ session_id: req.session.id, jid });

    const messageRows = getMessagesByJid.all({
      session_id: req.session.id,
      jid,
      limit: req.query.limit || 100
    });

    if (!messageRows.length) {
        return res.json([]);
    }

    const messageIds = messageRows.map(m => m.id);
    const reactionsData = getReactionsForMessages.all(JSON.stringify(messageIds));

    const reactionsMap = new Map();
    for (const reaction of reactionsData) {
        if (!reactionsMap.has(reaction.message_id)) {
            reactionsMap.set(reaction.message_id, {});
        }
        const messageReactions = reactionsMap.get(reaction.message_id);
        const emojiCount = messageReactions[reaction.emoji] || 0;
        messageReactions[reaction.emoji] = emojiCount + 1;
    }

    const messages = messageRows.map(m => ({
        ...m,
        reactions: reactionsMap.get(m.id) || {},
    })).reverse();

    res.json(messages);
  } catch (e) {
    logger.error(`[${req.session.id}] /history failed for jid ${jid}`, e);
    res.status(500).json({ error: 'Failed to fetch message history.' });
  }
});

router.post('/history/sync/:jid', auth, async (req, res) => {
  try {
    const count = await req.session.fetchMoreMessages(req.params.jid);
    res.json({ success: true, message: `Fetched ${count} older messages.` });
  } catch (e) {
    logger.error(`[${req.session.id}] /history/sync failed`, e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
