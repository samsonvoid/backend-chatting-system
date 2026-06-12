import { Router } from 'express';
import { superAdminProtect } from '../middlewares/authMiddleware.js';
import pool from '../models/db.js';

const router = Router();

// Secure all admin routes
router.use(superAdminProtect);

/**
 * @desc    Get all users in the workspace with admin parameters
 * @route   GET /api/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, avatar, status, role, is_blocked as "isBlocked", allow_group_creation as "allowGroupCreation" 
       FROM users 
       ORDER BY name ASC`
    );
    res.status(200).json({ success: true, users: rows });
  } catch (error) {
    console.error('[Admin API] GetUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users list.' });
  }
});

/**
 * @desc    Toggle block status of a user
 * @route   PUT /api/admin/users/:id/block
 */
router.put('/users/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent blocking oneself
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Operation failed. You cannot block your own admin account.' });
    }

    const { rows: userCheck } = await pool.query('SELECT is_blocked FROM users WHERE id = $1', [id]);
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const newBlockStatus = !userCheck[0].is_blocked;
    await pool.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [newBlockStatus, id]);

    // If blocked, we can optionally change their status to offline
    if (newBlockStatus) {
      await pool.query("UPDATE users SET status = 'offline' WHERE id = $1", [id]);
      // Force disconnect their socket if active
      if (global.io) {
        const activeSockets = Array.from(global.io.sockets.sockets.values());
        const userSockets = activeSockets.filter(s => s.user && s.user.id === id);
        userSockets.forEach(s => s.disconnect(true));
      }
    }

    res.status(200).json({ 
      success: true, 
      message: `User account has been successfully ${newBlockStatus ? 'blocked' : 'unblocked'}.`,
      isBlocked: newBlockStatus 
    });
  } catch (error) {
    console.error('[Admin API] BlockUser error:', error);
    res.status(500).json({ success: false, message: 'Database transaction error occurred.' });
  }
});

/**
 * @desc    Toggle user role (user <-> admin)
 * @route   PUT /api/admin/users/:id/role
 */
router.put('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent editing own role
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Operation failed. You cannot demote your own admin account.' });
    }

    const { rows: userCheck } = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const newRole = userCheck[0].role === 'admin' ? 'user' : 'admin';
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [newRole, id]);

    res.status(200).json({ 
      success: true, 
      message: `User role successfully changed to ${newRole}.`,
      role: newRole 
    });
  } catch (error) {
    console.error('[Admin API] ChangeRole error:', error);
    res.status(500).json({ success: false, message: 'Database transaction error occurred.' });
  }
});

/**
 * @desc    Delete a user account entirely (cascade deletion)
 * @route   DELETE /api/admin/users/:id
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Operation failed. You cannot delete your own admin account.' });
    }

    const { rows: userCheck } = await pool.query('SELECT 1 FROM users WHERE id = $1', [id]);
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Delete user (cascade will delete conversation_users, messages, etc.)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // Disconnect active socket if connected
    if (global.io) {
      const activeSockets = Array.from(global.io.sockets.sockets.values());
      const userSockets = activeSockets.filter(s => s.user && s.user.id === id);
      userSockets.forEach(s => s.disconnect(true));
    }

    res.status(200).json({ success: true, message: 'User account and all related metadata deleted successfully.' });
  } catch (error) {
    console.error('[Admin API] DeleteUser error:', error);
    res.status(500).json({ success: false, message: 'Database deletion cascade error.' });
  }
});

/**
 * @desc    Get platform metrics (overview stats)
 * @route   GET /api/admin/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { rows: userStats } = await pool.query('SELECT COUNT(*) FROM users');
    const { rows: activeUsers } = await pool.query("SELECT COUNT(*) FROM users WHERE status = 'online'");
    const { rows: roomStats } = await pool.query('SELECT COUNT(*) FROM conversations');
    const { rows: msgStats } = await pool.query('SELECT COUNT(*) FROM messages');

    res.status(200).json({
      success: true,
      stats: {
        totalUsers: parseInt(userStats[0].count),
        onlineUsers: parseInt(activeUsers[0].count),
        totalRooms: parseInt(roomStats[0].count),
        totalMessages: parseInt(msgStats[0].count)
      }
    });
  } catch (error) {
    console.error('[Admin API] GetStats error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve stats.' });
  }
});

/**
 * @desc    Toggle group creation permission for a user
 * @route   PUT /api/admin/users/:id/allow-group-creation
 */
router.put('/users/:id/allow-group-creation', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent toggling own permission
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Operation failed. You cannot modify your own superadmin permissions.' });
    }

    const { rows: userCheck } = await pool.query('SELECT allow_group_creation FROM users WHERE id = $1', [id]);
    if (userCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const newStatus = !userCheck[0].allow_group_creation;
    await pool.query('UPDATE users SET allow_group_creation = $1 WHERE id = $2', [newStatus, id]);

    res.status(200).json({ 
      success: true, 
      message: `Group creation permission successfully ${newStatus ? 'granted' : 'revoked'}.`,
      allowGroupCreation: newStatus 
    });
  } catch (error) {
    console.error('[Admin API] ToggleGroupCreation error:', error);
    res.status(500).json({ success: false, message: 'Database transaction error occurred.' });
  }
});

