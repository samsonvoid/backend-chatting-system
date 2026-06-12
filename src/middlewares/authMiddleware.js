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
              new_messages_alert, mentions_only_alert, sound_effects_alert, role, is_blocked, allow_group_creation
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
      soundEffectsAlert: u.sound_effects_alert,
      role: u.role,
      isBlocked: u.is_blocked,
      allowGroupCreation: u.allow_group_creation
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

  // Read token from Cookies, Authorization header, or Query Parameters
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  const isApiRequest = req.path.startsWith('/api') || req.headers.accept?.includes('application/json');
  const frontendUrl = process.env.FRONTEND_URL || 'https://svschatplatformuidesign.vercel.app';

  if (!token) {
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No active authorization token provided.'
      });
    }
    
    const errorParam = req.query.error;
    let errorMsg = '';
    if (errorParam === 'invalid_credentials') {
      errorMsg = 'Invalid email or password.';
    } else if (errorParam === 'session_expired') {
      errorMsg = 'Your session has expired. Please log in again.';
    }

    return res.status(401).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CollabHub Admin Login</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0b1c30;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #0f2744;
      border: 1px solid #1c3d62;
      border-radius: 12px;
      padding: 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      text-align: center;
    }
    h1 {
      margin-bottom: 8px;
      font-size: 24px;
      color: #0077ff;
    }
    p {
      color: #c3c5d9;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 6px;
      color: #a0a5c0;
    }
    input {
      width: 100%;
      padding: 10px;
      background: #0b1c30;
      border: 1px solid #1c3d62;
      border-radius: 6px;
      color: white;
      box-sizing: border-box;
      outline: none;
    }
    input:focus {
      border-color: #0077ff;
    }
    button {
      width: 100%;
      padding: 12px;
      background: #004ad3;
      border: none;
      border-radius: 6px;
      color: white;
      font-weight: bold;
      cursor: pointer;
      font-size: 14px;
      margin-top: 10px;
    }
    button:hover {
      background: #0056f7;
    }
    .error {
      background: rgba(186, 26, 26, 0.2);
      border: 1px solid #ba1a1a;
      color: #ff9999;
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="color:#004ad3; margin-top:0;">Super Admin Portal</h1>
    <p>Sign in directly to access system status and monitoring</p>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    <form action="/api/auth/admin-login" method="POST">
      <div class="form-group">
        <label for="email">Admin Email</label>
        <input type="email" id="email" name="email" required placeholder="admin@company.com">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required placeholder="••••••••">
      </div>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>
    `);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const { rows } = await pool.query(
      `SELECT id, name, username, email, avatar, status, bio, theme, accent_color, font_size,
              new_messages_alert, mentions_only_alert, sound_effects_alert, role, is_blocked, allow_group_creation
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
      res.clearCookie('token');
      return res.redirect('/admin?error=session_expired');
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
      soundEffectsAlert: raw.sound_effects_alert,
      role: raw.role,
      isBlocked: raw.is_blocked,
      allowGroupCreation: raw.allow_group_creation
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
          <a href="${frontendUrl}" style="background-color: #004ad3; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-family: sans-serif;">Go to Login</a>
        </div>
      `);
    }

    req.user = user;

    // Set token in Cookie if not already set, so subsequent direct asset/API requests succeed
    if (token && (!req.cookies || !req.cookies.token)) {
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
    }

    next();

  } catch (error) {
    console.error('[SuperAdmin Auth Middleware] Token verification failed:', error.message);
    if (isApiRequest) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Session token has expired or is invalid.'
      });
    }
    res.clearCookie('token');
    return res.redirect('/admin?error=session_expired');
  }
}

