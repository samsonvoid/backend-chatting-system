import pool from './src/models/db.js';

async function test() {
  try {
    const userId = 'current';
    const { rows: userConversations } = await pool.query(
      `SELECT c.id, c.type, c.group_name, c.group_avatar
       FROM conversations c
       JOIN conversation_users cu ON c.id = cu.conversation_id
       WHERE cu.user_id = $1`,
      [userId]
    );

    const formattedChats = [];

    for (const chat of userConversations) {
      const { rows: participants } = await pool.query(
        `SELECT u.id, u.name, u.avatar, u.status, u.email 
         FROM users u
         JOIN conversation_users cu ON u.id = cu.user_id
         WHERE cu.conversation_id = $1`,
        [chat.id]
      );

      const { rows: messages } = await pool.query(
        `SELECT m.content, m.created_at, m.status, u.name as sender_name
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [chat.id]
      );

      const lastMessage = messages.length > 0 ? messages[0] : null;

      let formattedChat = {
        id: chat.id,
        type: chat.type,
        unreadCount: 0,
        lastMessage: lastMessage 
          ? (chat.type === 'group' ? `${lastMessage.sender_name}: ${lastMessage.content}` : lastMessage.content) 
          : 'No messages yet',
        lastMessageTime: lastMessage ? lastMessage.created_at : new Date(),
      };

      if (chat.type === 'direct') {
        const otherUser = participants.find(p => p.id !== userId) || participants[0];
        formattedChat.user = otherUser;
      } else {
        formattedChat.group = {
          name: chat.group_name,
          avatar: chat.group_avatar,
          participants: participants
        };
      }

      formattedChats.push(formattedChat);
    }
    
    console.log('Success:', formattedChats.length, 'chats found');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    pool.end();
  }
}
test();
