const express = require('express');
const router = express.Router();
const fs = require('fs');

/**
 * @route GET /api/health
 * @desc Server health check endpoint for monitoring
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    // בדיקת בריאות המערכת
    const healthData = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      nodejs: process.version,
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      },
      // בדיקת תיקיות קריטיות
      directories: {
        sessions: {
          path: process.env.SESSIONS_DIR || './sessions',
          exists: fs.existsSync(process.env.SESSIONS_DIR || './sessions'),
          writable: checkDirectoryWritable(process.env.SESSIONS_DIR || './sessions')
        },
        temp: {
          path: process.env.TEMP_DIR || './temp',
          exists: fs.existsSync(process.env.TEMP_DIR || './temp'),
          writable: checkDirectoryWritable(process.env.TEMP_DIR || './temp')
        }
      }
    };
    
    res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * בדיקה אם תיקייה קיימת וניתנת לכתיבה
 * @param {string} dirPath - נתיב התיקייה
 * @returns {boolean} האם התיקייה קיימת וניתנת לכתיבה
 */
function checkDirectoryWritable(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      return false;
    }
    
    // ניסיון ליצור קובץ זמני
    const testFile = `${dirPath}/write-test-${Date.now()}.tmp`;
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch (error) {
    console.error(`Directory ${dirPath} is not writable:`, error.message);
    return false;
  }
}

module.exports = router; 