const fs = require('fs');
const path = require('path');

const uploadBaseDir = path.resolve(__dirname, '..', 'uploads');

// Ensure upload subdirectories exist
const subDirs = ['images', 'videos', 'audio', 'documents', 'avatars', 'vault'];
subDirs.forEach((sub) => {
  const dirPath = path.join(uploadBaseDir, sub);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

class StorageService {
  constructor(provider = process.env.STORAGE_PROVIDER || 'local') {
    this.provider = provider;
  }

  // Get full public URL for a file
  getFileUrl(req, relativePath) {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 5000}`;
    const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    return `${protocol}://${host}${cleanPath}`;
  }

  // Delete a file from disk
  async deleteFile(fileUrlOrPath) {
    try {
      if (!fileUrlOrPath) return false;
      let relativePath = fileUrlOrPath;
      if (fileUrlOrPath.startsWith('http://') || fileUrlOrPath.startsWith('https://')) {
        const urlObj = new URL(fileUrlOrPath);
        relativePath = urlObj.pathname;
      }
      
      // Prevent directory traversal
      const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(path.resolve(__dirname, '..'), safePath);
      
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[StorageService] Error deleting file:', err.message);
      return false;
    }
  }
}

module.exports = new StorageService();
