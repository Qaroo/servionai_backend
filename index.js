require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const app = require('./app');
const { connectDB } = require('./config/db');
const { redisClient } = require('./config/redis');
const { PORT = 5001 } = process.env;

// אם לא הוגדר סביבה, נקבע לפיתוח כברירת מחדל
if (!process.env.NODE_ENV) {
  console.log('NODE_ENV not set, defaulting to development mode');
  process.env.NODE_ENV = 'development';
}

console.log(`Starting server in ${process.env.NODE_ENV} mode`);

// התחברות ל-Redis
const initRedis = async () => {
  try {
    await redisClient.ping();
    console.log('Redis connection test successful');
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Redis connection failed in production mode:', error);
      process.exit(1);
    } else {
      console.warn('Redis connection failed in development mode - continuing without Redis');
    }
  }
};

// Routes
const whatsappRoutes = require('./routes/whatsapp');
const aiRoutes = require('./routes/ai');
const naamaRoutes = require('./routes/naama');
const botRoutes = require('./routes/bot');
const adminRoutes = require('./routes/admin');
const usersRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const calendarRoutes = require('./routes/calendar');
const massMessageRoutes = require('./routes/mass-message');

// Services
// const { initializeFirebase } = require('./services/firebase');
const { initializeMongoDB } = require('./services/mongodb');
const { initializeWhatsApp } = require('./services/whatsapp');

// Initialize Express app
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Create sessions directory if it doesn't exist
const sessionsDir = process.env.SESSIONS_DIR || './sessions';
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// הגדרת מגבלות בקשות רק למצב ייצור
if (process.env.NODE_ENV === 'production') {
  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 דקה
    max: 60, // 60 בקשות בדקה בייצור
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests, please try again later",
      retryAfter: 1
    }
  });
  
  // יישום ה-middleware של מגבלת הבקשות רק על ה-API במצב ייצור
  app.use('/api', apiLimiter);
  console.log('Rate limiting enabled for production environment');
} else {
  console.log('Rate limiting disabled for development environment');
}

// Define routes before starting the server
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai', naamaRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/mass-message', massMessageRoutes);

// הוספת שירות סטטי לתיקיית הקבצים הזמניים (כולל קבצי אודיו)
const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
app.use('/temp', express.static(tempDir));
console.log(`Serving static files from ${tempDir}`);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'שגיאת שרת פנימית',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'הנתיב המבוקש לא נמצא'
  });
});

const startServer = async () => {
  try {
    // התחברות ל-MongoDB ואתחול המודלים
    await initializeMongoDB();
    console.log('MongoDB models initialized successfully');

    // התחברות ל-Redis
    await initRedis();
    console.log('Redis connection test successful');

    // אתחול שירות WhatsApp
    await initializeWhatsApp(io);
    console.log('WhatsApp service initialized');

    // הפעלת השרת
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = { app, server, io }; 