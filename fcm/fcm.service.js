// @path: fcm/fcm.service.js
import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getSession } from '../client/session.manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

export async function sendPushNotification(sessionId, message) {
  const session = getSession(sessionId);
  if (!session?.fcmToken) {
    console.log(`FCM token not found for session ${sessionId}. Skipping push notification.`);
    return;
  }

  const payload = {
    notification: {
      title: `New message from ${message.pushName || 'a contact'}`,
      body: message.body,
    },
    token: session.fcmToken
  };

  try {
    const response = await admin.messaging().send(payload);
    console.log('Successfully sent push notification:', response);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}
