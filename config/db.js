const mongoose = require('mongoose');

let retryTimer = null;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aurachat';

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2000,
    });
    console.log(`[MongoDB] Connected successfully to ${conn.connection.host}/${conn.connection.name}`);
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    return conn;
  } catch (err) {
    console.warn(`[MongoDB] Note: MongoDB not reachable at ${uri} (${err.message}).`);
    console.log('[MongoDB] For persistence, start local MongoDB or provide MONGODB_URI (e.g. MongoDB Atlas) in backend/.env');
    if (!retryTimer) {
      console.log('[MongoDB] Background auto-reconnect scheduled every 15 seconds...');
      retryTimer = setInterval(connectDB, 15000);
    }
    return null;
  }
};

const disconnectDB = async () => {
  if (retryTimer) clearInterval(retryTimer);
  await mongoose.disconnect();
};

module.exports = { connectDB, disconnectDB };
