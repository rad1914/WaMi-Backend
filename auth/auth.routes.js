// @path: auth/auth.routes.js
import { Router } from 'express';
import {
  createSession,
  removeSession,
  getQRCode,
  checkAuth,
  reload
} from './auth.controller.js';

const router = Router();

router.post('/create', createSession);
router.delete('/remove', removeSession);
router.get('/qr', getQRCode);
router.get('/status', checkAuth);
router.post('/reload', reload);

export default router;
