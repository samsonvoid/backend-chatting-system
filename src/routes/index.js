import express from 'express';
import chatRoutes from './chatRoutes.js';
import authRoutes from './authRoutes.js';

const router = express.Router();

// Mount chat and authentication endpoints
router.use('/chats', chatRoutes);
router.use('/auth', authRoutes);

export default router;
