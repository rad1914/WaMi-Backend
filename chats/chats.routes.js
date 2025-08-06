// @path: chats/chats.routes.js
import { Router } from 'express';
import { attachSession } from '../middlewares/attachSession.js';
import * as ctrl from './chats.controller.js';

const router = Router();

router.use(attachSession);

router.get('/', ctrl.getAllChats);
router.get('/:jid', ctrl.getChatByJid);

export default router;
