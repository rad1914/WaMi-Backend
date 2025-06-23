// @path: routes/session.js
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import { sessions, createOnLogout } from '../app.js';
import { createWhatsappSession } from '../whatsapp-service.js';
import { logger } from '../logger.js';
import auth from '../middleware/auth.js';

const router = express.Router();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './auth_sessions';

// Crea una nueva sesión y devuelve su ID único.
// El cliente debe almacenar este ID para futuras solicitudes.
router.post('/create', (req, res) => {
  const id = uuidv4();
  // La sesión se asocia con un namespace de socket.io para actualizaciones en tiempo real
  const session = { id, sock: null, isAuthenticated: false, latestQR: null, io: req.app.get('io').to(id) };
  sessions.set(id, session);
  createWhatsappSession(session, createOnLogout(id));
  res.json({ sessionId: id });
});

// Devuelve el estado de una sesión (conectada, QR pendiente)
// Se eliminó el middleware 'auth' para permitir la verificación de estado antes de la autenticación completa.
router.get('/status', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const session = sessions.get(token);

  if (!token || !session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing session token.' });
  }

  res.json({ connected: session.isAuthenticated, qr: session.latestQR });
});

// Cierra la sesión de WhatsApp, invalida las credenciales y elimina los archivos de sesión del servidor.
router.post('/logout', auth, async (req, res) => {
  try {
    // Cierra la conexión con WhatsApp
    await req.session.sock?.logout();
    // Ejecuta la limpieza (eliminar archivos de sesión, etc.)
    createOnLogout(req.session.id)(); 
    res.json({ success: true, message: "Session logged out and files removed." });
  } catch (e) {
    logger.error(`[${req.session.id}] /logout failed`, e);
    res.status(500).json({ success: false, error: 'Failed to logout session.' });
  }
});

// --- RUTAS DE IMPORTACIÓN/EXPORTACIÓN ELIMINADAS ---

export default router;
