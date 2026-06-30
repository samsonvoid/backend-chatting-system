import webPush from 'web-push';
import pool from '../models/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize VAPID Keys securely
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

const keysFilePath = path.join(__dirname, '..', '..', '.vapid-keys.json');

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  if (fs.existsSync(keysFilePath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
      vapidKeys.publicKey = fileData.publicKey;
      vapidKeys.privateKey = fileData.privateKey;
      console.log('✅ Loaded persisted VAPID keys from .vapid-keys.json');
    } catch (err) {
      console.error('Failed to parse VAPID keys file:', err);
    }
  }

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    console.log('⚠️ VAPID keys missing. Generating new persisted VAPID keys...');
    const generated = webPush.generateVAPIDKeys();
    vapidKeys = generated;
    try {
      fs.writeFileSync(keysFilePath, JSON.stringify(generated, null, 2), 'utf8');
      console.log('✅ Persisted new VAPID keys to .vapid-keys.json');
    } catch (err) {
      console.error('Failed to save VAPID keys file:', err);
    }
  }
}

webPush.setVapidDetails(
  'mailto:samsonprogrammer@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

/**
 * Checks if Do Not Disturb is active for the user based on server time
 */
function isDNDActive(settings) {
  if (!settings.dnd_start || !settings.dnd_end) return false;

  const now = new Date();
  const currentTimeString = now.toTimeString().split(' ')[0]; // 'HH:MM:SS'

  const start = settings.dnd_start;
  const end = settings.dnd_end;

  if (start < end) {
    return currentTimeString >= start && currentTimeString <= end;
  } else {
    // Overlap midnight (e.g. 22:00 to 07:00)
    return currentTimeString >= start || currentTimeString <= end;
  }
}

/**
 * Send notification to a receiver
 */
export async function sendNotification({
  receiverId,
  senderId,
  type,
  title,
  body,
  chatId,
  messageId,
  priority = 'High'
}) {
  if (receiverId === senderId) return null;

  try {
    // 1. Fetch recipient settings
    const settingsResult = await pool.query(
      'SELECT * FROM user_notification_settings WHERE user_id = $1',
      [receiverId]
    );
    const settings = settingsResult.rows[0] || {
      sound: true,
      vibration: true,
      popup: true,
      show_preview: true,
      push_enabled: true,
      email_enabled: true,
      dnd_start: null,
      dnd_end: null
    };

    // 2. Check if conversation is muted
    const muteResult = await pool.query(
      'SELECT mute_until FROM conversation_mute WHERE conversation_id = $1 AND user_id = $2',
      [chatId, receiverId]
    );
    const isMuted = muteResult.rows.length > 0 && new Date(muteResult.rows[0].mute_until) > new Date();

    // 3. Check DND
    const dndActive = isDNDActive(settings);

    // 4. Save notification log to database for Notification Center (History)
    const notificationId = `n-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await pool.query(
      `INSERT INTO notifications (id, receiver_id, sender_id, type, title, body, chat_id, message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [notificationId, receiverId, senderId, type, title, body, chatId, messageId]
    );

    // If DND is active, we lower the priority and disable sound/vibration
    const finalSound = dndActive ? false : settings.sound;
    const finalVibrate = dndActive ? false : settings.vibration;
    const finalPopup = dndActive ? false : settings.popup;

    // 5. If conversation is muted, or user disabled push, do not send push notification
    if (isMuted || !settings.push_enabled) {
      console.log(`[NotificationService] Notification saved to history but push skipped (Muted: ${isMuted}, PushEnabled: ${settings.push_enabled})`);
      return { notificationId, savedToHistory: true, pushSent: false };
    }

    // 6. Fetch push tokens for receiver
    const tokensResult = await pool.query(
      'SELECT id, device_token FROM push_tokens WHERE user_id = $1',
      [receiverId]
    );

    if (tokensResult.rows.length === 0) {
      return { notificationId, savedToHistory: true, pushSent: false, reason: 'No registered push tokens' };
    }

    // Prepare Push Payload
    const notificationPayload = {
      title,
      body: settings.show_preview ? body : 'New message received',
      tag: chatId || 'chat-alert',
      data: {
        chatId,
        messageId,
        type,
        receiverId
      },
      sound: finalSound,
      vibrate: finalVibrate,
      popup: finalPopup,
      priority
    };

    let pushSentCount = 0;

    for (const row of tokensResult.rows) {
      try {
        const subscription = JSON.parse(row.device_token);
        await webPush.sendNotification(subscription, JSON.stringify(notificationPayload));
        pushSentCount++;
      } catch (err) {
        console.error(`[NotificationService] Failed to send push to token ${row.id}:`, err.message);
        
        // Clean up invalid/expired push subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[NotificationService] Deleting expired push token ${row.id}`);
          await pool.query('DELETE FROM push_tokens WHERE id = $1', [row.id]);
        }
      }
    }

    return {
      notificationId,
      savedToHistory: true,
      pushSent: pushSentCount > 0,
      recipientsCount: pushSentCount
    };

  } catch (error) {
    console.error('[NotificationService] Error in sendNotification:', error);
    return null;
  }
}

export { vapidKeys };
