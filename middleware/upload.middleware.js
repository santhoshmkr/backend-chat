const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'images';
    
    if (file.fieldname === 'avatar') {
      subDir = 'avatars';
    } else if (file.fieldname === 'vaultMedia') {
      subDir = 'vault';
    } else if (file.mimetype.startsWith('audio/')) {
      subDir = 'audio';
    } else if (file.mimetype.startsWith('video/')) {
      subDir = 'videos';
    } else if (file.mimetype.startsWith('image/')) {
      subDir = 'images';
    } else {
      subDir = 'documents';
    }

    cb(null, path.join(__dirname, '..', 'uploads', subDir));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  // Allow all standard web media and documents
  const allowedMimePrefixes = ['image/', 'video/', 'audio/', 'application/pdf', 'application/msword', 'application/vnd', 'text/'];
  const isAllowed = allowedMimePrefixes.some((prefix) => file.mimetype.startsWith(prefix));
  
  if (isAllowed || file.mimetype === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not supported`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB maximum per file
  },
});

module.exports = upload;
