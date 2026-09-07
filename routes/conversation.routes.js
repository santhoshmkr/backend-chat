const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversation.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', conversationController.getConversations);
router.get('/:id', conversationController.getConversationById);
router.post('/with/:userId', conversationController.getOrCreateConversation);
router.put('/:id/pin', conversationController.togglePin);
router.put('/:id/mute', conversationController.toggleMute);

module.exports = router;
