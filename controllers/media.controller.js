const storageService = require('../services/storage.service');

// POST /api/media/upload
exports.uploadMedia = async (req, res, next) => {
  try {
    if (!req.file && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'No file was uploaded',
        errorCode: 'NO_FILE',
      });
    }

    const file = req.file || req.files[0];
    let subDir = 'images';
    if (file.mimetype.startsWith('audio/')) subDir = 'audio';
    else if (file.mimetype.startsWith('video/')) subDir = 'videos';
    else if (!file.mimetype.startsWith('image/')) subDir = 'documents';

    const fileUrl = storageService.getFileUrl(req, `/uploads/${subDir}/${file.filename}`);

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/media
exports.deleteMedia = async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'Media URL is required',
        errorCode: 'NO_URL',
      });
    }

    const deleted = await storageService.deleteFile(url);
    res.status(200).json({
      success: true,
      deleted,
    });
  } catch (error) {
    next(error);
  }
};
