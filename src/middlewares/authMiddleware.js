import jwt from 'jsonwebtoken';
import pool from '../models/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'collabhubsecret';

export async function protect(req, res, next) {
  let token;

  // 1. Read token from Authorization Bearer Header or Cookies
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // 2. Return 401 if token is missing
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No active authorization token provided.'
    });
  }

  try {
    // 3. Verify JWT signature integrity
    const decoded = jwt.verify(token, JWT_SECRET);

    // 4. Query PostgreSQL database to fetch matching user details (all profile columns)
    const { rows } = await pool.query(
      `SELECT id, name, username, email, avatar, status, bio, theme, accent_color, font_size,
              new_messages_alert, mentions_only_alert, sound_effects_alert
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Authenticated session user no longer exists in database.'
      });
    }

    // 5. Inject verified context with camelCase mapping into request object
    const u = rows[0];
    req.user = {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      avatar: u.avatar,
      status: u.status,
      bio: u.bio,
      theme: u.theme,
      accentColor: u.accent_color,
      fontSize: u.font_size,
      newMessagesAlert: u.new_messages_alert,
      mentionsOnlyAlert: u.mentions_only_alert,
      soundEffectsAlert: u.sound_effects_alert
    };
    next();

  } catch (error) {
    console.error('[Auth Middleware] Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Access denied. The provided authorization token is invalid or has expired.'
    });
  }
}

export async function superAdminProtect(req, res, next) {
  let token;

  // Read token from Cookies or Authorization header
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  const isApiRequest = req.path.startsWith('/api') || req.headers.accept?.includes('application/json');

  if (!token) {
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No active authorization token provided.'
      });
    }
    return res.status(401).send(`
      <div style="font-family: 'Geist', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0b1c30; color: #ffffff; text-align: center; padding: 20px;">
        <h1 style="font-size: 3rem; color: #ba1a1a; margin-bottom: 1rem;">Access Denied</h1>
        <p style="font-size: 1.2rem; color: #c3c5d9; margin-bottom: 2rem;">No active session found. Please log in to CollabHub as a Super Admin.</p>
        <a href="http://localhost:5173" style="background-color: #004ad3; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: sans-serif;">Go to Login</a>
      </div>
    `);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT id, name, username, email, avatar, status, bio, theme, accent_color, font_size,
              new_messages_alert, mentions_only_alert, sound_effects_alert
       FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (rows.length === 0) {
      if (isApiRequest) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Session user no longer exists.'
        });
      }
      return res.status(401).send('<h1>Access Denied</h1><p>Session user not found.</p>');
    }

    const raw = rows[0];
    const user = {
      id: raw.id,
      name: raw.name,
      username: raw.username,
      email: raw.email,
      avatar: raw.avatar,
      status: raw.status,
      bio: raw.bio,
      theme: raw.theme,
      accentColor: raw.accent_color,
      fontSize: raw.font_size,
      newMessagesAlert: raw.new_messages_alert,
      mentionsOnlyAlert: raw.mentions_only_alert,
      soundEffectsAlert: raw.sound_effects_alert
    };

    // Enforce that only the Super Admin email "samsonprogrammer@gmail.com" can access
    if (user.email !== 'samsonprogrammer@gmail.com') {
      if (isApiRequest) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden. Access restricted to Super Admin only.'
        });
      }
      return res.status(403).send(`
        <div style="font-family: 'Geist', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0b1c30; color: #ffffff; text-align: center; padding: 20px;">
          <h1 style="font-size: 3rem; color: #ba1a1a; margin-bottom: 1rem;">Forbidden</h1>
          <p style="font-size: 1.2rem; color: #c3c5d9; margin-bottom: 2rem;">Access is strictly restricted to the Super Admin (samsonprogrammer@gmail.com).</p>
          <a href="http://localhost:5173" style="background-color: #004ad3; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: sans-serif;">Go to Login</a>
        </div>
      `);
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('[SuperAdmin Auth Middleware] Token verification failed:', error.message);
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Session token has expired or is invalid.'
      });
    }
    return res.status(401).send('<h1>Access Denied</h1><p>Session expired or token invalid.</p>');
  }
}

