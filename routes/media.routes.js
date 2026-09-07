const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/media.controller');
const { protect } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

router.use(protect);

router.post('/upload', upload.single('file'), mediaController.uploadMedia);
router.delete('/', mediaController.deleteMedia);

module.exports = router;
