const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const whatsappService = require('../services/whatsapp');
const openaiService = require('../services/openai');
const mongodbService = require('../services/mongodb');

// מאגר לניהול בקשות אחרונות של כל משתמש
const lastRequests = new Map();

// מידלוור להגבלת קצב בקשות (rate limiting) עבור נתיב /status
const statusRateLimiter = (req, res, next) => {
  const userId = req.params.userId;
  const now = Date.now();
  
  // בדיקה אם המשתמש שלח בקשה לאחרונה
  if (lastRequests.has(userId)) {
    const lastRequest = lastRequests.get(userId);
    const timeSinceLastRequest = now - lastRequest;
    
    // מרווחי זמן מופחתים להפחתת עומס
    // במצב פיתוח אנחנו מאפשרים בקשות יותר תכופות
    const minInterval = process.env.NODE_ENV === 'development' ? 5000 : 3000; // 5 שניות בפיתוח, 3 שניות בייצור
    
    if (timeSinceLastRequest < minInterval) {
      // חישוב מדויק של זמן ההמתנה בשניות
      const retryAfter = Math.ceil((minInterval - timeSinceLastRequest) / 1000);
      
      console.log(`Rate limiting status check for ${userId}, must wait ${retryAfter}s`);
      
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        retryAfter: retryAfter
      });
    }
  }
  
  // עדכון זמן הבקשה האחרונה
  lastRequests.set(userId, now);
  
  // ניקוי בקשות ישנות מדי פעם
  if (Math.random() < 0.1) { // 10% סיכוי לנקות בכל בקשה
    cleanupOldRequests();
  }
  
  next();
};

// פונקציה לניקוי בקשות ישנות
const cleanupOldRequests = () => {
  const now = Date.now();
  const maxAge = 3600000; // שעה אחת
  
  lastRequests.forEach((timestamp, userId) => {
    if (now - timestamp > maxAge) {
      lastRequests.delete(userId);
    }
  });
};

// נקודת קצה פשוטה לבדיקת זמינות השרת
router.get('/ping', async (req, res) => {
  try {
    return res.status(200).json({
      status: 'ok',
      message: 'WhatsApp service is running',
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Error in ping endpoint:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// אתחול WhatsApp וקבלת QR code
router.post('/init', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || req.body.userId; // אפשרות לקבל userId מהבקשה (למטרות פיתוח)
    
    // וידוא שיש userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // יצירת לקוח WhatsApp חדש
    const result = await whatsappService.createClient(userId);
    
    // המתנה קצרה לקבלת קוד QR
    if (result.status === 'INITIALIZING') {
      // המתנה לקבלת קוד QR (מקסימום 10 שניות)
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (whatsappService.clients.has(userId)) {
          const clientInfo = whatsappService.clients.get(userId);
          
          if (clientInfo.qrCode) {
            return res.json({
              success: true,
              status: 'connecting',
              qrCode: clientInfo.qrCode
            });
          }
        }
      }
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה באתחול WhatsApp',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// בדיקת סטטוס חיבור - מוגבל בקצב בקשות
router.get('/status/:userId', statusRateLimiter, authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // במצב פיתוח, אין צורך לבדוק אם המשתמש מבקש מידע על עצמו
    if (userId !== req.userId && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this user\'s status'
      });
    }
    
    // בדיקת סטטוס החיבור
    try {
      const status = await whatsappService.checkStatus(userId);
      return res.json(status);
    } catch (statusError) {
      console.error(`Error in WhatsApp status check for ${userId}:`, statusError);
      
      // במצב פיתוח, החזר סטטוס מנותק במקום שגיאה
      if (process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          status: 'disconnected',
          message: 'Development mode: Error in status check, defaulting to disconnected',
          isDevelopment: true
        });
      }
      
      throw statusError; // העבר את השגיאה לטיפול הכללי
    }
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    // שגיאת אימות - 403, שגיאות אחרות - 500
    const statusCode = error.message.includes('אימות') ? 403 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: 'אירעה שגיאה בבדיקת סטטוס WhatsApp',
      error: process.env.NODE_ENV === 'development' ? error.message : 'שגיאת שרת פנימית'
    });
  }
});

