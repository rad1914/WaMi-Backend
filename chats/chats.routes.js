// @path: chats/chats.routes.js
import { Router } from 'express';
import { attachSession } from '../middlewares/attachSession.js';
import { getChatsHandler, getChatMessagesHandler } from './chats.controller.js';

const router = Router();

router.use(attachSession);

// IMPORTANT: put the more specific route first so "messages" doesn't get treated as a jid
router.get('/:jid/messages', getChatMessagesHandler);

router.get('/', getChatsHandler);
router.get('/:jid', getChatsHandler);

export default router;
