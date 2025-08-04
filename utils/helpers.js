// @path: utils/helpers.js
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import logger from './logger.js';

const pendingQRs = new Map();

export const getPendingQR = sessionId => pendingQRs.get(sessionId) || null;

export const registerSocketEvents = (sock, sessionId, saveCreds, reinitFn) => {

};

export const wrapController = fn => async (req, res) => {
  try {
    const input = req.method === 'GET' ? req.query : req.body;

    res.json(await fn(input, req));
  } catch (err) {
    const payload = { error: err.message };
    if (process.env.NODE_ENV === 'development') {
      payload.stack = err.stack;
    }
    res.status(500).json(payload);
  }
};
