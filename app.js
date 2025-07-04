// @path: app.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { createWhatsappSession } from './whatsapp-service.js';
import { db, deleteSessionData } from './database.js';
import { runCleanupWorker } from './workers/cleanupWorker.js';

import sessionRoutes from './routes/session.js';
import chatRoutes from './routes/chat.js';
import messageRoutes from './routes/message.js';
import mediaRoutes from './routes/media.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || '*' } });
app.set('io', io);

const PORT = process.env.PORT || 3007;
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';
const AUTH_SESSIONS_DIR = path.resolve('./auth_sessions');
export const sessions = new Map();

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.use(express.json());

io.use((socket, next) => {
  const sid = socket.handshake.auth.token;
  if (sessions.has(sid)) return next();
  next(new Error('Invalid session'));
});

io.on('connection', socket => {
  const sid = socket.handshake.auth.token;
  const session = sessions.get(sid);
  if (!session) return socket.disconnect(true);

  socket.join(sid);
  if (session.isAuthenticated) socket.emit('authenticated');
});

app.use('/session', sessionRoutes);
app.use(chatRoutes);
app.use(messageRoutes);
app.use(mediaRoutes);

export const createOnLogout = (id) => () => {
  fs.rmSync(path.join(SESSIONS_DIR, id), { recursive: true, force: true });
  deleteSessionData(id);
  sessions.delete(id);
};

function restoreSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  fs.readdirSync(SESSIONS_DIR).forEach(id => {
    const fullPath = path.join(SESSIONS_DIR, id);
    if (fs.statSync(fullPath).isDirectory()) {
      const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: io.to(id) };
      sessions.set(id, session);
      createWhatsappSession(session, createOnLogout(id));
    }
  });
}

const listener = server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
  restoreSessions();

  // Run cleanup on startup
  runCleanupWorker({
    sessions,
    SESSIONS_DIR,
    AUTH_SESSIONS_DIR,
    createOnLogout,
    logger: console
  });
});

// Schedule cleanup every 8 hours
setInterval(() => {
  runCleanupWorker({
    sessions,
    SESSIONS_DIR,
    AUTH_SESSIONS_DIR,
    createOnLogout,
    logger: console
  });
}, 8 * 60 * 60 * 1000); // 8 hours in milliseconds

['SIGINT', 'SIGTERM'].forEach(sig =>
  process.on(sig, async () => {
    console.log(`Received ${sig}, cleaning up before shutdown...`);
    await runCleanupWorker({
      sessions,
      SESSIONS_DIR,
      AUTH_SESSIONS_DIR,
      createOnLogout,
      logger: console
    });

    listener.close(() => {
      sessions.forEach(s => s.sock?.end?.(new Error('Server shutting down')));
      db.close(() => process.exit(0));
    });
  })
);
