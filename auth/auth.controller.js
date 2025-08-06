// @path: auth/auth.controller.js
import * as service from './auth.service.js';
import { wrapController } from '../utils/utils.js';

export const createSession = wrapController(service.createSession);
export const removeSession = wrapController(service.removeSession);
export const getQRCode     = wrapController(service.getQRCode);
export const checkAuth     = wrapController(service.checkAuth);

export const reload = wrapController(
  async ({ sessionId }) => {
    if (!sessionId) throw new Error('sessionId is required');
    await service.createSession(sessionId, true);
    return { reloaded: true };
  },
  { input: 'body' }
);
