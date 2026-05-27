import pool from '../models/db.js';

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
    const { conversationId, senderId, content } = data;
    if (!conversationId || !senderId || !content.trim()) return;

    const messageId = `m${Date.now()}`;
    const timestamp = new Date();
    const metadata = { status: 'sent', attachments: [] };

    try {
      // A. Write to PostgreSQL database
      await pool.query(
        `INSERT INTO messages (id, conversation_id, sender_id, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [messageId, conversationId, senderId, content.trim(), JSON.stringify(metadata), timestamp]
      );

      // B. Fetch sender details to attach profile info
      const senderResult = await pool.query('SELECT name FROM users WHERE id = $1', [senderId]);
      const senderName = senderResult.rows.length > 0 ? senderResult.rows[0].name : 'Unknown';

      const newMessage = {
        id: messageId,
        senderId,
        senderName,
        content: content.trim(),
        timestamp,
        status: 'sent',
        attachments: []
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
  socket.on('typing', (data) => {
    const { conversationId, userId, name, isTyping } = data;
    if (!conversationId || !userId) return;

    // Broadcast the typing event to all OTHER clients in the room
    socket.to(conversationId).emit('typing-status', { userId, name, isTyping });
  });
}
