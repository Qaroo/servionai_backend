const express = require('express');
const router = express.Router();
const mongodb = require('../services/mongodb');
const { authMiddleware } = require('../middleware/auth');

// ניתוב מאובטח שדורש הרשאות מנהל
const requireAdmin = async (req, res, next) => {
  try {
    const user = await mongodb.getUserData(req.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: User is not an admin' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error during admin authentication' 
    });
  }
};

// קבל את כל המשתמשים במערכת
router.get('/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const users = await mongodb.getAllUsers(req.userId);
    return res.json({ success: true, users });
  } catch (error) {
    console.error('Error getting all users:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve users',
      error: error.message 
    });
  }
});

// קבל פרטי משתמש מפורטים
router.get('/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const userDetails = await mongodb.getUserDetailsForAdmin(req.userId, req.params.userId);
    return res.json({ success: true, userDetails });
  } catch (error) {
    console.error('Error getting user details:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve user details',
      error: error.message 
    });
  }
});

// אקטיבציה/השבתה של משתמש
router.put('/users/:userId/activate', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { isActive, notes } = req.body;
    const updatedUser = await mongodb.setUserActiveStatus(
      req.userId, 
      req.params.userId, 
      isActive, 
      notes
    );
    
    // אם המשתמש הופעל, יש לוודא שגם העדכון במערכת יתבצע כראוי
    // כך שהמשתמש יוכל להשתמש בWhatsApp לאחר האקטיבציה
    if (isActive) {
      console.log(`User ${req.params.userId} activated by admin ${req.userId}. Updating user status.`);
    }
    
    return res.json({ 
      success: true, 
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error updating user active status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update user status',
      error: error.message 
    });
  }
});

// עדכון הרשאות מנהל
router.put('/users/:userId/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { isAdmin } = req.body;
    const updatedUser = await mongodb.setUserAdminStatus(
      req.userId, 
      req.params.userId, 
      isAdmin
    );
    
    return res.json({ 
      success: true, 
      message: `Admin rights ${isAdmin ? 'granted' : 'revoked'} successfully`,
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error updating admin status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update admin rights',
      error: error.message 
    });
  }
});

// עדכון פרטי משתמש
router.put('/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const updatedUser = await mongodb.updateUserDetails(
      req.userId, 
      req.params.userId, 
      req.body
    );
    
    return res.json({ 
      success: true, 
      message: 'User details updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Error updating user details:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update user details',
      error: error.message 
    });
  }
});

// אימון בוט למשתמש על ידי מנהל
router.post('/users/:userId/train-bot', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await mongodb.trainUserBotByAdmin(
      req.userId, 
      req.params.userId, 
      req.body
    );
    
    return res.json({ 
      success: true, 
      message: 'Bot training initiated successfully',
      trainingStatus: result 
    });
  } catch (error) {
    console.error('Error initiating bot training:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to initiate bot training',
      error: error.message 
    });
  }
});

// יצירת מנהל ראשון במערכת (ללא צורך באימות - אבטחה מתבצעת בשירות)
router.post('/initialize', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }
    
    const result = await mongodb.createInitialAdmin(email);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    return res.json(result);
  } catch (error) {
    console.error('Error initializing admin:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to initialize admin',
      error: error.message 
    });
  }
});

// עדכון הגדרות כלליות של המערכת
router.put('/settings', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // TODO: להוסיף פונקציונליות לעדכון הגדרות מערכת בהמשך
    return res.json({ 
      success: true, 
      message: 'System settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to update system settings',
      error: error.message 
    });
  }
});

// יצירת משתמש חדש (זמין רק למנהלים)
router.post('/users/create', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      email,
      displayName,
      isAdmin = false,
      isActive = true,
      notes = '',
      businessInfo = {}
    } = req.body;
    
    // בדיקות תקינות
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    // בדיקה האם המשתמש כבר קיים במערכת
    const existingUser = await mongodb.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // יצירת מזהה ייחודי למשתמש החדש
    const userId = `user-${Date.now()}`;
    
    // יצירת המשתמש במערכת
    const newUser = {
      uid: userId,
      email,
      displayName: displayName || email.split('@')[0],
      isAdmin,
      isActive,
      notes,
      createdAt: new Date(),
      activatedAt: isActive ? new Date() : null,
      activatedBy: req.userId,
      businessInfo: businessInfo
    };
    
    // שמירת המשתמש החדש
    const user = new mongodb.collections.User(newUser);
    await user.save();
    
    return res.json({
      success: true,
      message: 'User created successfully',
      user: user.toObject()
    });
  } catch (error) {
    console.error('Error creating new user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

module.exports = router; 