/**
 * @desc    Get all group conversations with details
 * @route   GET /api/admin/conversations
 */
router.get('/conversations', async (req, res) => {
  try {
    // 1. Get all group conversations
    const { rows: groups } = await pool.query(
      `SELECT id, group_name as "groupName", group_avatar as "groupAvatar", is_private as "isPrivate"
       FROM conversations
       WHERE type = 'group'
       ORDER BY group_name ASC`
    );

    const result = [];

    // 2. Fetch members list for each group
    for (const g of groups) {
      const { rows: members } = await pool.query(
        `SELECT u.id, u.name, u.email, u.avatar 
         FROM users u
         JOIN conversation_users cu ON u.id = cu.user_id
         WHERE cu.conversation_id = $1
         ORDER BY u.name ASC`,
        [g.id]
      );
      result.push({
        ...g,
        members: members
      });
    }

    res.status(200).json({ success: true, conversations: result });
  } catch (error) {
    console.error('[Admin API] GetConversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations.' });
  }
});

/**
 * @desc    Create a new group conversation from the admin panel
 * @route   POST /api/admin/conversations
 */
router.post('/conversations', async (req, res) => {
  try {
    const { groupName, groupAvatar, isPrivate, members } = req.body;
    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ success: false, message: 'Group name is required.' });
    }

    const conversationId = `c-${Date.now()}`;
    await pool.query(
      `INSERT INTO conversations (id, type, group_name, group_avatar, is_private) VALUES ($1, $2, $3, $4, $5)`,
      [conversationId, 'group', groupName.trim(), groupAvatar || 'GP', isPrivate === true]
    );

    // Add members if provided
    if (members && Array.isArray(members)) {
      // Include current admin in the group too
      const uniqueMembers = Array.from(new Set([...members, req.user.id]));
      for (const memberId of uniqueMembers) {
        await pool.query(
          `INSERT INTO conversation_users (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [conversationId, memberId]
        );
      }
    }

    res.status(201).json({ success: true, message: 'Group conversation created successfully.', conversationId });
  } catch (error) {
    console.error('[Admin API] CreateConversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create group.' });
  }
});

/**
 * @desc    Update group conversation membership
 * @route   PUT /api/admin/conversations/:id/members
 */
router.put('/conversations/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { members } = req.body; // Array of user IDs that should be in the group

    if (!members || !Array.isArray(members)) {
      return res.status(400).json({ success: false, message: 'Members array is required.' });
    }

    // Verify conversation exists and is a group
    const { rows: convo } = await pool.query('SELECT 1 FROM conversations WHERE id = $1 AND type = $2', [id, 'group']);
    if (convo.length === 0) {
      return res.status(404).json({ success: false, message: 'Group conversation not found.' });
    }

    // 1. Remove all existing members
    await pool.query('DELETE FROM conversation_users WHERE conversation_id = $1', [id]);

    // 2. Insert new members
    // Always keep superadmin (current user) in the group
    const finalMembers = Array.from(new Set([...members, req.user.id]));
    for (const memberId of finalMembers) {
      await pool.query(
        'INSERT INTO conversation_users (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, memberId]
      );
    }

    // Optional: Notify sockets about membership update
    if (global.io) {
      global.io.emit('chat-membership-updated', { conversationId: id });
    }

    res.status(200).json({ success: true, message: 'Group membership updated successfully.' });
  } catch (error) {
    console.error('[Admin API] UpdateMembers error:', error);
    res.status(500).json({ success: false, message: 'Database transaction error occurred.' });
  }
});

/**
 * @desc    Delete a group conversation entirely (cascade deletes messages)
 * @route   DELETE /api/admin/conversations/:id
 */
router.delete('/conversations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify conversation exists and is a group
    const { rows: convo } = await pool.query('SELECT 1 FROM conversations WHERE id = $1 AND type = $2', [id, 'group']);
    if (convo.length === 0) {
      return res.status(404).json({ success: false, message: 'Group conversation not found.' });
    }

    // Delete conversation (cascade will handle conversation_users and messages)
    await pool.query('DELETE FROM conversations WHERE id = $1', [id]);

    // Optional: Notify sockets to leave the room
    if (global.io) {
      global.io.to(id).emit('chat-deleted', { conversationId: id });
    }

    res.status(200).json({ success: true, message: 'Group conversation deleted successfully.' });
  } catch (error) {
    console.error('[Admin API] DeleteConversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete group.' });
  }
});

export default router;
