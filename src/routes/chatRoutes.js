import express from 'express';
import { getChats, getMessages } from '../controllers/chatController.js';

const router = express.Router();

router.get('/', getChats);
router.get('/:id/messages', getMessages);

export default router;
