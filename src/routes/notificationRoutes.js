import { Router } from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  getVapidPublicKey,
  registerPushToken,
  deregisterPushToken,
  getNotificationsList,
  markNotificationRead,
  markAllNotificationsRead,
  markRoomNotificationsRead,
  getNotificationSettings,
  updateNotificationSettings,
  muteConversation,
  unmuteConversation,
  getMutedConversations,
  quickReplyMessage
} from '../controllers/notificationController.js';

const router = Router();

// Endpoint to fetch public VAPID key is public (so user can register SW subscription on bootstrap)
router.get('/vapid-public-key', getVapidPublicKey);

// Protect all remaining notification endpoints
router.use(protect);

router.post('/register-token', registerPushToken);
router.post('/deregister-token', deregisterPushToken);
router.get('/', getNotificationsList);
router.put('/:id/read', markNotificationRead);
router.put('/read-room/:roomId', markRoomNotificationsRead);
router.put('/read-all', markAllNotificationsRead);
router.get('/settings', getNotificationSettings);
router.put('/settings', updateNotificationSettings);
router.post('/mute/:id', muteConversation);
router.delete('/mute/:id', unmuteConversation);
router.get('/muted', getMutedConversations);
router.post('/quick-reply', quickReplyMessage);

export default router;
