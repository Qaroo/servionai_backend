const mongodbService = require('../services/mongodb');

/**
 * Middleware לאימות משתמש באמצעות MongoDB
 */
const authMiddleware = async (req, res, next) => {
  try {
    // במצב פיתוח, אפשר גישה ללא אימות
    if (process.env.NODE_ENV === 'development') {
      // בדיקת userId מהגוף, query params, או headers
      if (req.body && req.body.userId) {
        req.userId = req.body.userId;
      } else if (req.query && req.query.userId) {
        req.userId = req.query.userId;
      } else if (req.headers && req.headers['x-user-id']) {
        req.userId = req.headers['x-user-id'];
      } else {
        // במקום test-user, נשתמש במזהה שונה למשתמש אמיתי
        req.userId = 'real-user-123';
      }
      return next();
    }
    
    // בדיקה אם קיים token
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing'
      });
    }
    
    // אימות ה-token
    const decodedToken = await mongodbService.verifyIdToken(token.replace('Bearer ', ''));
    
    // הוספת מזהה המשתמש לבקשה
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({
      success: false,
      message: 'לא מורשה',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = authMiddleware; 