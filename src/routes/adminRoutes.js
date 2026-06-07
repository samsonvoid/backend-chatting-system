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
      `SELECT id, name, email, avatar, status, role, is_blocked as "isBlocked" 
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

export default router;
