import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../models/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const JWT_SECRET = process.env.JWT_SECRET || 'collabhubsecret';

/**
 * Generate standard initials avatar for user profiles (e.g., "Kulwa Khalfan" -> "KK")
 */
function getInitials(name) {
  if (!name) return 'CH';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Securely set JWT inside an HttpOnly cookie
 */
function setTokenCookie(res, userId) {
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '24h' });
  
  res.cookie('token', token, {
    httpOnly: true, // Prevents XSS scripts from reading the token
    secure: process.env.NODE_ENV === 'production', // Transmits only over HTTPS in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });

  return token;
}

/**
 * @desc    Register a new user inside CollabHub workspace
 * @route   POST /api/auth/signup
 * @access  Public
 */
export async function registerUser(req, res) {
  const { name, email, password } = req.body;

  // 1. Validation checks (Email format regex and password length)
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please supply your name, email, and password.'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please supply a valid email address.'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Password must contain at least 8 characters.'
    });
  }

  try {
    // 2. Check if user already exists
    const checkUser = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Registration failed. A user account with this email address already exists.'
      });
    }

    // 3. Process password hashing (Bcrypt cryptography)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Create unique user details
    const userId = `u-${Date.now()}`;
    const avatar = getInitials(name);
    const lowercaseEmail = email.toLowerCase().trim();

    // 5. Write to PostgreSQL database
    await pool.query(
      'INSERT INTO users (id, name, email, password_hash, avatar, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, name, lowercaseEmail, passwordHash, avatar, 'online']
    );

    // 5.5. Auto-join all existing company group chats
    await pool.query(
      `INSERT INTO conversation_users (conversation_id, user_id) 
       SELECT id, $1 FROM conversations WHERE type = 'group'
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    // 5.6. Initialize default user notification settings
    await pool.query(
      'INSERT INTO user_notification_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );

    // 6. Generate signed JWT token and set in HttpOnly cookie
    const token = setTokenCookie(res, userId);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token, // Expose token to client for standard authorization headers if needed
      user: {
        id: userId,
        name,
        email: lowercaseEmail,
        avatar,
        status: 'online'
      }
    });

  } catch (error) {
    console.error('[Auth Controller] SignUp registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed. An internal server database insertion error occurred.'
    });
  }
}

/**
 * @desc    Authenticate existing user and grant access token
 * @route   POST /api/auth/login
 * @access  Public
 */
export async function loginUser(req, res) {
  const { email, password } = req.body;

  // 1. Validation checks
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please supply both email address and password.'
    });
  }

  try {
    // 2. Fetch matching user profile from database
    const lowercaseEmail = email.toLowerCase().trim();
    const { rows } = await pool.query(
      'SELECT id, name, username, email, password_hash, avatar, status, bio, theme, accent_color, font_size, new_messages_alert, mentions_only_alert, sound_effects_alert FROM users WHERE email = $1',
      [lowercaseEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid email address or password.'
      });
    }

    const user = rows[0];

    // 3. Match cryptographic password hashes
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid email address or password.'
      });
    }

    // 4. Update status to online in database
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['online', user.id]);

    // 5. Generate signed JWT token and set in HttpOnly cookie
    const token = setTokenCookie(res, user.id);

    return res.status(200).json({
      success: true,
      message: 'Authentication successful. Welcome back to CollabHub!',
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        status: 'online',
        bio: user.bio,
        theme: user.theme,
        accentColor: user.accent_color,
        fontSize: user.font_size,
        newMessagesAlert: user.new_messages_alert,
        mentionsOnlyAlert: user.mentions_only_alert,
        soundEffectsAlert: user.sound_effects_alert
      }
    });

  } catch (error) {
    console.error('[Auth Controller] LogIn authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed. An internal server database lookup error occurred.'
    });
  }
}

/**
 * @desc    Logout user and clear HttpOnly session cookies
 * @route   POST /api/auth/logout
 * @access  Private (JWT protected)
 */
export async function logoutUser(req, res) {
  try {
    // 1. Wipe active cookie session
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });

    // 2. Update connection status to offline in database
    if (req.user) {
      await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['offline', req.user.id]);
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully! Session cookie cleared.'
    });

  } catch (error) {
    console.error('[Auth Controller] LogOut session clear error:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout failed. An internal server database update error occurred.'
    });
  }
}

/**
 * @desc    Retrieve active session user details
 * @route   GET /api/auth/me
 * @access  Private (JWT protected)
 */
export async function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    user: req.user
  });
}

/**
 * @desc    Update active user profile details
 * @route   PUT /api/auth/profile
 * @access  Private (JWT protected)
 */
export async function updateUserProfile(req, res) {
  const { name, username, bio, theme, accentColor, fontSize, newMessagesAlert, mentionsOnlyAlert, soundEffectsAlert, avatar } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please supply a valid full name.'
    });
  }

  try {
    const updatedName = name.trim();
    let finalAvatar = avatar;

    // Save custom base64 avatar images directly in PostgreSQL database
    if (avatar && avatar.startsWith('data:image/')) {
      finalAvatar = avatar;
    } else if (!finalAvatar) {
      finalAvatar = getInitials(updatedName);
    }

    // Update in PostgreSQL
    const { rows } = await pool.query(
      `UPDATE users SET 
        name = $1, avatar = $2, username = $3, bio = $4, theme = $5, accent_color = $6, 
        font_size = $7, new_messages_alert = $8, mentions_only_alert = $9, sound_effects_alert = $10 
       WHERE id = $11 
       RETURNING id, name, username, email, avatar, status, bio, theme, accent_color, font_size, new_messages_alert, mentions_only_alert, sound_effects_alert`,
      [updatedName, finalAvatar, username, bio, theme, accentColor, fontSize, newMessagesAlert, mentionsOnlyAlert, soundEffectsAlert, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: rows[0].id,
        name: rows[0].name,
        username: rows[0].username,
        email: rows[0].email,
        avatar: rows[0].avatar,
        status: rows[0].status,
        bio: rows[0].bio,
        theme: rows[0].theme,
        accentColor: rows[0].accent_color,
        fontSize: rows[0].font_size,
        newMessagesAlert: rows[0].new_messages_alert,
        mentionsOnlyAlert: rows[0].mentions_only_alert,
        soundEffectsAlert: rows[0].sound_effects_alert
      }
    });

  } catch (error) {
    console.error('[Auth Controller] UpdateProfile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile. Internal database error.'
    });
  }
}

/**
 * @desc    Get all users for the company directory
 * @route   GET /api/auth/users
 * @access  Private
 */
export async function getAllUsers(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, avatar, status, bio, username 
       FROM users 
       WHERE id != $1
       ORDER BY name ASC`,
      [req.user.id]
    );
    
    return res.status(200).json({ success: true, users: rows });
  } catch (error) {
    console.error('[Auth Controller] getAllUsers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch users directory' });
  }
}

/**
 * @desc    Admin login handler for direct form posts
 * @route   POST /api/auth/admin-login
 * @access  Public
 */
export async function adminLogin(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send('<h1>Validation Error</h1><p>Email and password are required.</p>');
  }

  try {
    const lowercaseEmail = email.toLowerCase().trim();
    if (lowercaseEmail !== 'samsonprogrammer@gmail.com') {
      return res.status(403).send('<h1>Access Denied</h1><p>This login is strictly restricted to the Super Admin.</p>');
    }

    const { rows } = await pool.query(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [lowercaseEmail]
    );

    if (rows.length === 0) {
      return res.redirect('/admin?error=invalid_credentials');
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.redirect('/admin?error=invalid_credentials');
    }

    // Set HTTP-only Cookie
    setTokenCookie(res, user.id);

    // Redirect straight to Admin Portal page
    return res.redirect('/admin');

  } catch (error) {
    console.error('[Admin Login Controller] Error:', error);
    return res.status(500).send('<h1>Internal Server Error</h1><p>Failed to process admin authentication.</p>');
  }
}
