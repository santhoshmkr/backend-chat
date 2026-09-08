require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/db');
const { initSocket } = require('./sockets/socket');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const conversationRoutes = require('./routes/conversation.routes');
const messageRoutes = require('./routes/message.routes');
const mediaRoutes = require('./routes/media.routes');
const callRoutes = require('./routes/call.routes');
const privacyRoutes = require('./routes/privacy.routes');
const vaultRoutes = require('./routes/vault.routes');

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration for web, Android Capacitor, and local development
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost',
  'capacitor://localhost',
  'http://localhost:8100',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, capacitor)
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev mode
      }
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting for sensitive auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    errorCode: 'TOO_MANY_REQUESTS',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AuraChat API Server is active and running',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/vault', vaultRoutes);

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});
// Central error handler
app.use(errorHandler);

// Initialize Socket.IO
initSocket(server, allowedOrigins);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`🚀 AuraChat Server running on port ${PORT}`);
    console.log(`📡 Socket.IO Real-Time & WebRTC Active`);
    console.log(`📁 Uploads available at http://localhost:${PORT}/uploads`);
    console.log(`=========================================`);
  });

  // Connect to DB asynchronously
  connectDB().catch((err) => {
    console.warn('[MongoDB] Initial connection error:', err.message);
  });
};

startServer();

module.exports = { app, server };
