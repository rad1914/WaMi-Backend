import { Router } from 'express';
import * as ctrl from './auth.controller.js';

const router = Router();

[
  ['post',   '/create', ctrl.createSession],
  ['delete', '/remove', ctrl.removeSession],
  ['get',    '/qr',     ctrl.getQRCode],
  ['get',    '/status', ctrl.checkAuth],
  ['post',   '/reload', ctrl.reload]
].forEach(([method, path, handler]) =>
  router[method](path, handler)
);

export default router;
