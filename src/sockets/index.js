import { Server } from 'socket.io';
import registerChatHandlers from './chatHandler.js';

export function initializeSockets(httpServer) {
  // Initialize Socket.io Server with safe CORS defaults
  const io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  global.io = io; // Expose socket instance globally for real-time monitoring

  io.on('connection', (socket) => {
    console.log(`New WebSocket client connected. Socket ID: ${socket.id}`);

    // Register dynamic chat event handlers
    registerChatHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`WebSocket client disconnected. Socket ID: ${socket.id}`);
    });
  });

  return io;
}
