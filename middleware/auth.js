const mongodbService = require('../services/mongodb');

/**
 * Middleware לאימות משתמש באמצעות MongoDB
 */
const authMiddleware = async (req, res, next) => {
  try {
    // בדיקה אם יש מזהה משתמש ישירות בבקשה (עדיף על פני טוקן)
    if (req.body && req.body.userId) {
      req.userId = req.body.userId;
      console.log(`Auth middleware using userId from request body: ${req.userId}`);
      return next();
    } else if (req.query && req.query.userId) {
      req.userId = req.query.userId;
      console.log(`Auth middleware using userId from query params: ${req.userId}`);
      return next();
    } else if (req.headers && req.headers['x-user-id']) {
      req.userId = req.headers['x-user-id'];
      console.log(`Auth middleware using userId from headers: ${req.userId}`);
      return next();
    }
    
    // אם הגענו לכאן, אין מזהה ישיר ואנו מנסים לפענח את הטוקן
    
    // במצב פיתוח, השתמש במשתמש ברירת מחדל אם אין טוקן
    if (process.env.NODE_ENV === 'development') {
      const defaultUserId = 'PIHxt2lDk8bahTSRmSTvaznBXa23';
      
      // בדיקה אם קיים token
      const token = req.headers.authorization;
      if (!token) {
        console.log(`No token in development mode, using default userId: ${defaultUserId}`);
        req.userId = defaultUserId;
        return next();
      }
      
      try {
        // נסה לפענח את הטוקן
        const decodedToken = await mongodbService.verifyIdToken(token.replace('Bearer ', ''));
        if (decodedToken && decodedToken.uid) {
          req.userId = decodedToken.uid;
          console.log(`Auth middleware set userId to: ${req.userId} from token (in development)`);
          return next();
        } else {
          // אם הפענוח נכשל, השתמש במשתמש ברירת מחדל
          req.userId = defaultUserId;
          console.log(`Token decode failed in development, using default userId: ${defaultUserId}`);
          return next();
        }
      } catch (tokenError) {
        // במקרה של שגיאת פענוח, השתמש במשתמש ברירת מחדל
        console.log(`Token verification error in development, using default userId: ${defaultUserId}`);
        req.userId = defaultUserId;
        return next();
      }
    }
    
    // במצב ייצור
    
    // בדיקה אם קיים token
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing'
      });
    }
    
    // אימות ה-token
    try {
      const decodedToken = await mongodbService.verifyIdToken(token.replace('Bearer ', ''));
      
      if (!decodedToken || !decodedToken.uid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token - could not extract user ID'
        });
      }
      
      // הוספת מזהה המשתמש לבקשה
      req.userId = decodedToken.uid;
      console.log(`Auth middleware set userId to: ${req.userId} from token`);
      next();
    } catch (tokenError) {
      console.error('Token verification error:', tokenError);
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        error: process.env.NODE_ENV === 'development' ? tokenError.message : undefined
      });
    }
  } catch (error) {
    console.error('Auth error:', error);
    
    // במקרה של כישלון אימות, נשתמש במשתמש ברירת מחדל במצב פיתוח
    if (process.env.NODE_ENV === 'development') {
      req.userId = 'PIHxt2lDk8bahTSRmSTvaznBXa23';
      console.log(`Auth error, using default userId: ${req.userId} in development mode`);
      return next();
    }
    
    res.status(401).json({
      success: false,
      message: 'לא מורשה',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = { authMiddleware }; 