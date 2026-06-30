import pool from '../models/db.js';
import { vapidKeys, sendNotification } from '../services/notificationService.js';

// Expose VAPID Public Key for client subscription setup
export async function getVapidPublicKey(req, res) {
  return res.json({ publicKey: vapidKeys.publicKey });
}

// Register a push token
export async function registerPushToken(req, res) {
  const { token, deviceType } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Push subscription token is required.' });
  }

  const tokenId = `pt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const stringifiedToken = typeof token === 'string' ? token : JSON.stringify(token);

  try {
    await pool.query(
      `INSERT INTO push_tokens (id, user_id, device_token, device_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, device_token) 
       DO UPDATE SET last_seen = CURRENT_TIMESTAMP`,
      [tokenId, userId, stringifiedToken, deviceType || 'browser']
    );

    return res.json({ success: true, message: 'Push token registered successfully.' });
  } catch (error) {
    console.error('Error registering push token:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Deregister push token (on logout)
export async function deregisterPushToken(req, res) {
  const { token } = req.body;
  const userId = req.user.id;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Push subscription token is required.' });
  }

  const stringifiedToken = typeof token === 'string' ? token : JSON.stringify(token);

  try {
    await pool.query(
      'DELETE FROM push_tokens WHERE user_id = $1 AND device_token = $2',
      [userId, stringifiedToken]
    );

    return res.json({ success: true, message: 'Push token deregistered successfully.' });
  } catch (error) {
    console.error('Error deregistering push token:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Fetch historical notifications
export async function getNotificationsList(req, res) {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT n.*, u.name as sender_name, u.avatar as sender_avatar
       FROM notifications n
       LEFT JOIN users u ON n.sender_id = u.id
       WHERE n.receiver_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching notifications list:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Mark single notification as read
export async function markNotificationRead(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND receiver_id = $2',
      [id, userId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Mark all notifications as read
export async function markAllNotificationsRead(req, res) {
  const userId = req.user.id;

  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE receiver_id = $1',
      [userId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Mark notifications for a specific room as read
export async function markRoomNotificationsRead(req, res) {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE receiver_id = $1 AND chat_id = $2',
      [userId, roomId]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking room notifications as read:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Fetch user notification preferences
export async function getNotificationSettings(req, res) {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT * FROM user_notification_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create defaults on-the-fly
      await pool.query(
        'INSERT INTO user_notification_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [userId]
      );
      const defaults = await pool.query(
        'SELECT * FROM user_notification_settings WHERE user_id = $1',
        [userId]
      );
      return res.json({ success: true, data: defaults.rows[0] });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Update notification preferences
export async function updateNotificationSettings(req, res) {
  const userId = req.user.id;
  const { sound, vibration, popup, show_preview, push_enabled, email_enabled, dnd_start, dnd_end } = req.body;

  try {
    await pool.query(
      `INSERT INTO user_notification_settings 
         (user_id, sound, vibration, popup, show_preview, push_enabled, email_enabled, dnd_start, dnd_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         sound = COALESCE(EXCLUDED.sound, user_notification_settings.sound),
         vibration = COALESCE(EXCLUDED.vibration, user_notification_settings.vibration),
         popup = COALESCE(EXCLUDED.popup, user_notification_settings.popup),
         show_preview = COALESCE(EXCLUDED.show_preview, user_notification_settings.show_preview),
         push_enabled = COALESCE(EXCLUDED.push_enabled, user_notification_settings.push_enabled),
         email_enabled = COALESCE(EXCLUDED.email_enabled, user_notification_settings.email_enabled),
         dnd_start = EXCLUDED.dnd_start,
         dnd_end = EXCLUDED.dnd_end`,
      [
        userId,
        sound !== undefined ? sound : null,
        vibration !== undefined ? vibration : null,
        popup !== undefined ? popup : null,
        show_preview !== undefined ? show_preview : null,
        push_enabled !== undefined ? push_enabled : null,
        email_enabled !== undefined ? email_enabled : null,
        dnd_start || null,
        dnd_end || null
      ]
    );

    return res.json({ success: true, message: 'Notification settings updated.' });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Mute a conversation
export async function muteConversation(req, res) {
  const userId = req.user.id;
  const { id: chatId } = req.params;
  const { duration } = req.body; // '8h', '1w', 'forever'

  if (!duration) {
    return res.status(400).json({ success: false, message: 'Mute duration is required.' });
  }

  let muteUntil = new Date();
  if (duration === '8h') {
    muteUntil.setHours(muteUntil.getHours() + 8);
  } else if (duration === '1w') {
    muteUntil.setDate(muteUntil.getDate() + 7);
  } else if (duration === 'forever') {
    muteUntil.setFullYear(muteUntil.getFullYear() + 100);
  } else {
    return res.status(400).json({ success: false, message: 'Invalid mute duration. Use 8h, 1w, or forever.' });
  }

  try {
    await pool.query(
      `INSERT INTO conversation_mute (conversation_id, user_id, mute_until)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id) 
       DO UPDATE SET mute_until = EXCLUDED.mute_until`,
      [chatId, userId, muteUntil]
    );

    return res.json({ success: true, message: `Chat muted until ${muteUntil.toLocaleString()}`, muteUntil });
  } catch (error) {
    console.error('Error muting conversation:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Unmute a conversation
export async function unmuteConversation(req, res) {
  const userId = req.user.id;
  const { id: chatId } = req.params;

  try {
    await pool.query(
      'DELETE FROM conversation_mute WHERE conversation_id = $1 AND user_id = $2',
      [chatId, userId]
    );

    return res.json({ success: true, message: 'Chat unmuted.' });
  } catch (error) {
    console.error('Error unmuting conversation:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Get list of muted conversations for the current user
export async function getMutedConversations(req, res) {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT conversation_id, mute_until FROM conversation_mute WHERE user_id = $1 AND mute_until > NOW()',
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching muted conversations:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
}

// Quick Reply endpoint for Service Worker actions
export async function quickReplyMessage(req, res) {
  const { chatId, content } = req.body;
  const senderId = req.user.id;

  if (!chatId || !content || !content.trim()) {
    return res.status(400).json({ success: false, message: 'chatId and content are required.' });
  }

  const messageId = `m${Date.now()}`;
  const timestamp = new Date();
  const metadata = { status: 'sent' };

  try {
    await pool.query(
      `INSERT INTO messages (id, conversation_id, sender_id, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [messageId, chatId, senderId, content.trim(), JSON.stringify(metadata), timestamp]
    );

    // Fetch sender details
    const senderResult = await pool.query('SELECT name, avatar FROM users WHERE id = $1', [senderId]);
    const senderName = senderResult.rows.length > 0 ? senderResult.rows[0].name : 'Unknown';
    const senderAvatar = senderResult.rows.length > 0 ? senderResult.rows[0].avatar : 'SO';

    const newMessage = {
      id: messageId,
      conversationId: chatId,
      senderId,
      senderName,
      senderAvatar,
      content: content.trim(),
      timestamp,
      status: 'sent'
    };

    if (global.io) {
      // 1. Broadcast the message to active socket clients in room
      global.io.to(chatId).emit('message-received', newMessage);

      // 2. Dispatch notifications to all other participants
      const participantsResult = await pool.query(
        'SELECT user_id FROM conversation_users WHERE conversation_id = $1 AND user_id != $2',
        [chatId, senderId]
      );
      
      const activeSockets = Array.from(global.io.sockets.sockets.values());

      for (const p of participantsResult.rows) {
        const participantId = p.user_id;

        const pSockets = activeSockets.filter(s => s.user && s.user.id === participantId);
        const isOnline = pSockets.length > 0;
        const isInRoom = pSockets.some(s => s.rooms.has(chatId));

        if (isOnline && isInRoom) continue;

        const convResult = await pool.query('SELECT type, group_name FROM conversations WHERE id = $1', [chatId]);
        const convType = convResult.rows[0]?.type || 'direct';
        const groupName = convResult.rows[0]?.group_name;

        const notifTitle = convType === 'group' 
          ? `New message in ${groupName || 'Group'}` 
          : `Message from ${senderName}`;
        
        const notifBody = content.trim();

        if (isOnline && !isInRoom) {
          for (const s of pSockets) {
            s.emit('notification-received', {
              id: `n-${Date.now()}`,
              senderId,
              senderName,
              senderAvatar,
              type: 'message',
              title: notifTitle,
              body: notifBody,
              chatId,
              messageId
            });
          }

          await sendNotification({
            receiverId: participantId,
            senderId,
            type: 'message',
            title: notifTitle,
            body: notifBody,
            chatId,
            messageId,
            priority: 'High'
          });
        } else {
          await sendNotification({
            receiverId: participantId,
            senderId,
            type: 'message',
            title: notifTitle,
            body: notifBody,
            chatId,
            messageId,
            priority: 'High'
          });
        }
      }
    }

    return res.json({ success: true, message: 'Quick reply sent successfully.', data: newMessage });
  } catch (error) {
    console.error('[QuickReply] Error sending message:', error);
    return res.status(500).json({ success: false, message: 'Failed to send quick reply.' });
  }
}
