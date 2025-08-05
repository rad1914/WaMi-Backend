// @path: chats/chats.routes.js
import { Router } from 'express';
import { checkSession } from '../middlewares/checkSession.js';
import * as ctrl from './chats.controller.js';

const router = Router();
router.use(checkSession);

router.get('/', ctrl.getAllChats);
router.get('/:jid', ctrl.getChatByJid);
router.get('/pinned', ctrl.getPinnedChats);

export default router;
