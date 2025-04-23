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

// אם לא הוגדר סביבה, נקבע לפיתוח כברירת מחדל
if (!process.env.NODE_ENV) {
  console.log('NODE_ENV not set, defaulting to development mode');
  process.env.NODE_ENV = 'development';
  process.env.FORCE_DEV_MODE = 'true';

console.log(`Starting server in ${process.env.NODE_ENV} mode`);
console.log(`Force development mode: ${process.env.FORCE_DEV_MODE === 'true' ? 'Yes' : 'No'}`);

}else{
  console.log('NODE_ENV set to:', process.env.NODE_ENV);
}


// Routes
const whatsappRoutes = require('./routes/whatsapp');
const aiRoutes = require('./routes/ai');
const naamaRoutes = require('./routes/naama');
const botRoutes = require('./routes/bot');

// Services
// const { initializeFirebase } = require('./services/firebase');
const { initializeMongoDB } = require('./services/mongodb');
const { initializeWhatsApp } = require('./services/whatsapp');

// Initialize Express app
const app = express();
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

// Initialize MongoDB instead of Firebase
initializeMongoDB()
  .then(success => {
    if (success) {
      console.log('MongoDB connected successfully');
    } else {
      console.error('Failed to connect to MongoDB');
      
      // במצב פיתוח אפשר להמשיך גם ללא חיבור למסד נתונים
      if (process.env.NODE_ENV === 'development') {
        console.log('Development mode: Continuing without MongoDB connection');
      } else {
        process.exit(1);
      }
    }
  })
  .catch(err => {
    console.error('MongoDB initialization error:', err);
    
    // במצב פיתוח אפשר להמשיך גם ללא חיבור למסד נתונים
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Continuing without MongoDB connection');
    } else {
      process.exit(1);
    }
  });

// Initialize WhatsApp
initializeWhatsApp(io);

// Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai', naamaRoutes);
app.use('/api/bot', botRoutes);

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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ServionAI Server                                        ║
  ║   Running on port ${PORT}                                    ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}                                ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
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