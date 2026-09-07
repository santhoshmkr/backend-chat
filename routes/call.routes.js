const express = require('express');
const router = express.Router();
const callController = require('../controllers/call.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/history', callController.getCallHistory);
router.post('/log', callController.logCall);

module.exports = router;
