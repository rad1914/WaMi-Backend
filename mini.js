// whatsapp-service.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import qr from 'qrcode';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const SESSIONS_DIR = path.resolve(process.cwd(), 'auth');

export async function createWhatsappSession(session, onLogout) {
  // 1️⃣ prepare auth folder
  const authPath = path.join(SESSIONS_DIR, session.id);
  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  // 2️⃣ fetch latest version and create socket
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    browser: Browsers.macOS('Desktop'),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
    printQRInTerminal: true,
  });

  // persist creds on update
  sock.ev.on('creds.update', saveCreds);

  // 3️⃣ handle connection updates
  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('✅ Connected!');

      // download and save own profile picture
      try {
        const myJid = sock.user.id;                         // your own JID
        const pfpUrl = await sock.profilePictureUrl(myJid, 'image');
        if (pfpUrl) {
          const resp = await axios.get(pfpUrl, { responseType: 'arraybuffer' });
          const out = path.join(authPath, 'profile.jpg');
          fs.writeFileSync(out, resp.data);
          console.log('📸 Saved profile picture to', out);
        } else {
          console.log('⚠️ No profile picture found for', myJid);
        }
      } catch (err) {
        console.error('❌ Failed to fetch/save profile picture', err);
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('🔌 Disconnected:', code);
      if (code !== 401) return;       // not a logout
      await sock.logout();
      onLogout && onLogout(session.id);
    }
  });

  // 4️⃣ (optional) handle QR codes
  sock.ev.on('connection.update', ({ qr: _qr }) => {
    if (_qr) {
      qr.toString(_qr, { type: 'terminal' }, (err, url) => {
        if (!err) console.log(url);
        session.latestQR = _qr;
      });
    }
  });

  // attach for external use
  session.sock = sock;
  return sock;
}
