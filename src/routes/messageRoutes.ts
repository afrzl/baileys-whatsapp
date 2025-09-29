import { Router } from 'express';
import { MessageController } from '@/controllers';
import { authenticateApiKey } from '@/middleware';

const router = Router();

console.log('MessageRoutes: Setting up routes...');

// Message routes (sessionId as parameter)
router.post('/:sessionId/messages/send', authenticateApiKey, MessageController.sendMessage);
router.post('/:sessionId/messages/send/bulk', authenticateApiKey, MessageController.sendBulkMessages);
router.post('/:sessionId/messages/poll', authenticateApiKey, MessageController.sendPoll);

// Chat history routes
router.get('/:sessionId/chats/:jid?', authenticateApiKey, MessageController.getChatHistory);

// Contact routes
router.get('/:sessionId/contacts', authenticateApiKey, MessageController.getContacts);

// Group routes
console.log('About to register groups route...');
console.log('MessageController.getGroups exists:', typeof MessageController.getGroups);
router.get('/:sessionId/groups', authenticateApiKey, MessageController.getGroups);
console.log('Groups route registered successfully');

console.log('MessageRoutes: Groups route registered at /:sessionId/groups');

export { router as messageRoutes }; 