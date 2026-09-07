const express = require('express');
const router = express.Router();
const privacyController = require('../controllers/privacy.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', privacyController.getPrivacySettings);
router.put('/', privacyController.updatePrivacySettings);
router.post('/block/:userId', privacyController.blockUser);
router.post('/unblock/:userId', privacyController.unblockUser);

module.exports = router;
