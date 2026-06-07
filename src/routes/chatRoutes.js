import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getUserChats, getChatMessages, createChat, getRecentActivity, getSharedFiles, searchMessages } from '../controllers/chatController.js';

const router = Router();

// All chat routes are protected
router.use(protect);

/**
 * @openapi
 * /api/chats/shared-files:
 *   get:
 *     summary: Retrieve all files/attachments shared across user's conversations
 *     tags: [Chats]
 *     security:
 *       - cookieAuth: []
 */
router.get('/shared-files', getSharedFiles);

/**
 * @openapi
 * /api/chats/recent-activity:
 *   get:
 *     summary: Retrieve recent messages activity feed across user's conversations
 *     tags: [Chats]
 *     security:
 *       - cookieAuth: []
 */
router.get('/recent-activity', getRecentActivity);

/**
 * @openapi
 * /api/chats/search:
 *   get:
 *     summary: Search messages across user's conversations
 *     tags: [Chats]
 *     security:
 *       - cookieAuth: []
 */
router.get('/search', searchMessages);

/**
 * @openapi
 * /api/chats:
 *   get:
 *     summary: Retrieve all conversations for the authenticated user
 *     tags: [Chats]
 *     security:
 *       - cookieAuth: []
 */
router.get('/', getUserChats);

/**
 * @openapi
 * /api/chats/:id/messages:
 *   get:
 *     summary: Retrieve message history for a specific conversation
 *     tags: [Chats]
 *     security:
 *       - cookieAuth: []
 */
router.get('/:id/messages', getChatMessages);

/**
 * @openapi
 * /api/chats:
 *   post:
 *     summary: Create a new conversation (Direct or Group)
 *     tags: [Chats]
 *     security:
 *       - cookieAuth: []
 */
router.post('/', createChat);

export default router;
