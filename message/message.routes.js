// @path: message/message.routes.js
import { Router } from 'express';
import { checkSession } from '../middlewares/checkSession.js';
import { controllers } from './message.controller.js';

const router = Router();
router.use(checkSession);

Object.keys(controllers).forEach(action =>
  router.post(`/${action}`, controllers[action])
);

export default router;
