const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const aiService = require('../services/ai');
const mongodbService = require('../services/mongodb');
const openaiService = require('../services/openai');

// מאגר זמני לשמירת סשנים פעילים
const activeSessions = {};

/**
 * התחלת שיחה עם נעמה
 */
router.post('/naama-talk/start', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.body;

    // קבלת מידע העסק
    let businessInfo;
    try {
      businessInfo = await mongodbService.getBusinessInfo(userId);
    } catch (businessError) {
      // במקרה של שגיאת מידע עסקי, החזר קוד שגיאה מיוחד
      if (businessError.message && businessError.message.includes('Business info not found')) {
        console.log(`Business info not found for user ${userId}, redirecting to business setup`);
        return res.status(422).json({
          success: false,
          errorCode: 'BUSINESS_INFO_MISSING',
          message: 'נדרשת הגדרת פרטי העסק לפני השימוש בנעמה',
          redirectTo: '/business-setup'
        });
      }
      throw businessError;
    }
    
    // יצירת הודעת פתיחה מותאמת
    const welcomeMessage = `שלום, אני נעמה, העוזרת האישית של ${businessInfo.name || 'העסק'}. 
    אני כאן כדי ללמוד על העסק שלך כדי לעזור לך לשפר את השירות ללקוחות ולאמן את הסוכן החכם שיוכל לענות בוואטסאפ ללקוחות שלך.
    אני אשאל אותך מספר שאלות על העסק. מה תחום העיסוק העיקרי של העסק שלך?`;
    
    // שמירת הסשן במאגר
    activeSessions[sessionId] = {
      userId,
      startTime: new Date(),
      businessInfo,
      lastQuestionTime: new Date(),
      autoAsk: true,  // הפעלת שאילת שאלות אוטומטית
      hasAskedQuestions: {},  // מעקב אחר שאלות שכבר נשאלו
      messages: [
        { role: 'system', content: `אתה עוזר המתחזה לעוזרת אישית בשם 'נעמה' לעסק ישראלי. 
        המטרה שלך היא לאסוף מידע רלוונטי על העסק כדי לייצר פרופיל עסקי מפורט ולאמן את הבוט לשירות הלקוחות.
        עליך לנהל שיחה טבעית בעברית ולשאול שאלות ממוקדות על העסק.
        המידע שנאסף ישמש לאימון מערכת ה-AI שתתפעל את תקשורת הלקוחות של העסק בווטסאפ.
        
        נושאים שחשוב לשאול עליהם (אחד בכל פעם):
        1. פרטים כלליים: שם העסק המלא, תחום העיסוק, שנת הקמה
        2. שירותים ומוצרים: פירוט השירותים והמוצרים שהעסק מציע, תהליכי עבודה
        3. מחירים: טווח מחירים, מבצעים, הנחות, אמצעי תשלום
        4. זמני פעילות: שעות פתיחה, ימי פעילות, חופשות מתוכננות
        5. צוות: מידע על הצוות, תפקידים, מומחיות מיוחדת
        6. פרטי קשר: טלפון, אימייל, אתר אינטרנט, רשתות חברתיות
        7. מיקום: כתובת העסק, הוראות הגעה, חניה
        8. שאלות נפוצות: שאלות שלקוחות שואלים ותשובות אופייניות
        9. תהליכי הזמנה: איך מזמינים את השירות/מוצר, זמני אספקה
        10. מדיניות: החזרות, ביטולים, אחריות

        שים לב:
        - שאל שאלה אחת בכל פעם והמתן לתשובה.
        - הגב בחיוביות לכל תשובה והראה התעניינות.
        - נסח את השאלות בצורה פתוחה שמעודדת תשובות מפורטות.
        - אם המשתמש נותן תשובה קצרה, שאל שאלות המשך לקבלת מידע נוסף.
        - דבר בגוף ראשון נקבה ("אני שואלת", "אני מבינה") כמו עוזרת אישית.
        - שמור על טון ידידותי, מקצועי ואדיב.
        - אם המשתמש מעלה שאלות על נעמה או על המערכת, הסבר בקצרה את המטרה ושוב מקד את השיחה באיסוף מידע על העסק.
        
        אל תשאל את כל השאלות בבת אחת. התקדם בהדרגה. אחרי שקיבלת תשובה בנושא מסוים, עבור לנושא הבא באופן טבעי.` },
        { role: 'assistant', content: welcomeMessage }
      ]
    };
    
    // יצירת אודיו של הודעת הפתיחה באמצעות OpenAI TTS
    let audioBuffer;
    try {
      audioBuffer = await aiService.textToSpeech(welcomeMessage);
    } catch (error) {
      console.error('Error generating TTS audio:', error);
      audioBuffer = null;
    }
    
    // הכנת ה-URL לאודיו אם נוצר בהצלחה
    let audioUrl = null;
    if (audioBuffer) {
      // בסביבת פיתוח נשמור זמנית את הקובץ
      const fs = require('fs');
      const path = require('path');
      
      // יצירת תיקיית temp אם לא קיימת
      const tempDir = path.join(__dirname, '..', '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const audioFileName = `naama_${Date.now()}.mp3`;
      const audioPath = path.join(tempDir, audioFileName);
      
      // שמירת הקובץ
      fs.writeFileSync(audioPath, audioBuffer);
      
      // יצירת URL יחסי לקובץ האודיו
      audioUrl = `/temp/${audioFileName}`;
    }
    
    return res.json({
      success: true,
      message: welcomeMessage,
      audioUrl: audioUrl
    });
  } catch (error) {
    console.error('Error starting Naama conversation:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בהתחלת השיחה עם נעמה',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * שליחת הודעה לנעמה וקבלת תשובה
 */
router.post('/naama-talk', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { message, sessionId } = req.body;
    
    // בדיקה שהסשן קיים
    if (!activeSessions[sessionId] || activeSessions[sessionId].userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'סשן לא נמצא. יש להתחיל שיחה חדשה.'
      });
    }
    
    const session = activeSessions[sessionId];
    
    // עדכון זמן השאלה האחרונה
    session.lastQuestionTime = new Date();
    
    // הוספת הודעת המשתמש לשיחה
    session.messages.push({ role: 'user', content: message });
    
    // הוספת הוראה מיוחדת לבוט עבור שאלות אוטומטיות
    let additionalInstructions = '';
    
    if (session.autoAsk) {
      // בדיקת נושאים שעוד לא נשאלו, לפי ניתוח התשובות הקודמות
      const missingTopics = await getMissingTopics(session);
      
      if (missingTopics.length > 0) {
        // בחירת נושא אקראי מהרשימה
        const nextTopic = missingTopics[Math.floor(Math.random() * missingTopics.length)];
        // הוספת הנחיה לשאול על הנושא הזה בהמשך השיחה
        additionalInstructions = `
        לאחר שתגיב לתשובה הנוכחית, שאל שאלה בנושא: ${nextTopic}.
        אל תציין במפורש שאתה עובר לנושא חדש, עשה זאת בצורה טבעית כחלק מהשיחה.
        `;
        
        // סימון שכבר שאלנו על הנושא הזה
        session.hasAskedQuestions[nextTopic] = true;
      }
    }
    
    // שימוש בשירות ה-AI לקבלת תשובה עם ההנחיות הנוספות
    const systemMessage = session.messages.find(msg => msg.role === 'system');
    if (systemMessage && additionalInstructions) {
      systemMessage.content += additionalInstructions;
    }
    
    const aiResponse = await aiService.getChatCompletion(
      session.messages,
      { 
        temperature: 0.8, 
        max_tokens: 300 
      }
    );
    
    // הוספת תשובת המערכת לשיחה
    session.messages.push({ role: 'assistant', content: aiResponse });
    
    // עדכון מידע העסק עם המידע שנאסף
    await updateBusinessInfoFromConversation(userId, session);
    
    // יצירת אודיו של התשובה באמצעות OpenAI TTS
    let audioBuffer;
    try {
      audioBuffer = await aiService.textToSpeech(aiResponse);
    } catch (error) {
      console.error('Error generating TTS audio:', error);
      audioBuffer = null;
    }
    
    // הכנת ה-URL לאודיו אם נוצר בהצלחה
    let audioUrl = null;
    if (audioBuffer) {
      // בסביבת פיתוח נשמור זמנית את הקובץ
      const fs = require('fs');
      const path = require('path');
      
      // יצירת תיקיית temp אם לא קיימת
      const tempDir = path.join(__dirname, '..', '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const audioFileName = `naama_${Date.now()}.mp3`;
      const audioPath = path.join(tempDir, audioFileName);
      
      // שמירת הקובץ
      fs.writeFileSync(audioPath, audioBuffer);
      
      // יצירת URL יחסי לקובץ האודיו
      audioUrl = `/temp/${audioFileName}`;
    }
    
    return res.json({
      success: true,
      reply: aiResponse,
      audioUrl: audioUrl
    });
  } catch (error) {
    console.error('Error in Naama conversation:', error);
    return res.status(500).json({
      success: false,
      message: 'שגיאה בשיחה עם נעמה',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * ניתוח נושאים שעדיין לא נשאלו בשיחה
 * @param {Object} session - אובייקט המייצג את הסשן הנוכחי
 * @returns {Promise<Array<string>>} - מערך של נושאים שטרם נשאלו
 */
async function getMissingTopics(session) {
  try {
    // רשימת כל הנושאים האפשריים
    const allTopics = [
      'פרטים כלליים על העסק',
      'שירותים ומוצרים שהעסק מציע',
      'מחירים ואמצעי תשלום',
      'זמני פעילות',
      'צוות העסק',
      'פרטי קשר',
      'מיקום העסק',
      'שאלות נפוצות של לקוחות',
      'תהליכי הזמנה ואספקה',
      'מדיניות החזרות וביטולים'
    ];
    
    // נושאים שכבר נשאלו עליהם (מסומנים ב-session)
    const askedTopics = Object.keys(session.hasAskedQuestions);
    
    // בדיקה אם יש מספיק היסטוריה כדי לנתח נושאים שכבר נידונו
    if (session.messages.length > 5) {
      // ניתוח ההיסטוריה כדי לזהות אילו נושאים כבר נידונו
      const analysisPrompt = [
        { 
          role: 'system', 
          content: `אתה מנתח שיחות. בהינתן שיחה, תחזיר רשימה של נושאים שכבר דנו בהם. 
          הנושאים האפשריים הם: פרטים כלליים על העסק, שירותים ומוצרים, מחירים, זמני פעילות, 
          צוות העסק, פרטי קשר, מיקום העסק, שאלות נפוצות, תהליכי הזמנה, מדיניות ביטולים והחזרות.
          החזר JSON עם מערך של נושאים שכבר דובר עליהם בשיחה, בפורמט { "coveredTopics": ["נושא1", "נושא2", ...] }` 
        },
        { 
          role: 'user', 
          content: `הנה שיחה בין משתמש לבין נעמה, עוזרת וירטואלית:

          ${session.messages.filter(msg => msg.role !== 'system').map(msg => `${msg.role === 'assistant' ? 'נעמה' : 'משתמש'}: ${msg.content}`).join('\n\n')}
          
          אילו נושאים כבר נידונו בשיחה הזו?` 
        }
      ];
      
      try {
        const analysisJson = await aiService.getChatCompletion(
          analysisPrompt,
          { 
            temperature: 0.1,
            response_format: { type: "json_object" },
            max_tokens: 500
          }
        );
        
        const analysis = JSON.parse(analysisJson);
        
        if (analysis.coveredTopics && Array.isArray(analysis.coveredTopics)) {
          // סימון כל הנושאים שכבר כוסו בשיחה
          analysis.coveredTopics.forEach(topic => {
            session.hasAskedQuestions[topic] = true;
          });
        }
      } catch (error) {
        console.error('Error analyzing conversation topics:', error);
      }
    }
    
    // החזרת נושאים שעדיין לא נשאלו
    return allTopics.filter(topic => !session.hasAskedQuestions[topic]);
  } catch (error) {
    console.error('Error getting missing topics:', error);
    return [];
  }
}

/**
 * עדכון מידע העסק על פי השיחה עם נעמה
 * פונקציה פנימית שמנתחת את השיחה ומעדכנת את פרטי העסק
 */
async function updateBusinessInfoFromConversation(userId, session) {
  try {
    // אם יש לפחות 5 הודעות בשיחה, ננסה לעדכן את מידע העסק
    if (session.messages.length >= 5) {
      // יצירת סיכום של המידע שנאסף בשיחה
      const summaryMessages = [
        { role: 'system', content: `יש לך שיחה בין משתמש לעוזרת הבוטית 'נעמה' שאוספת מידע על העסק.
        תפקידך הוא לחלץ מידע עסקי רלוונטי מהשיחה ולארגן אותו בצורה מובנית.
        החזר רק JSON עם השדות הבאים, אם הם הוזכרו בשיחה (אם לא הוזכרו, השאר ריק):
        name: שם העסק
        description: תיאור כללי של העסק
        industry: תחום העיסוק/ענף
        services: שירותים שהעסק מציע (מפורדים בפסיקים)
        products: מוצרים שהעסק מוכר (אם יש)
        hours: שעות פעילות
        contact: פרטי התקשרות (טלפון, אימייל)
        address: כתובת העסק
        website: כתובת אתר האינטרנט
        social: קישורים לרשתות חברתיות
        pricing: מידע על מחירים
        team: מידע על הצוות
        faq: שאלות נפוצות ותשובות
        ordering: תהליכי הזמנה
        policies: מדיניות ביטולים, החזרות או אחריות
        additionalInfo: מידע נוסף חשוב
        
        החזר רק JSON תקין, בלי מלל נוסף לפני או אחרי.` },
        ...session.messages.filter(msg => msg.role !== 'system').slice(-10) // 10 ההודעות האחרונות שאינן הוראות מערכת
      ];
      
      const jsonResponse = await aiService.getChatCompletion(
        summaryMessages,
        { 
          temperature: 0.1,
          response_format: { type: "json_object" },
          max_tokens: 800
        }
      );
      
      try {
        // ניסיון לפרסר את ה-JSON
        const businessUpdate = JSON.parse(jsonResponse);
        
        // קבלת מידע העסק הנוכחי
        const currentInfo = await mongodbService.getBusinessInfo(userId);
        
        // מיזוג המידע החדש עם הקיים
        const updatedInfo = {
          ...currentInfo,
          ...Object.fromEntries(
            Object.entries(businessUpdate).filter(([_, value]) => value && value.trim && value.trim() !== '')
          )
        };
        
        // עדכון מידע העסק במסד הנתונים
        await mongodbService.updateBusinessInfo(userId, updatedInfo);
        
        // יצירת הוראות מערכת מותאמות לבוט הווטסאפ של המשתמש
        const whatsappInstructions = `
        אתה סוכן AI המייצג את העסק "${updatedInfo.name || 'העסק'}" בתחום ${updatedInfo.industry || 'השירות'}.
        תפקידך הוא לענות ללקוחות בוואטסאפ בצורה מקצועית, יעילה וידידותית.
        
        מידע על העסק:
        ${updatedInfo.description ? `- תיאור: ${updatedInfo.description}` : ''}
        ${updatedInfo.services ? `- שירותים: ${updatedInfo.services}` : ''}
        ${updatedInfo.products ? `- מוצרים: ${updatedInfo.products}` : ''}
        ${updatedInfo.hours ? `- שעות פעילות: ${updatedInfo.hours}` : ''}
        ${updatedInfo.contact ? `- יצירת קשר: ${updatedInfo.contact}` : ''}
        ${updatedInfo.address ? `- כתובת: ${updatedInfo.address}` : ''}
        ${updatedInfo.website ? `- אתר: ${updatedInfo.website}` : ''}
        ${updatedInfo.pricing ? `- מחירים: ${updatedInfo.pricing}` : ''}
        ${updatedInfo.team ? `- צוות: ${updatedInfo.team}` : ''}
        ${updatedInfo.ordering ? `- הזמנות: ${updatedInfo.ordering}` : ''}
        ${updatedInfo.policies ? `- מדיניות: ${updatedInfo.policies}` : ''}
        ${updatedInfo.faq ? `- שאלות נפוצות: ${updatedInfo.faq}` : ''}
        ${updatedInfo.additionalInfo ? `- מידע נוסף: ${updatedInfo.additionalInfo}` : ''}
        
        הנחיות:
        1. ענה בעברית בצורה מקצועית, ידידותית ויעילה
        2. פעל לפי המידע שניתן ואל תמציא פרטים שלא קיימים
        3. הצע עזרה ושירות ללקוחות באופן פרואקטיבי
        4. שמור על טון חיובי ומכבד
        5. כאשר הלקוח שואל שאלה שאין לך מידע לגביה, הצע לו לפנות ישירות לעסק בערוצים הרשמיים
        `;
        
        // שמירת ההוראות המותאמות לאימון בוט הווטסאפ
        if (!updatedInfo.whatsappTraining) {
          updatedInfo.whatsappTraining = {};
        }
        updatedInfo.whatsappTraining.systemInstructions = whatsappInstructions;
        
        // עדכון ההוראות במסד הנתונים
        await mongodbService.updateBusinessInfo(userId, updatedInfo);
        
        console.log('Business info and WhatsApp instructions updated from Naama conversation');
      } catch (jsonError) {
        console.error('Error parsing business info JSON:', jsonError);
      }
    }
  } catch (error) {
    console.error('Error updating business info from conversation:', error);
  }
}

/**
 * שרת סטטי עבור קבצי אודיו זמניים
 */
const path = require('path');
const staticPath = path.join(__dirname, '..', '..', 'temp');
router.use('/temp', express.static(staticPath));

module.exports = router; 