import pool from '../models/db.js';

// 1. Get all chats/conversations for a user
export const getChats = async (req, res) => {
  const currentUserId = req.query.userId || 'current'; // Default to 'current' for local mock auth

  try {
    // A. Fetch all conversations the current user is a part of
    const chatsResult = await pool.query(
      `SELECT c.id, c.type, c.group_name, c.group_avatar
       FROM conversations c
       JOIN conversation_users cu ON c.id = cu.conversation_id
       WHERE cu.user_id = $1`,
      [currentUserId]
    );

    const chats = [];

    // B. For each conversation, fetch members and latest message details
    for (const chat of chatsResult.rows) {
      // Fetch all participants
      const membersResult = await pool.query(
        `SELECT u.id, u.name, u.avatar, u.status
         FROM users u
         JOIN conversation_users cu ON u.id = cu.user_id
         WHERE cu.conversation_id = $1`,
        [chat.id]
      );

      const participants = membersResult.rows;
      const otherUser = participants.find(p => p.id !== currentUserId) || null;

      // Fetch the latest message
      const latestMsgResult = await pool.query(
        `SELECT m.sender_id, m.content, m.created_at, m.metadata
         FROM messages m
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [chat.id]
      );

      let lastMessage = '';
      let lastMessageTime = new Date();
      let unreadCount = 0;

      if (latestMsgResult.rows.length > 0) {
        const msg = latestMsgResult.rows[0];
        lastMessage = msg.content;
        lastMessageTime = msg.created_at;

        // Add sender prefix for group chats
        if (chat.type === 'group') {
          const sender = participants.find(p => p.id === msg.sender_id);
          const senderName = sender ? sender.name : 'Unknown';
          lastMessage = `${senderName}: ${msg.content}`;
        }
      }

      // Count unread messages sent by others
      const unreadResult = await pool.query(
        `SELECT COUNT(*) FROM messages 
         WHERE conversation_id = $1 
           AND sender_id != $2 
           AND (metadata->>'status' = 'sent' OR metadata->>'status' = 'delivered')`,
        [chat.id, currentUserId]
      );
      unreadCount = parseInt(unreadResult.rows[0].count);

      // Structure response based on direct vs group chat to match frontend schema
      if (chat.type === 'group') {
        chats.push({
          id: chat.id,
          type: 'group',
          group: {
            name: chat.group_name,
            avatar: chat.group_avatar,
            participants: participants.filter(p => p.id !== currentUserId)
          },
          lastMessage,
          lastMessageTime,
          unreadCount
        });
      } else {
        chats.push({
          id: chat.id,
          type: 'direct',
          user: otherUser,
          lastMessage,
          lastMessageTime,
          unreadCount
        });
      }
    }

    // Sort chats by latest message time descending
    chats.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

    res.status(200).json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 2. Get full message stream for a specific conversation
export const getMessages = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT m.id, m.sender_id, u.name as sender_name, m.content, m.created_at as timestamp, m.metadata
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    const formattedMessages = result.rows.map(msg => ({
      id: msg.id,
      senderId: msg.sender_id,
      senderName: msg.sender_name,
      content: msg.content,
      timestamp: msg.timestamp,
      status: msg.metadata?.status || 'sent',
      attachments: msg.metadata?.attachments || []
    }));

    res.status(200).json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
