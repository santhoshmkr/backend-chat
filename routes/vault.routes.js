const express = require('express');
const router = express.Router();
const vaultController = require('../controllers/vault.controller');
const { protect } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

router.use(protect);

router.post('/setup-pin', vaultController.setupPin);
router.post('/verify-pin', vaultController.verifyPin);
router.put('/change-pin', vaultController.changePin);
router.get('/media', vaultController.getVaultMedia);
router.post('/media', upload.single('vaultMedia'), vaultController.uploadVaultMedia);
router.delete('/media/:id', vaultController.deleteVaultMedia);

module.exports = router;
