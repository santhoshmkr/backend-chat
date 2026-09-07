const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/:conversationId', messageController.getMessages);
router.post('/', messageController.sendMessage);
router.put('/:conversationId/read', messageController.markAsRead);
router.delete('/:id', messageController.deleteMessage);
router.get('/:conversationId/search', messageController.searchMessages);

module.exports = router;
