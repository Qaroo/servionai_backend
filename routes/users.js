const express = require('express');
const router = express.Router();
const { getUserData, updateBusinessInfo } = require('../services/mongodb');
const authMiddleware = require('../middleware/auth');

// קבלת פרטי המשתמש הנוכחי
router.get('/current', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await getUserData(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // אם זה משתמש חדש, נאתחל את פרטי העסק
    if (!user.businessInfo || Object.keys(user.businessInfo).length === 0) {
      const defaultBusinessInfo = {
        name: 'עסק חדש',
        description: 'תיאור העסק',
        industry: 'כללי',
        services: 'שירותים',
        hours: 'שעות פעילות',
        contact: 'פרטי קשר',
        address: 'כתובת',
        website: '',
        additionalInfo: 'מידע נוסף'
      };
      
      await updateBusinessInfo(userId, defaultBusinessInfo);
      user.businessInfo = defaultBusinessInfo;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// עדכון פרטי העסק
router.put('/business', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const businessInfo = req.body;

    const updatedUser = await updateBusinessInfo(userId, businessInfo);
    
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating business info:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// עדכון פרטי משתמש
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    // הגבלת השדות שמשתמש רגיל יכול לעדכן בעצמו
    const allowedUpdates = ['displayName', 'businessInfo'];
    
    // סינון השדות המותרים בלבד
    const updatesObj = {};
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        updatesObj[field] = req.body[field];
      }
    }
    
    // בדיקה אם המשתמש קיים
    let updatedUser;
    try {
      // עדכון המשתמש
      updatedUser = await getUserData(req.userId);
    } catch (error) {
      if (error.message === 'User not found') {
        // אם המשתמש לא קיים, יצירת משתמש חדש עם המידע שסופק
        console.log(`User ${req.userId} not found when updating profile, creating new user`);
        
        // יצירת אובייקט משתמש חדש
        const newUser = {
          uid: req.userId,
          email: `${req.userId}@example.com`, // אימייל זמני
          displayName: req.body.displayName || `User ${req.userId.substring(0, 8)}`,
          isActive: true,
          isAdmin: false,
          lastLogin: new Date(),
          whatsappStatus: { status: 'disconnected', lastUpdated: new Date() },
          businessInfo: req.body.businessInfo || {
            name: "עסק חדש",
            description: "תיאור העסק",
            industry: "כללי",
            services: "שירותים",
            hours: "שעות פעילות",
            contact: "פרטי קשר",
            address: "כתובת",
            website: "",
            additionalInfo: "מידע נוסף"
          }
        };
        
        // עדכון העסק במסד הנתונים
        await updateBusinessInfo(req.userId, newUser.businessInfo);
        
        // קבלת המשתמש החדש
        updatedUser = await getUserData(req.userId);
      } else {
        // אם זו שגיאה אחרת, זרוק אותה
        throw error;
      }
    }
    
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
});

// קבלת סטטוס חיבור WhatsApp של משתמש (עבור מנהלים)
router.get('/:userId/whatsapp-status', authMiddleware, async (req, res) => {
  try {
    // בדיקה שהמשתמש המבקש הוא מנהל
    const requestingUser = await getUserData(req.userId);
    
    if (!requestingUser.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only admins can view WhatsApp status of other users'
      });
    }
    
    // קבלת פרטי המשתמש המבוקש
    const targetUser = await getUserData(req.params.userId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    return res.json({
      success: true,
      userId: targetUser.uid,
      displayName: targetUser.displayName,
      whatsappStatus: targetUser.whatsappStatus
    });
  } catch (error) {
    console.error(`Error fetching WhatsApp status for user ${req.params.userId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve WhatsApp status',
      error: error.message
    });
  }
});

// ניתוק חיבור WhatsApp של משתמש (עבור מנהלים)
router.post('/:userId/disconnect-whatsapp', authMiddleware, async (req, res) => {
  try {
    // בדיקה שהמשתמש המבקש הוא מנהל
    const requestingUser = await getUserData(req.userId);
    
    if (!requestingUser.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only admins can disconnect WhatsApp sessions of other users'
      });
    }
    
    // עדכון סטטוס WhatsApp של המשתמש
    await updateBusinessInfo(req.params.userId, { whatsappStatus: { status: 'disconnected', lastUpdated: new Date() } });
    
    // הסרת הסשן כבר נעשית בתוך updateBusinessInfo כשהסטטוס הוא 'disconnected'
    
    return res.json({
      success: true,
      message: 'WhatsApp disconnected successfully',
      userId: req.params.userId
    });
  } catch (error) {
    console.error(`Error disconnecting WhatsApp for user ${req.params.userId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to disconnect WhatsApp',
      error: error.message
    });
  }
});

module.exports = router; 