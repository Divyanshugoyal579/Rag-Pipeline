import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as documentController from '../controllers/document.controller';
import * as chatController from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter, globalLimiter } from '../middleware/rateLimiter';
import { upload } from '../middleware/upload';

const router = Router();

// Auth routes (Strict rate limiting)
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/logout', authController.logout);

// Document routes (Global rate limit, authenticated)
router.post(
  '/documents/upload',
  globalLimiter,
  authenticate,
  upload.single('file'),
  documentController.uploadDocument
);
router.get('/documents', globalLimiter, authenticate, documentController.listDocuments);
router.get('/documents/stats', globalLimiter, authenticate, documentController.getStats);
router.delete('/documents/:id', globalLimiter, authenticate, documentController.deleteDocument);

// Chat routes (Global rate limit, authenticated)
router.post('/chat/conversation', globalLimiter, authenticate, chatController.startConversation);
router.get('/chat/conversations', globalLimiter, authenticate, chatController.listConversations);
router.get('/chat/conversation/:id', globalLimiter, authenticate, chatController.getConversation);
router.delete('/chat/conversation/:id', globalLimiter, authenticate, chatController.deleteConversation);
router.post('/chat/query', globalLimiter, authenticate, chatController.chatStream);
router.post('/chat/public-query', globalLimiter, chatController.publicChatStream);

export default router;
