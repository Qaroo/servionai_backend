const express = require('express');
const router = express.Router();
const mongodb = require('../services/mongodb');
const auth = require('../middleware/auth');

/**
 * הפיכת משתמש למנהל מערכת - גישה מהירה
 * הערה: בתרחיש אמיתי, משתמשים בהגנה חזקה יותר
 */
router.post('/make-admin', async (req, res) => {
  try {
    const { email, secretKey } = req.body;
    
    // בדיקת מפתח סודי פשוט - במצב אמיתי יש להשתמש בשיטות אבטחה חזקות יותר
    if (secretKey !== 'servion-admin-1234') {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid secret key' 
      });
    }
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }
    
    // חיפוש המשתמש לפי אימייל - יצירת משתמש חדש אם לא קיים
    let user = null;
    
    try {
      // חיפוש משתמש קיים לפי אימייל באמצעות ה-collections המיוצא מ-mongodb
      const userData = await mongodb.findUserByEmail(email);
      
      if (userData) {
        // עדכון המשתמש כמנהל מערכת פעיל
        const updatedUser = await mongodb.setUserAsAdmin(userData.uid, 'Made admin via API');
        
        if (updatedUser) {
          return res.json({
            success: true,
            message: `User ${email} is now an admin`,
            user: {
              uid: updatedUser.uid,
              email: updatedUser.email,
              displayName: updatedUser.displayName,
              isAdmin: updatedUser.isAdmin,
              isActive: updatedUser.isActive
            }
          });
        }
      } else {
        // משתמש לא קיים, יצירת משתמש חדש עם הרשאות מנהל
        const adminId = `admin-${Date.now()}`;
        const newAdmin = await mongodb.createNewAdmin(email, adminId);
        
        if (newAdmin) {
          return res.json({
            success: true,
            message: `New admin user created with email ${email}`,
            user: {
              uid: newAdmin.uid,
              email: newAdmin.email,
              displayName: newAdmin.displayName || 'System Administrator',
              isAdmin: newAdmin.isAdmin,
              isActive: newAdmin.isActive
            }
          });
        }
      }
      
      // אם הגענו לכאן, לא הצלחנו לעדכן או ליצור משתמש מנהל
      return res.status(500).json({
        success: false,
        message: 'Failed to create or update admin user'
      });
      
    } catch (innerError) {
      console.error('Error finding or updating user:', innerError);
      return res.status(500).json({
        success: false,
        message: 'Failed to process user data',
        error: innerError.message
      });
    }
    
  } catch (error) {
    console.error('Error making user admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while making user admin',
      error: error.message
    });
  }
});

module.exports = router; 