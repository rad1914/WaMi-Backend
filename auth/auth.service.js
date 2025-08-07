// @path: auth/auth.service.js
import { initSession, deleteSession, getSession } from '../client/session.manager.js';
import { getPendingQR } from '../utils/helpers.js';
import { randomUUID } from 'crypto';

const error = (msg, status) => Object.assign(new Error(msg), { status });

export async function createSession() {
  const sessionId = randomUUID();
  await initSession(sessionId);
  return { sessionId };
}

export async function removeSession({ sessionId }) {
  if (!sessionId) throw error('sessionId is required', 400);
  await deleteSession(sessionId);
  return { success: true };
}

export async function getQRCode({ sessionId }) {
  if (!sessionId) throw error('sessionId is required', 400);
  const { sock } = await initSession(sessionId);
  if (sock.user?.id) return { success: true };
  const qr = getPendingQR(sessionId);
  if (qr) return { qr };
  throw error('QR not yet available', 404);
}

export function checkAuth({ sessionId }) {
  if (!sessionId) throw error('sessionId is required', 400);
  return { authenticated: !!getSession(sessionId).user?.id };
}
