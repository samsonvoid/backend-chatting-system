import pool from '../models/db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function registerChatHandlers(io, socket) {
  
  // 1. Client joins a conversation room
  socket.on('join-chat', (conversationId) => {
    socket.join(conversationId);
    console.log(`Socket [${socket.id}] joined room: ${conversationId}`);
  });

  // 2. Client leaves a conversation room
  socket.on('leave-chat', (conversationId) => {
    socket.leave(conversationId);
    console.log(`Socket [${socket.id}] left room: ${conversationId}`);
  });

  // 3. Client sends a real-time message
  socket.on('send-message', async (data) => {
    const { conversationId, senderId, content, tempId, attachment } = data;
    if (!conversationId || !senderId || (!content.trim() && !attachment)) return;

    const messageId = `m${Date.now()}`;
    const timestamp = new Date();
    
    let attachmentInfo = null;

    if (attachment && attachment.data && attachment.name) {
      try {
        const match = attachment.data.match(/^data:(.+);base64,(.+)$/);
        if (match) {
          const fileType = match[1];
          const base64Data = match[2];
          const buffer = Buffer.from(base64Data, 'base64');
          
          const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          
          const uniqueFilename = `${Date.now()}-${attachment.name.replace(/\s+/g, '_')}`;
          const filePath = path.join(uploadsDir, uniqueFilename);
          fs.writeFileSync(filePath, buffer);
          
          attachmentInfo = {
            name: attachment.name,
            type: attachment.type || fileType,
            size: attachment.size,
            url: `/uploads/${uniqueFilename}`
          };
        }
      } catch (fileErr) {
        console.error('[Socket] Error writing attachment buffer:', fileErr);
      }
    }

    const metadata = { 
      status: 'sent',
      ...(attachmentInfo ? { attachment: attachmentInfo } : {})
    };

    try {
      // A. Write to PostgreSQL database
      await pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId, conversationId, senderId, content.trim(), JSON.stringify(metadata), timestamp]
      );

      // B. Fetch sender details to attach profile info
      const senderResult = await pool.query('SELECT name, avatar FROM users WHERE id = $1', [senderId]);
      const senderName = senderResult.rows.length > 0 ? senderResult.rows[0].name : 'Unknown';
      const senderAvatar = senderResult.rows.length > 0 ? senderResult.rows[0].avatar : 'SO';

      const newMessage = {
        id: messageId,
        conversationId,
        senderId,
        senderName,
        senderAvatar,
        content: content.trim(),
        timestamp,
        status: 'sent',
        attachment: attachmentInfo || undefined,
        tempId
      };

      // C. Broadcast the new message to everyone in that conversation room
      io.to(conversationId).emit('message-received', newMessage);
      console.log(`[Socket] Message from ${senderName} persisted and sent to room ${conversationId}`);

    } catch (error) {
      console.error('[Socket] Error persisting and broadcasting message:', error);
      socket.emit('message-error', { error: 'Failed to send message.' });
    }
  });

  // 4. Client is typing
  socket.on('typing', async (data) => {
    const { conversationId, isTyping } = data;
    const userId = socket.user?.id;
    if (!conversationId || !userId) return;

    try {
      const userResult = await pool.query('SELECT name, avatar FROM users WHERE id = $1', [userId]);
      const name = userResult.rows.length > 0 ? userResult.rows[0].name : 'Someone';
      const avatar = userResult.rows.length > 0 ? userResult.rows[0].avatar : 'SO';

      // Broadcast the typing event to all OTHER clients in the room
      socket.to(conversationId).emit('typing-status', { conversationId, userId, name, avatar, isTyping });
    } catch (err) {
      console.error('[Socket] Error in typing status lookup:', err);
    }
  });

  // 5. Client marks message as delivered
  socket.on('message-delivered', async (data) => {
    const { messageId, conversationId } = data;
    if (!messageId || !conversationId) return;

    try {
      await pool.query(
        `UPDATE messages 
         SET metadata = jsonb_set(metadata, '{status}', '"delivered"') 
         WHERE id = $1 AND metadata->>'status' = 'sent'`,
        [messageId]
      );
      io.to(conversationId).emit('message-status-changed', {
        messageId,
        conversationId,
        status: 'delivered'
      });
    } catch (err) {
      console.error('[Socket] Error updating delivered status:', err);
    }
  });

  // 6. Client marks messages as read
  socket.on('message-read', async (data) => {
    const { conversationId, userId } = data;
    if (!conversationId || !userId) return;

    try {
      const { rowCount } = await pool.query(
        `UPDATE messages 
         SET metadata = jsonb_set(metadata, '{status}', '"read"') 
         WHERE conversation_id = $1 AND sender_id != $2 AND metadata->>'status' IN ('sent', 'delivered')`,
        [conversationId, userId]
      );
      if (rowCount > 0) {
        io.to(conversationId).emit('messages-read', {
          conversationId,
          readerId: userId
        });
      }
    } catch (err) {
      console.error('[Socket] Error updating read status:', err);
    }
  });

  // 7. Client deletes a message
  socket.on('delete-message', async (data) => {
    const { messageId, conversationId } = data;
    const userId = socket.user?.id;
    if (!messageId || !conversationId || !userId) return;

    try {
      // Delete message from database (only if the sender matches the authenticated socket user)
      const { rowCount } = await pool.query(
        'DELETE FROM messages WHERE id = $1 AND sender_id = $2',
        [messageId, userId]
      );

      if (rowCount > 0) {
        // Broadcast the deletion to everyone in that conversation room
        io.to(conversationId).emit('message-deleted', { messageId, conversationId });
        console.log(`[Socket] Message ${messageId} deleted by sender ${userId} in room ${conversationId}`);
      }
    } catch (err) {
      console.error('[Socket] Error deleting message:', err);
    }
  });
}