// קבלת QR code
router.get('/qr/:userId', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // במצב פיתוח, אין צורך לבדוק אם המשתמש מבקש מידע על עצמו
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    const isDevelopment = process.env.NODE_ENV === 'development' || isLocalhost;
    
    // מתירים גישה במצב פיתוח או כשהמשתמש מבקש את הקוד שלו עצמו
    if (userId !== req.userId && !isDevelopment) {
      console.log(`Forbidden: userId in params (${userId}) doesn't match authenticated user (${req.userId})`);
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this user\'s QR code'
      });
    }
    
    // קבלת קוד QR
    const result = await whatsappService.getQrCode(userId);
    
    res.json(result);
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בקבלת קוד QR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// שליחת הודעה
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { chatId, message } = req.body;
    const userId = req.userId;
    
    // וידוא שיש את כל הפרטים הנדרשים
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID and message are required'
      });
    }
    
    // שליחת ההודעה
    const result = await whatsappService.sendMessage(userId, chatId, message);
    
    res.json(result);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בשליחת ההודעה',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// התנתקות מ-WhatsApp
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    // ניתוק המשתמש
    const result = await whatsappService.disconnect(userId);
    
    res.json(result);
  } catch (error) {
    console.error('Error disconnecting from WhatsApp:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בניתוק מ-WhatsApp',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// קבלת כל השיחות של המשתמש
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const useReal = req.query.useReal === 'true'; // פרמטר חדש שיאפשר לקבל שיחות אמיתיות

    // במצב פיתוח, ואם לא ביקשו שיחות אמיתיות, החזר נתונים לדוגמה
    if (process.env.NODE_ENV === 'development' && !useReal) {
      const mockConversations = Array.from({ length: 10 }).map((_, index) => ({
        id: `mock-conv-${index}`,
        phoneNumber: `+972-${Math.floor(Math.random() * 900000000) + 100000000}`,
        name: `לקוח לדוגמה ${index + 1}`,
        lastMessage: index % 3 === 0 
          ? 'האם המוצר עדיין זמין?' 
          : index % 3 === 1 
            ? 'תודה רבה על השירות המהיר!' 
            : 'מתי ניתן לקבל את ההזמנה?',
        lastMessageTime: new Date(Date.now() - (index * 86400000 / 2)), // כל שיחה בפער של חצי יום אחורה
        unreadCount: Math.floor(Math.random() * 4)
      }));
      
      return res.json({
        success: true,
        conversations: mockConversations,
        isMock: true
      });
    }
    
    // בסביבת ייצור או כאשר ביקשו שיחות אמיתיות, שליפת השיחות מפיירבייס
    const conversations = await whatsappService.getConversations(userId);
    
    // ודא שכל ה-lastMessageTime הם תאריכים תקינים
    const processedConversations = conversations.map(conv => {
      // אם אין תאריך או שהתאריך לא תקין, הגדר תאריך נוכחי
      if (!conv.lastMessageTime || isNaN(new Date(conv.lastMessageTime).getTime())) {
        return {
          ...conv,
          lastMessageTime: new Date()
        };
      }
      return conv;
    });
    
    res.json({
      success: true,
      conversations: processedConversations,
      isMock: false
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליפת השיחות'
    });
  }
});

/**
 * ייבוא שיחות מוואטסאפ לתצוגה בלבד (ללא שמירה)
 */
router.post('/import-conversations', authMiddleware, async (req, res) => {
  const userId = req.userId;
  const useRealData = req.body.useRealData === true; // פרמטר לאפשר שימוש בנתונים אמיתיים
  const viewOnly = req.body.viewOnly !== false; // כברירת מחדל, רק תצוגה ללא שמירה
  
  console.log(`[WhatsApp] Loading conversations for user ${userId}, useRealData: ${useRealData}, viewOnly: ${viewOnly}`);

  try {
    // בדיקה אם המשתמש שלח בקשת סטטוס לאחרונה (שימוש בנתוני rate limit)
    if (lastRequests.has(userId)) {
      const lastRequest = lastRequests.get(userId);
      const timeSinceLastRequest = Date.now() - lastRequest;
      
      // אם עברו פחות מ-2 שניות מאז בקשת הסטטוס האחרונה, מגבילים את הקצב
      if (timeSinceLastRequest < 2000) {
        const retryAfter = Math.ceil((2000 - timeSinceLastRequest) / 1000);
        console.log(`Rate limiting import request for ${userId}, too close to last status check. Wait ${retryAfter}s`);
        
        return res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later',
          retryAfter: retryAfter
        });
      }
    }

    // בדוק אם המשתמש מחובר לוואטסאפ (אלא אם במצב פיתוח)
    if (process.env.NODE_ENV !== 'development' || useRealData) {
      const status = await whatsappService.checkStatus(userId);
      
      // הוספת הדפסות דיבאג
      console.log('[WhatsApp] Status object:', JSON.stringify(status));
      
      // בדיקה משופרת שמתחשבת במגוון מקרים אפשריים
      const isConnected = 
        status.status === 'connected' || 
        status.status === 'CONNECTED' ||
        status === 'connected' || 
        (status.state && status.state === 'CONNECTED');
      
      console.log('[WhatsApp] Connection check result:', isConnected);
      
      // אם לא מחובר ולא במצב פיתוח, יש להחזיר שגיאה
      if (!isConnected && process.env.NODE_ENV !== 'development') {
        return res.status(400).json({ 
          success: false, 
          message: 'אינך מחובר לוואטסאפ. אנא התחבר לפני ייבוא השיחות' 
        });
      }
    }

    // בצע ייבוא של השיחות העדכניות, עם הפרמטר של נתונים אמיתיים והאם לשמור
    const result = await whatsappService.importConversationsFromWhatsApp(userId, { 
      useRealData,
      viewOnly,  // העברת פרמטר חדש שמציין שזה רק לתצוגה
      ignoreAuthErrors: process.env.NODE_ENV === 'development' // התעלם משגיאות אימות במצב פיתוח
    });
    
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(404).json(result);
    }
  } catch (error) {
    console.error(`[WhatsApp] Error importing conversations for user ${userId}:`, error);
    return res.status(500).json({ 
      success: false, 
      message: `שגיאה בייבוא השיחות: ${error.message || 'שגיאה לא ידועה'}` 
    });
  }
});

