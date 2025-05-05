const { getUserData, updateBusinessInfo } = require('../services/mongodb');
const { User } = require('../models');

/**
 * Middleware לאימות משתמש באמצעות MongoDB
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'No authorization header' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
      // Decode the JWT token to get the payload
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        return res.status(401).json({ success: false, message: 'Invalid token format' });
    }
    
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const userId = payload.user_id; // Get the user_id from the decoded token

      if (!userId) {
        return res.status(401).json({ success: false, message: 'No user ID in token' });
      }

      // Check if user exists in database
      let user = await getUserData(userId);
      
      // If user doesn't exist, create new user
      if (!user) {
        console.log(`User ${userId} not found, creating new user`);
        
        const newUser = new User({
          uid: userId,
          email: payload.email || `${userId}@example.com`,
          displayName: payload.name || `User ${userId.substring(0, 8)}`,
          role: 'user',
          isActive: true,
          whatsappStatus: { status: 'disconnected', lastUpdated: new Date() },
          businessInfo: {
            name: 'עסק חדש',
            description: 'תיאור העסק',
            industry: 'כללי',
            services: 'שירותים',
            hours: 'שעות פעילות',
            contact: 'פרטי קשר',
            address: 'כתובת',
            website: '',
            additionalInfo: 'מידע נוסף'
          }
        });
        
        await newUser.save();
        user = await getUserData(userId);
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'User is not active' });
      }

      req.userId = userId;
      req.user = user;
      
    next();
    } catch (error) {
      console.error('Error in user authentication:', error);
      return res.status(500).json({ success: false, message: 'Error authenticating user' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { authMiddleware }; 