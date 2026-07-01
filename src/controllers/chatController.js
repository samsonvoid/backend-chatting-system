import pool from '../models/db.js';

/**
 * @desc    Get all conversations for the authenticated user
 * @route   GET /api/chats
 * @access  Private (JWT protected)
 */
export async function getUserChats(req, res) {
  try {
    const userId = req.user.id;

    // 1. Find all conversations this user is part of
    const { rows: userConversations } = await pool.query(
      `SELECT c.id, c.type, c.group_name, c.group_avatar
       FROM conversations c
       JOIN conversation_users cu ON c.id = cu.conversation_id
       WHERE cu.user_id = $1`,
      [userId]
    );

    if (userConversations.length === 0) {
      return res.status(200).json([]);
    }

    const formattedChats = [];

    // 2. Fetch details for each conversation
    for (const chat of userConversations) {
      // Get all participants
      const { rows: participants } = await pool.query(
        `SELECT u.id, u.name, u.avatar, u.status, u.email 
         FROM users u
         JOIN conversation_users cu ON u.id = cu.user_id
         WHERE cu.conversation_id = $1`,
        [chat.id]
      );

      // Get last message
      const { rows: messages } = await pool.query(
        `SELECT m.content, m.created_at, m.metadata->>'status' as status, u.name as sender_name,
                m.metadata->'attachment' as attachment
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [chat.id]
      );

      const lastMessage = messages.length > 0 ? messages[0] : null;

      // A. Query the user's last_read_at timestamp for this conversation
      const { rows: readRecord } = await pool.query(
        `SELECT last_read_at FROM conversation_users 
         WHERE conversation_id = $1 AND user_id = $2`,
        [chat.id, userId]
      );
      const lastRead = readRecord.length > 0 ? readRecord[0].last_read_at : new Date(0);

      // B. Count messages created after lastRead (excluding messages sent by the user themselves)
      const { rows: unreadCountResult } = await pool.query(
        `SELECT COUNT(*) FROM messages 
         WHERE conversation_id = $1 AND created_at > $2 AND sender_id != $3`,
        [chat.id, lastRead, userId]
      );
      const unreadCount = parseInt(unreadCountResult[0].count);

      let lastMsgText = 'No messages yet';
      if (lastMessage) {
        if (lastMessage.content) {
          lastMsgText = chat.type === 'group' ? `${lastMessage.sender_name}: ${lastMessage.content}` : lastMessage.content;
        } else if (lastMessage.attachment) {
          const prefix = chat.type === 'group' ? `${lastMessage.sender_name}: ` : '';
          const typeStr = lastMessage.attachment.type.startsWith('image/') ? '📷 Image' : '📄 File';
          lastMsgText = `${prefix}${typeStr}`;
        }
      }

      let formattedChat = {
        id: chat.id,
        type: chat.type,
        unreadCount: unreadCount,
        lastMessage: lastMsgText,
        lastMessageTime: lastMessage ? lastMessage.created_at : new Date(),
      };

      if (chat.type === 'direct') {
        // Find the OTHER user in the direct message
        const otherUser = participants.find(p => p.id !== userId) || participants[0];
        formattedChat.user = otherUser;
      } else {
        // Format group data
        formattedChat.group = {
          name: chat.group_name,
          avatar: chat.group_avatar,
          participants: participants
        };
      }

      formattedChats.push(formattedChat);
    }

    // Sort chats by most recent message
    formattedChats.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

    return res.status(200).json(formattedChats);

  } catch (error) {
    console.error('[Chat Controller] getUserChats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch chats' });
  }
}

/**
 * @desc    Get full message history for a specific conversation
 * @route   GET /api/chats/:id/messages
 * @access  Private (JWT protected)
 */
export async function getChatMessages(req, res) {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user.id;

    // 1. Verify user is part of this conversation
    const { rows: membership } = await pool.query(
      `SELECT 1 FROM conversation_users WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (membership.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied. You are not a member of this chat.' });
    }

    // 1.5. Update user's last_read_at timestamp for this conversation
    await pool.query(
      `UPDATE conversation_users SET last_read_at = CURRENT_TIMESTAMP 
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    // Bulk update unread messages sent by others in this conversation to 'read' status
    await pool.query(
      `UPDATE messages 
       SET metadata = jsonb_set(metadata, '{status}', '"read"') 
       WHERE conversation_id = $1 AND sender_id != $2 AND metadata->>'status' IN ('sent', 'delivered')`,
      [conversationId, userId]
    );

    const { rows: messages } = await pool.query(
      `SELECT m.id, m.sender_id as "senderId", u.name as "senderName", u.avatar as "senderAvatar", 
              m.content, m.created_at as timestamp, m.metadata->>'status' as status,
              m.metadata->'attachment' as attachment, m.metadata as metadata
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [conversationId]
    );

    // Reverse the array to maintain chronological order in the chat window viewport
    messages.reverse();

    return res.status(200).json(messages);

  } catch (error) {
    console.error('[Chat Controller] getChatMessages error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
}

/**
 * @desc    Create a new chat (Direct or Group)
 * @route   POST /api/chats
 * @access  Private (JWT protected)
 */
export async function createChat(req, res) {
  try {
    const { type, members, groupName, groupAvatar, isPrivate } = req.body;
    const userId = req.user.id;

    if (type === 'group' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden. Only administrators can create group channels.' });
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, message: 'Members array is required' });
    }

    // Include the creator in the members list if not already
    const allMembers = Array.from(new Set([...members, userId]));

    if (type === 'direct' && allMembers.length !== 2) {
      return res.status(400).json({ success: false, message: 'Direct messages must have exactly 2 members' });
    }

    if (type === 'direct') {
      // Check if a direct message already exists between these two users
      const { rows: existingDirects } = await pool.query(
        `SELECT c.id 
         FROM conversations c
         JOIN conversation_users cu1 ON c.id = cu1.conversation_id
         JOIN conversation_users cu2 ON c.id = cu2.conversation_id
         WHERE c.type = 'direct' 
           AND cu1.user_id = $1 
           AND cu2.user_id = $2`,
        [allMembers[0], allMembers[1]]
      );

      if (existingDirects.length > 0) {
        return res.status(200).json({ success: true, conversationId: existingDirects[0].id, existing: true });
      }
    }

    // Create new conversation
    const conversationId = `c-${Date.now()}`;
    await pool.query(
      `INSERT INTO conversations (id, type, group_name, group_avatar, is_private) VALUES ($1, $2, $3, $4, $5)`,
      [conversationId, type, type === 'group' ? groupName : null, type === 'group' ? groupAvatar : null, type === 'group' ? (isPrivate === true) : false]
    );

    // Add members
    for (const memberId of allMembers) {
      await pool.query(
        `INSERT INTO conversation_users (conversation_id, user_id) VALUES ($1, $2)`,
        [conversationId, memberId]
      );
    }

    return res.status(201).json({ success: true, conversationId });

  } catch (error) {
    console.error('[Chat Controller] createChat error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create chat' });
  }
}

/**
 * @desc    Get user's recent message activity feed for dashboard bento grid
 * @route   GET /api/chats/recent-activity
 * @access  Private (JWT protected)
 */
export async function getRecentActivity(req, res) {
  try {
    const userId = req.user.id;

    // Fetch the 3 most recent messages from any conversation this user is a participant of
    const { rows } = await pool.query(
      `SELECT m.id, m.content, m.created_at as "createdAt", 
              m.conversation_id as "conversationId",
              u.id as "senderId", u.name as "senderName", u.avatar as "senderAvatar",
              c.type as "chatType", c.group_name as "groupName"
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       JOIN conversations c ON m.conversation_id = c.id
       JOIN conversation_users cu ON c.id = cu.conversation_id
       WHERE cu.user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 3`,
      [userId]
    );

    return res.status(200).json({ success: true, activity: rows });

  } catch (error) {
    console.error('[Chat Controller] getRecentActivity error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch recent activity feed' });
  }
}

