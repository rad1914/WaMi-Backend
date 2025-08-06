// @path: message/message.routes.js
import { Router } from 'express';
import { attachSession } from '../middlewares/attachSession.js';
import { controllers } from './message.controller.js';

const router = Router();

// Usamos el middleware común
router.use(attachSession);

Object.keys(controllers).forEach(action =>
  router.post(`/${action}`, controllers[action])
);

export default router;