/**
 * בדיקת סטטוס של תהליך ייבוא
 */
router.get('/import-status', authMiddleware, async (req, res) => {
  const userId = req.userId;
  
  try {
    // בדיקת סטטוס הייבוא
    const importStatus = whatsappService.getImportStatus(userId);
    
    if (!importStatus.success) {
      return res.status(404).json(importStatus);
    }
    
    return res.json(importStatus);
  } catch (error) {
    console.error(`[WhatsApp] Error getting import status for user ${userId}:`, error);
    return res.status(500).json({ 
      success: false, 
      message: `שגיאה בבדיקת סטטוס הייבוא: ${error.message || 'שגיאה לא ידועה'}` 
    });
  }
});

/**
 * עצירת תהליך ייבוא פעיל
 */
router.post('/cancel-import', authMiddleware, async (req, res) => {
  const userId = req.userId;
  
  try {
    // ביטול הייבוא
    const result = whatsappService.cancelImport(userId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    return res.json(result);
  } catch (error) {
    console.error(`[WhatsApp] Error cancelling import for user ${userId}:`, error);
    return res.status(500).json({ 
      success: false, 
      message: `שגיאה בביטול הייבוא: ${error.message || 'שגיאה לא ידועה'}` 
    });
  }
});

// קבלת הודעות של שיחה ספציפית
router.get('/conversations/:chatId/messages', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const chatId = req.params.chatId;
    const useReal = req.query.useReal === 'true';

    // בדיקת תקינות
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'נדרש מזהה שיחה'
      });
    }
    
    // במצב פיתוח, ואם לא ביקשו נתונים אמיתיים, החזר נתוני דוגמה
    if (process.env.NODE_ENV === 'development' && !useReal) {
      // יצירת מערך הודעות לדוגמה
      const mockMessages = Array.from({ length: Math.floor(Math.random() * 15) + 5 }).map((_, index) => {
        const isFromMe = Math.random() > 0.5;
        const timestamp = new Date(Date.now() - (Math.random() * 86400000 * 3)); // עד 3 ימים אחורה
        
        // הודעות שונות בהתבסס על האינדקס והשולח
        let message = '';
        if (isFromMe) {
          if (index === 0) message = 'שלום, איך אני יכול לעזור לך?';
          else if (index % 5 === 0) message = 'האם יש עוד משהו שאוכל לעזור בו?';
          else if (index % 4 === 0) message = 'כמובן, אשמח לעזור. מה השאלה?';
          else if (index % 3 === 0) message = 'התשובה לשאלתך היא מורכבת. אשמח להסביר בפירוט.';
          else message = 'תודה על פנייתך. אנחנו כאן לשירותך.';
        } else {
          if (index === 1) message = 'היי, אני מתעניין במוצרים שלכם';
          else if (index % 5 === 1) message = 'מה שעות הפעילות שלכם?';
          else if (index % 4 === 1) message = 'תודה רבה על העזרה!';
          else if (index % 3 === 1) message = 'אשמח לקבל מידע נוסף על המוצר החדש';
          else message = 'האם ניתן לקבוע פגישת ייעוץ?';
        }
        
        return {
          id: `mock-msg-${chatId}-${index}`,
          body: message,
          fromMe: isFromMe,
          timestamp: timestamp,
          isAI: isFromMe && Math.random() > 0.7, // חלק מההודעות שלי הן מהבינה המלאכותית
          type: 'chat'
        };
      });
      
      // מיון לפי זמן, מהישן לחדש
      mockMessages.sort((a, b) => a.timestamp - b.timestamp);
      
      return res.json({
        success: true,
        messages: mockMessages,
        isMock: true
      });
    }
    
    // בסביבת ייצור או כאשר ביקשו נתונים אמיתיים, שליפת ההודעות מפיירבייס
    const messages = await whatsappService.getConversationMessages(userId, chatId);
    
    res.json({
      success: true,
      messages,
      isMock: false
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליפת הודעות השיחה'
    });
  }
});

