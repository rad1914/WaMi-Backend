// @path: chats/chats.routes.js
import { Router } from 'express';
import { attachSession } from '../middlewares/attachSession.js';
import { getChatsHandler } from './chats.controller.js';

const router = Router();

router.use(attachSession);

router.get('/', getChatsHandler);
router.get('/:jid', getChatsHandler);

export default router;
