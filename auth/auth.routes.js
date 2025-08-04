// @path: auth/auth.routes.js
import { Router } from 'express';
import {
  createSession,
  removeSession,
  getQRCode,
  checkAuth
} from './auth.controller.js';
import { wrapController } from '../utils/helpers.js';

const router = Router();

router.post('/create', createSession);
router.delete('/remove', removeSession);
router.get('/qr', getQRCode);
router.get('/status', checkAuth);

// new: manual reload endpoint for a session
router.post(
  '/reload',
  wrapController(async body => {
    const { sessionId } = body;
    if (!sessionId) throw new Error('sessionId is required');
    // force reinit without disrupting others
    await initSession(sessionId, true);
    return { reloaded: true };
  })
);

export default router;