// קבלת שיחות המשתמש
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const conversations = await mongodbService.getConversations(userId);
    
    // עיבוד השיחות לפורמט המתאים למסך
    const processedConversations = conversations.map(conv => {
      // קביעת זמן הודעה אחרונה תקין
      let lastMessageTime;
      if (conv.messages && conv.messages.length > 0 && conv.messages[conv.messages.length - 1]?.timestamp) {
        lastMessageTime = new Date(conv.messages[conv.messages.length - 1].timestamp);
        // אם התאריך לא תקין, השתמש בתאריך נוכחי
        if (isNaN(lastMessageTime.getTime())) {
          lastMessageTime = new Date();
        }
      } else {
        lastMessageTime = new Date();
      }

      return {
        id: conv.id,
        contactName: conv.contactName,
        phoneNumber: conv.phoneNumber,
        lastMessage: conv.messages[conv.messages.length - 1]?.body || '',
        lastMessageTime: lastMessageTime,
        summary: conv.summary || null
      };
    });
    
    res.json(processedConversations);
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// סיכום שיחה באמצעות AI
router.post('/summarize/:userId/:conversationId', async (req, res) => {
  try {
    const { userId, conversationId } = req.params;
    
    // קבלת השיחה ממסד הנתונים
    const conversation = await mongodbService.getConversation(userId, conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // יצירת סיכום באמצעות OpenAI
    const messages = conversation.messages.map(msg => ({
      role: msg.fromMe ? 'assistant' : 'user',
      content: msg.body
    }));
    
    const summary = await openaiService.generateConversationSummary(messages);
    
    // שמירת הסיכום במסד הנתונים
    await mongodbService.updateConversationSummary(userId, conversationId, summary);
    
    res.json({ summary });
  } catch (error) {
    console.error('Error summarizing conversation:', error);
    res.status(500).json({ error: 'Failed to summarize conversation' });
  }
});

/**
 * POST /api/whatsapp/send-mass-message
 * Send a message to multiple contacts
 */
router.post('/send-mass-message', authMiddleware, async (req, res) => {
  try {
    const { message, contacts } = req.body;
    const userId = req.user.uid;

    if (!message || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // שליחת ההודעות
    const results = await Promise.allSettled(
      contacts.map(async (contact) => {
        try {
          // פורמט מספר הטלפון
          let phoneNumber = contact.phone;
          // הסרת כל התווים שאינם ספרות
          phoneNumber = phoneNumber.replace(/\D/g, '');
          // הוספת 972 אם חסר קוד מדינה
          if (!phoneNumber.startsWith('972')) {
            phoneNumber = '972' + phoneNumber;
          }
          // הוספת + בתחילת המספר
          phoneNumber = '+' + phoneNumber;

          // יצירת שיחה חדשה או קבלת שיחה קיימת
          const conversation = await mongodbService.getOrCreateConversation(
            userId,
            phoneNumber,
            contact.name || `לקוח ${phoneNumber.substring(phoneNumber.length - 4)}`
          );

          // שליחת ההודעה
          const result = await whatsappService.sendMessage(userId, conversation.id, message);
          
          if (result.success) {
            return { phone: phoneNumber, status: 'success' };
          } else {
            throw new Error(result.error || 'Failed to send message');
          }
        } catch (error) {
          console.error(`Error sending message to ${contact.phone}:`, error);
          return { phone: contact.phone, status: 'error', error: error.message };
        }
      })
    );

    // סיכום התוצאות
    const summary = {
      total: contacts.length,
      success: results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length,
      failed: results.filter(r => r.status === 'rejected' || r.value.status === 'error').length,
      details: results.map(r => r.status === 'fulfilled' ? r.value : { phone: r.reason.phone, status: 'error', error: r.reason.message })
    };

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error sending mass message:', error);
    res.status(500).json({ error: 'Failed to send mass message' });
  }
});

module.exports = router; 