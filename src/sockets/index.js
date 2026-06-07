import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import pool from '../models/db.js';
import registerChatHandlers from './chatHandler.js';

const JWT_SECRET = process.env.JWT_SECRET || 'collabhubsecret';

export function initializeSockets(httpServer) {
  // Initialize Socket.io Server with safe CORS defaults and 100MB max payload
  const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8, // 100 MB max payload size for file sharing
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  global.io = io; // Expose socket instance globally for real-time monitoring

  // Middleware to authenticate socket connection using token from auth or cookies
  io.use((socket, next) => {
    let token = socket.handshake.auth?.token;

    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        // Parse cookie header manually
        const cookies = {};
        cookieHeader.split(';').forEach(cookie => {
          const parts = cookie.split('=');
          if (parts.length >= 2) {
            cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
          }
        });
        token = cookies.token;
      }
    }

    if (!token) {
      return next(new Error('Authentication error: Token missing.'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = { id: decoded.id }; // Attach decoded user context
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid or expired token.'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user?.id;
    console.log(`WebSocket client connected. Socket ID: ${socket.id}, User ID: ${userId}`);

    if (userId) {
      try {
        // 1. Update user presence status to 'online' in PostgreSQL database
        await pool.query("UPDATE users SET status = 'online' WHERE id = $1", [userId]);
        
        // 2. Broadcast presence change to all active workspace peers
        io.emit('user-presence-changed', { userId, status: 'online' });
        console.log(`[Socket] User ${userId} is now online.`);
      } catch (err) {
        console.error(`[Socket] Error updating presence status on connection for user ${userId}:`, err);
      }
    }

    // Register dynamic chat event handlers
    registerChatHandlers(io, socket);

    socket.on('disconnect', async () => {
      console.log(`WebSocket client disconnected. Socket ID: ${socket.id}, User ID: ${userId}`);
      
      if (userId) {
        try {
          // Check if the user has any other active socket connections (e.g. multiple tabs)
          const hasOtherConnections = Array.from(io.sockets.sockets.values()).some(
            (s) => s.user && s.user.id === userId && s.id !== socket.id
          );

          if (!hasOtherConnections) {
            // Update user status to 'offline' in database
            await pool.query("UPDATE users SET status = 'offline' WHERE id = $1", [userId]);
            
            // Broadcast presence change to all active peers
            io.emit('user-presence-changed', { userId, status: 'offline' });
            console.log(`[Socket] User ${userId} is now offline.`);
          } else {
            console.log(`[Socket] User ${userId} disconnected one session but remains online in another.`);
          }
        } catch (err) {
          console.error(`[Socket] Error updating presence status on disconnect for user ${userId}:`, err);
        }
      }
    });
  });

  return io;
}
