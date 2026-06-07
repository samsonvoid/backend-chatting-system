import express from 'express';
import chatRoutes from './chatRoutes.js';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';

const router = express.Router();

// Mount chat, authentication, and admin endpoints
router.use('/chats', chatRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);

export default router;
