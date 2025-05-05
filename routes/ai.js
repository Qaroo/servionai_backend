const express = require('express');
const router = express.Router();
const openaiService = require('../services/openai');
const mongodbService = require('../services/mongodb');
const authMiddleware = require('../middleware/auth');

// נתיב פשוט לבדיקת חיים של השרת
router.get('/ping', (req, res) => {
  res.json({ success: true, message: 'AI service is running' });
});

/**
 * נתיב לקבלת סטטוס האימון של המשתמש
 */
router.get('/training-status', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    // קבלת נתוני הסוכן והסטטוס שלו
    const userData = await mongodbService.getUserData(userId);
    const businessInfo = await mongodbService.getBusinessInfo(userId);
    
    res.json({
      success: true,
      status: userData?.trainingStatus || 'untrained',
      businessInfoExists: !!businessInfo,
      businessInfo: {
        name: businessInfo?.name,
        industry: businessInfo?.industry,
        hasServices: !!businessInfo?.services,
        hasDescription: !!businessInfo?.description,
        lastUpdated: businessInfo?.updatedAt
      }
    });
  } catch (error) {
    console.error('Error getting training status:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בקבלת סטטוס האימון',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * נתיב לאימון הסוכן עם פרטי העסק
 */
router.post('/train', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { businessInfo } = req.body;
    
    if (!businessInfo) {
      return res.status(400).json({
        success: false,
        message: 'נתוני העסק חסרים'
      });
    }
    
    console.log(`Received business info for user ${userId}:`, businessInfo);
    
    // בדיקה אם המשתמש קיים במסד הנתונים - אך במקום גישה ישירה ל-collections, השתמש בשירות
    let user;
    try {
      // נסה לקבל מידע על המשתמש בעזרת שירות ה-MongoDB
      user = await mongodbService.getUserData(userId);
      console.log(`User ${userId} exists, updating business info`);
    } catch (error) {
      console.log(`User might not exist, will create via updateBusinessInfo`);
      // זה בסדר, נמשיך לעדכון/יצירה
    }
    
    // אימון הסוכן
    const trainingResponse = await openaiService.trainAgent(businessInfo);
    
    // שמירת פרטי העסק - הפונקציה הזו תיצור את המשתמש אם הוא לא קיים
    console.log(`Updating business info for ${userId}`);
    const updateSuccess = await mongodbService.updateBusinessInfo(userId, businessInfo);
    
    if (!updateSuccess) {
      throw new Error('שגיאה בשמירת נתוני העסק במסד הנתונים');
    }
    
    // בדיקה שהמידע נשמר באמת
    const savedBusinessInfo = await mongodbService.getBusinessInfo(userId);
    console.log(`Verified saved business info for ${userId}:`, savedBusinessInfo);
    
    // עדכון סטטוס האימון רק אם שמירת המידע העסקי הצליחה
    await mongodbService.updateTrainingStatus(userId, 'trained');
    
    res.json({
      success: true,
      message: 'הסוכן אומן בהצלחה',
      response: trainingResponse
    });
  } catch (error) {
    console.error('Error training agent:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה באימון הסוכן',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * נתיב לאימון הסוכן באמצעות שיחות מוואטסאפ
 */
router.post('/train-with-conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { conversationIds } = req.body;

    // בדיקה שסופקו מזהי שיחות
    if (!conversationIds || !Array.isArray(conversationIds) || conversationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'יש לבחור לפחות שיחה אחת לאימון'
      });
    }

    // שליפת פרטי העסק
    const businessInfo = await mongodbService.getBusinessInfo(userId);

    // טעינת השיחות ושליפת ההודעות שלהן
    const conversations = [];
    for (const conversationId of conversationIds) {
      try {
        // שליפת פרטי השיחה
        const conversation = await mongodbService.getConversation(userId, conversationId);
        if (!conversation) continue;

        // שליפת ההודעות של השיחה
        const messages = await mongodbService.getConversationMessages(userId, conversationId, 100);
        
        conversations.push({
          ...conversation,
          messages
        });
      } catch (error) {
        console.error(`Error loading conversation ${conversationId}:`, error);
      }
    }

    // לוג למטרות דיבוג
    console.log(`Training with ${conversations.length} conversations, total ${conversations.reduce((count, conv) => count + conv.messages.length, 0)} messages`);

    // אימון באמצעות השיחות
    const trainingResult = await openaiService.trainAgentWithConversations(businessInfo, conversations);

    // עדכון סטטוס האימון
    await mongodbService.updateTrainingStatus(userId, 'trained');

    // עדכון הוראות האימון
    if (businessInfo.conversationTraining) {
      await mongodbService.updateBusinessTrainingInstructions(userId, businessInfo.conversationTraining);
    }

    res.json({
      success: true,
      message: 'האימון הסתיים בהצלחה',
      conversationCount: conversations.length,
      trainingResult
    });
  } catch (error) {
    console.error('Error training AI with conversations:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה באימון AI עם שיחות',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * נתיב לבדיקת תגובת הסוכן לשאלה (טסט)
 */
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'נדרשת שאלה לבדיקה'
      });
    }
    
    // קבלת פרטי האימון של הסוכן
    const businessData = await mongodbService.getAgentTrainingData(userId);
    
    if (!businessData || !businessData.businessInfo) {
      return res.status(400).json({
        success: false,
        message: 'נתוני העסק חסרים. לא ניתן לבדוק את תגובת הסוכן'
      });
    }
    
    // קבלת תגובת הסוכן
    const response = await openaiService.getAIResponse(prompt, [], businessData);
    
    res.json({
      success: true,
      prompt,
      response
    });
  } catch (error) {
    console.error('Error testing agent response:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בבדיקת תגובת הסוכן',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// קבלת תשובה מהסוכן לפי טקסט
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { prompt, conversationId } = req.body;
    
    // בדיקה שיש טקסט לשאלה
    if (!prompt) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }
    
    let businessInfo = null;
    let context = [];
    
    // במצב פיתוח, לא צריך לקבל פרטים מ-MongoDB
    if (process.env.NODE_ENV !== 'development') {
      // קבלת פרטי העסק
      const businessData = await mongodbService.getAgentTrainingData(userId);
      businessInfo = businessData.businessInfo;
      
      // קבלת היסטוריית השיחה אם יש מזהה שיחה
      if (conversationId) {
        // שימוש במודל MongoDB לקבלת הודעות
        const messages = await mongodbService.getConversationMessages(userId, conversationId, 10);
        
        context = messages.map(message => ({
          role: message.fromMe ? 'assistant' : 'user',
          content: message.body
        }));
      }
    } else {
      // במצב פיתוח, השתמש בנתונים לדוגמה
      businessInfo = {
        name: "סרביון AI",
        description: "פתרונות בינה מלאכותית לעסקים",
        industry: "טכנולוגיה",
        services: "צ'אטבוטים, אוטומציה, אינטגרציה עם וואטסאפ",
        hours: "א-ה 9:00-18:00",
        contact: "info@servionai.com, 052-555-1234",
        address: "תל אביב",
        website: "https://www.servionai.com",
        additionalInfo: "אנחנו עוזרים לעסקים להטמיע פתרונות AI"
      };
    }
    
    // קבלת תגובה מה-AI
    const response = await openaiService.getAIResponse(prompt, context, { businessInfo });
    
    // שמירת ההיסטוריה אם יש מזהה שיחה (אופציונלי)
    if (conversationId && process.env.NODE_ENV !== 'development') {
      try {
        // שמירת שאלת המשתמש
        await mongodbService.saveMessage(userId, conversationId, {
          role: 'user',
          content: prompt,
          timestamp: new Date()
        });
        
        // שמירת תשובת המערכת
        await mongodbService.saveMessage(userId, conversationId, {
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });
      } catch (saveError) {
        console.error('Error saving chat history:', saveError);
      }
    }
    
    res.json({
      success: true,
      prompt,
      response
    });
  } catch (error) {
    console.error('Error getting AI response:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בקבלת תגובה מה-AI',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// יצירת שיחת אימון חדשה
router.post('/conversation', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { title } = req.body;
    
    let conversationId = 'test-conversation';
    
    // במצב פיתוח, לא צריך לשמור ב-MongoDB
    if (process.env.NODE_ENV !== 'development') {
      const conversationRef = await mongodbService.db()
        .collection('users')
        .doc(userId)
        .collection('trainings')
        .add({
          title: title || `שיחת אימון ${new Date().toLocaleString('he-IL')}`,
          createdAt: mongodbService.admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: mongodbService.admin.firestore.FieldValue.serverTimestamp(),
          status: 'active'
        });
      
      conversationId = conversationRef.id;
    }
    
    res.json({
      success: true,
      conversationId
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה ביצירת שיחת אימון חדשה',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// קבלת פרטי העסק והאימון של הסוכן
router.get('/business-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    let businessInfo = null;
    let trainingData = null;
    
    // במצב פיתוח, לא צריך לקבל פרטים מ-MongoDB
    if (process.env.NODE_ENV !== 'development') {
      // קבלת פרטי העסק והאימון
      const data = await mongodbService.getAgentTrainingData(userId);
      businessInfo = data.businessInfo;
      trainingData = data.trainingData;
    } else {
      // במצב פיתוח, מחזירים נתונים לדוגמה
      businessInfo = {
        name: 'עסק לדוגמה',
        industry: 'טכנולוגיה',
        services: 'פיתוח אפליקציות, תמיכה טכנית',
        hours: '9:00-18:00',
        contact: 'example@example.com, 03-1234567',
        additionalInfo: 'מידע נוסף על העסק לדוגמה'
      };
      trainingData = {
        status: 'trained',
        lastTraining: new Date()
      };
    }
    
    res.json({
      success: true,
      businessInfo,
      trainingData,
      status: trainingData?.status || 'untrained'
    });
  } catch (error) {
    console.error('Error getting business info:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בקבלת פרטי העסק',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// קבלת שיחות ללמידה
router.get('/training-conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    
    // הגבלת מספר השיחות לטעינה
    const limit = parseInt(req.query.limit) || 20;
    
    // במצב פיתוח, החזר נתונים לדוגמה עם שיחות אמיתיות יותר
    if (process.env.NODE_ENV === 'development') {
      const mockConversations = Array.from({ length: 10 }).map((_, index) => {
        // הגרלת מספר הודעות לכל שיחה (בין 5 ל-15)
        const messagesCount = Math.floor(Math.random() * 10) + 5;
        
        // יצירת הודעות דוגמה שמדמות שיחות מכירה אמיתיות
        const messages = [];
        // הוספת הודעת פתיחה מהלקוח
        messages.push({
          id: `msg-${index}-0`,
          body: index % 3 === 0 
            ? "שלום, אני מתעניין במוצרים שלכם. מה יש לכם להציע?" 
            : index % 3 === 1 
              ? "היי, האם יש לכם את המוצר בצבע שחור?" 
              : "מה שעות הפעילות שלכם?",
          fromMe: false,
          timestamp: new Date(Date.now() - (86400000 * index) - (3600000 * messagesCount))
        });
        
        // הוספת שאר ההודעות בשיחה
        for (let i = 1; i < messagesCount; i++) {
          // קביעה אם ההודעה היא מהעסק או מהלקוח לפי זוגיות
          const fromMe = i % 2 === 1;
          let messageBody = "";
          
          if (fromMe) {
            // הודעות מהעסק
            if (i === 1) {
              // הודעת תגובה ראשונה מהעסק
              messageBody = index % 3 === 0 
                ? "שלום! יש לנו מגוון רחב של מוצרים. אשמח לדעת מה אתה מחפש באופן ספציפי כדי שאוכל לעזור לך בצורה הטובה ביותר." 
                : index % 3 === 1 
                  ? "שלום! כן, יש לנו את המוצר בצבע שחור. מעוניין שאשלח לך תמונות ופרטים נוספים?" 
                  : "שלום! אנחנו פתוחים בימים א'-ה' מ-9:00 עד 20:00, ביום ו' מ-9:00 עד 14:00, ובשבת אנחנו סגורים.";
            } else {
              // הודעות המשך מהעסק
              const responseOptions = [
                "אשמח לעזור! יש לנו מבצע מיוחד השבוע על מוצר זה.",
                "המחיר הוא ₪299 כולל משלוח.",
                "כן, יש לנו במלאי והמשלוח יכול להגיע תוך 2-3 ימי עסקים.",
                "אפשר גם לאסוף מהחנות אם נוח לך יותר.",
                "האם תרצה שאוסיף גם את המוצר המשלים? יש לנו מבצע מיוחד לרוכשים.",
                "אפשר לשלם בכל אמצעי תשלום, כולל תשלומים."
              ];
              messageBody = responseOptions[Math.floor(Math.random() * responseOptions.length)];
            }
          } else {
            // הודעות מהלקוח
            const customerOptions = [
              "מה המחיר?",
              "האם יש משלוח?",
              "מתי אוכל לקבל את זה?",
              "יש אפשרות לאסוף מהחנות?",
              "אוקיי, אני אזמין.",
              "תודה רבה על העזרה!",
              "האם אפשר לשלם בכרטיס אשראי?",
              "יש אפשרות לתשלומים?"
            ];
            messageBody = customerOptions[Math.floor(Math.random() * customerOptions.length)];
          }
          
          messages.push({
            id: `msg-${index}-${i}`,
            body: messageBody,
            fromMe,
            timestamp: new Date(Date.now() - (86400000 * index) - (3600000 * (messagesCount - i)))
          });
        }
        
        return {
          id: `mock-detailed-conv-${index}`,
          phoneNumber: `+972-${Math.floor(Math.random() * 900000000) + 100000000}`,
          name: `לקוח אמיתי ${index + 1}`,
          lastMessage: messages[messages.length - 1].body,
          lastMessageTime: messages[messages.length - 1].timestamp,
          unreadCount: Math.floor(Math.random() * 3),
          messages
        };
      });
      
      return res.json({
        success: true,
        conversations: mockConversations
      });
    }
    
    // בסביבת ייצור, שליפת השיחות מפיירבייס
    const conversationsBasicInfo = await mongodbService.getConversations(userId);
    
    // שליפת פרטי השיחות כולל ההודעות
    const detailedConversations = [];
    for (const conv of conversationsBasicInfo.slice(0, limit)) {
      try {
        const messages = await mongodbService.getConversationMessages(userId, conv.id, 50);
        detailedConversations.push({
          ...conv,
          messages
        });
      } catch (error) {
        console.error(`Error loading messages for conversation ${conv.id}:`, error);
      }
    }
    
    res.json({
      success: true,
      conversations: detailedConversations
    });
  } catch (error) {
    console.error('Error fetching training conversations:', error);
    res.status(500).json({
      success: false,
      message: 'שגיאה בשליפת שיחות לאימון'
    });
  }
});

/**
 * נתיב לשמירת פרטי העסק
 */
router.post('/business-info', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const businessInfo = req.body;
    
    // וידוא שנשלחו לפחות השדות החובה
    if (!businessInfo || !businessInfo.name || !businessInfo.industry) {
      return res.status(400).json({
        success: false,
        message: 'נתוני העסק חסרים או לא מלאים. נדרש לפחות שם העסק ותחום העיסוק.'
      });
    }
    
    // שמירת נתוני העסק
    await mongodbService.updateBusinessInfo(userId, businessInfo);
    
    // אם יש נתונים מספיקים, אפשר לסמן את הסוכן כמאומן
    if (businessInfo.name && businessInfo.industry && (businessInfo.services || businessInfo.description)) {
      await mongodbService.updateTrainingStatus(userId, 'trained');
    }
    
    res.json({
      success: true,
      message: 'פרטי העסק נשמרו בהצלחה',
      businessInfo
    });
  } catch (error) {
    console.error('Error saving business info:', error);
    res.status(500).json({
      success: false,
      message: 'אירעה שגיאה בשמירת פרטי העסק',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router; 