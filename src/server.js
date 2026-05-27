import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import { initializeDatabase } from './models/dbInit.js';
import { initializeSockets } from './sockets/index.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Initialize PostgreSQL connection, tables, and seed data
    await initializeDatabase();

    // 2. Create the unified HTTP Server
    const server = http.createServer(app);

    // 3. Initialize Socket.io Server atop the HTTP Server
    initializeSockets(server);

    // 4. Start listening
    server.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` SVS CHATTING PLATFORM SERVER IS ONLINE!            `);
      console.log(` Active Port: http://localhost:${PORT}              `);
      console.log(` Health Check URL: http://localhost:${PORT}/health  `);
      console.log(`====================================================`);
    });
    
  } catch (error) {
    console.error('Fatal error starting SVS Chat server:', error);
    process.exit(1);
  }
}

startServer();
