import express from 'express';
import chatRoutes from './chatRoutes.js';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import notificationRoutes from './notificationRoutes.js';

const router = express.Router();

// Mount chat, authentication, and admin endpoints
router.use('/chats', chatRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);

export default router;