/**
 * @desc    Get all files/attachments shared across conversations for the authenticated user
 * @route   GET /api/chats/shared-files
 * @access  Private (JWT protected)
 */
export async function getSharedFiles(req, res) {
  try {
    const userId = req.user.id;

    // Fetch all messages that contain an attachment in any conversation this user is a participant of
    const { rows } = await pool.query(
      `SELECT m.id, m.content, m.created_at as timestamp, 
              m.metadata->'attachment' as attachment,
              u.name as "senderName",
              c.id as "conversationId",
              c.type as "chatType",
              c.group_name as "groupName"
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       JOIN conversations c ON m.conversation_id = c.id
       JOIN conversation_users cu ON c.id = cu.conversation_id
       WHERE cu.user_id = $1 AND m.metadata->'attachment' IS NOT NULL
       ORDER BY m.created_at DESC`,
      [userId]
    );

    return res.status(200).json({ success: true, files: rows });

  } catch (error) {
    console.error('[Chat Controller] getSharedFiles error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch shared files' });
  }
}

/**
 * @desc    Search messages across conversations for the authenticated user
 * @route   GET /api/chats/search
 * @access  Private (JWT protected)
 */
export async function searchMessages(req, res) {
  try {
    const userId = req.user.id;
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(200).json([]);
    }

    const queryStr = q.trim();

    // Parse filters: from:username, has:file, and text content
    let fromSender = null;
    const fromMatch = queryStr.match(/from:(?:"([^"]+)"|(\S+))/i);
    if (fromMatch) {
      fromSender = fromMatch[1] || fromMatch[2];
    }

    const hasFile = /has:file/i.test(queryStr);

    // Get clean search text by removing filters
    let searchText = queryStr
      .replace(/from:(?:"[^"]+"|\S+)/gi, '')
      .replace(/has:file/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Construct SQL Query dynamically
    let sql = `
      SELECT 
        m.id, 
        m.conversation_id as "conversationId",
        m.sender_id as "senderId", 
        m.content, 
        m.created_at as timestamp, 
        m.metadata->>'status' as status,
        m.metadata->'attachment' as attachment,
        u.name as "senderName",
        u.avatar as "senderAvatar",
        u.username as "senderUsername",
        c.type as "chatType",
        c.group_name as "groupName",
        c.group_avatar as "groupAvatar"
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      JOIN conversations c ON m.conversation_id = c.id
      JOIN conversation_users cu ON c.id = cu.conversation_id
      WHERE cu.user_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    if (fromSender) {
      sql += ` AND (u.username ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${fromSender}%`);
      paramIndex++;
    }

    if (hasFile) {
      sql += ` AND m.metadata->'attachment' IS NOT NULL`;
    }

    if (searchText) {
      sql += ` AND m.content ILIKE $${paramIndex}`;
      params.push(`%${searchText}%`);
      paramIndex++;
    }

    sql += `
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows);

  } catch (error) {
    console.error('[Chat Controller] searchMessages error:', error);
    return res.status(500).json({ success: false, message: 'Failed to search messages' });
  }
}

