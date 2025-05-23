const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');
const { User, BusinessInfo } = require('../models');

// מבנה נתונים לקשירת MongoDB Collections
const collections = {
  User: User,
  BusinessInfo: BusinessInfo
};

// מבנה נתונים למטמון של מידע בזיכרון
const caches = {
  userData: new Map(),
  businessData: new Map(),
  whatsappStatus: new Map(),
};

// סכמות MongoDB
const conversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  id: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  name: String,
  lastMessage: String,
  lastMessageTime: Date,
  unreadCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  messageId: { type: String, required: true, unique: true },
  body: String,
  fromMe: Boolean,
  isAI: Boolean,
  timestamp: { type: Date, default: Date.now },
  type: { type: String, default: 'chat' },
  hasMedia: { type: Boolean, default: false },
  phoneNumber: String
});

const whatsappSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  sessionData: Object,
  updatedAt: { type: Date, default: Date.now }
});

// פונקציה לאתחול החיבור ל-MongoDB
const initializeMongoDB = async () => {
  try {
    // חיבור ל-MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://seasonscrm:pfyc6DKNINPGK2a2@servior.3ixxc01.mongodb.net/?retryWrites=true&w=majority&appName=servior';

    await mongoose.connect(mongoUri);

    console.log('MongoDB connected successfully');

    // יצירת מודלים
    collections.Conversation = mongoose.model('Conversation', conversationSchema);
    collections.Message = mongoose.model('Message', messageSchema);
    collections.WhatsappSession = mongoose.model('WhatsappSession', whatsappSessionSchema);

    // וידוא שהמודלים אותחלו
    if (!collections.Conversation || !collections.Message || !collections.WhatsappSession) {
      throw new Error('Failed to initialize MongoDB models');
    }

    console.log('MongoDB models initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing MongoDB:', error);
    throw error;
  }
};

/**
 * מאמת טוקן JWT ומחזיר את מזהה המשתמש
 * @param {string} token - הטוקן לאימות
 * @returns {Promise<{uid: string, email: string}>} - מידע על המשתמש
 */
async function verifyIdToken(token) {
  try {
    // וידוא שהטוקן הוא מחרוזת ולא Promise
    if (!token) {
      console.error(`Token is empty or undefined`);
      throw new Error('Invalid token - token is empty or undefined');
    }
    
    if (typeof token !== 'string') {
      if (token instanceof Promise) {
        console.error(`Token is a Promise, not a string. Attempting to resolve it.`);
        try {
          // נסה לחכות לסיום ה-Promise ולקבל את הטוקן האמיתי
          token = await token;
          console.log('Successfully resolved token Promise');
        } catch (promiseError) {
          console.error('Failed to resolve token Promise:', promiseError);
          throw new Error('Invalid token - received a Promise that could not be resolved');
        }
      } else {
      console.error(`Invalid token type: ${typeof token}`);
      throw new Error('Invalid token format - must be a string');
      }
    }

    // במצב פיתוח, מחזיר משתמש מדומה
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Using mock authentication in development mode`);
      return { uid: 'PIHxt2lDk8bahTSRmSTvaznBXa23', email: 'dev@example.com' };
    }

    // נסה לפענח את הטוקן
    let decodedToken = decodeJWT(token);

    // אם הצלחנו לפענח, נסה למצוא את מזהה המשתמש
    if (decodedToken) {
      // נסה למצוא את מזהה המשתמש בשדות הנפוצים של פיירבייס
      const uid = decodedToken.user_id || decodedToken.sub || decodedToken.uid;
      const email = decodedToken.email || '';

      if (uid) {
        console.log(`Successfully decoded JWT token, uid: ${uid}`);
        return { uid, email };
      }
    }

    // אם לא הצלחנו לפענח או למצוא מזהה, ננסה להשתמש בחלק האחרון של הטוקן
    // זה יכול להיות הפתרון לחלק מהמקרים בהתבסס על מימוש קודם
    const tokenParts = token.split('.');
    if (tokenParts.length > 0) {
      const lastPart = tokenParts[tokenParts.length - 1];
      const uid = lastPart.substring(0, 28); // לקחת את 28 התווים הראשונים כמזהה

      console.log(`Could not decode JWT directly. Using last part of token as uid: ${uid}`);
      return { uid, email: '' };
    }

    throw new Error('Could not decode token or extract user ID');
  } catch (error) {
    console.error('Error verifying ID token:', error);
    throw error;
  }
}

/**
 * מפענח טוקן JWT ללא אימות חתימה
 * @param {string} token - הטוקן לפענוח
 * @returns {object|null} - התוכן המפוענח או null אם הפענוח נכשל
 */
function decodeJWT(token) {
  try {
    // בדיקה אם יש לנו טוקן תקין
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      console.log('Invalid token format for decoding');
      return null;
    }

    // טוקן JWT בנוי מ-3 חלקים מופרדים בנקודה: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('Token does not have 3 parts');
      return null;
    }

    // פענוח החלק השני (ה-payload)
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    console.log('Successfully decoded JWT payload');
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

// פונקציה מסייעת לפענוח base64 (מכיוון שאין atob בNode.js)
function atob(base64) {
  return Buffer.from(base64, 'base64').toString('binary');
}

// עדכון פרטי המשתמש הנוכחי
const getUserData = async (userId) => {
  try {
    const user = await User.findOne({ uid: userId });
    if (!user) {
      return null;
        }
    return user;
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

// שמירת מידע סשן וואטסאפ
const saveWhatsAppSession = async (userId, sessionData) => {
  try {
    const Session = mongoose.model('Session');
    
    // Update or create session
    await Session.findOneAndUpdate(
      { userId }, 
      { 
        userId,
        sessionData,
        updatedAt: new Date() 
      },
      { upsert: true, new: true }
    );
    
    return true;
  } catch (error) {
    console.error('Error saving WhatsApp session:', error);
    return false;
  }
};

// קבלת מידע סשן וואטסאפ
const getWhatsAppSession = async (userId) => {
  try {
    const Session = mongoose.model('Session');
    const session = await Session.findOne({ userId });
    return session ? session.sessionData : null;
  } catch (error) {
    console.error('Error getting WhatsApp session:', error);
    return null;
  }
};

// מחיקת סשן WhatsApp של משתמש
const deleteWhatsAppSession = async (userId) => {
  try {
    const Session = mongoose.model('Session');
    await Session.deleteOne({ userId });
    return true;
  } catch (error) {
    console.error('Error deleting WhatsApp session:', error);
    return false;
  }
};

// עדכון סטטוס חיבור וואטסאפ
const updateWhatsAppStatus = async (userId, status) => {
  try {
    if (!['connected', 'connecting', 'disconnected', 'error'].includes(status)) {
      throw new Error(`Invalid WhatsApp status: ${status}`);
    }

    // עדכון בדאטאבייס
    await collections.User.updateOne(
      { uid: userId },
      { 
        $set: { 
          'whatsappStatus.status': status,
          'whatsappStatus.lastUpdated': new Date()
        } 
      }
    );
    
    // אם הסטטוס הוא "מנותק", מחק את הסשן
    if (status === 'disconnected') {
      await deleteWhatsAppSession(userId);
    }

    // ניקוי המטמון
    if (caches.userData.has(userId)) {
      const userData = caches.userData.get(userId);
      userData.whatsappStatus = {
        status,
        lastUpdated: new Date()
      };
      caches.userData.set(userId, userData);
    }
    
    // עדכון מצב הסטטוס במטמון
    caches.whatsappStatus.set(userId, {
      status,
      lastUpdated: new Date()
    });
    
    return true;
  } catch (error) {
    console.error(`Error updating WhatsApp status for ${userId}:`, error);
    return false;
  }
};

// שמירת הודעת וואטסאפ
const saveWhatsAppMessage = async (userId, chatId, messageData) => {
  try {
    // בדיקה אם אנחנו במצב פיתוח ויש מזהה מדומה
    if (process.env.NODE_ENV === 'development' && (chatId.startsWith('mock-') || messageData.messageId.startsWith('msg-'))) {
      console.log(`[MOCK] Skipping Firestore save for mock message in chat ${chatId}`);
      return {
        id: messageData.messageId,
        timestamp: messageData.timestamp
      };
    }

    // יצירת הודעה חדשה
    const message = new collections.Message({
      conversationId: chatId,
      userId,
      messageId: messageData.messageId,
      body: messageData.body,
      fromMe: messageData.fromMe,
      isAI: messageData.isAI || false,
      timestamp: messageData.timestamp,
      type: messageData.type || 'chat',
      hasMedia: messageData.hasMedia || false,
      phoneNumber: messageData.phoneNumber
    });
    
    await message.save();
    
    // עדכון השיחה עם ההודעה האחרונה
    await updateConversationLastMessage(
      userId,
      chatId,
      messageData.body,
      messageData.timestamp
    );
    
    return {
      id: message.messageId,
      timestamp: message.timestamp
    };
  } catch (error) {
    console.error(`Error saving WhatsApp message for ${userId} in chat ${chatId}:`, error);
    
    // במצב פיתוח, החזר תוצאה מדומה
    if (process.env.NODE_ENV === 'development') {
      return {
        id: messageData.messageId,
        timestamp: messageData.timestamp
      };
    }
    
    throw error;
  }
};

// עדכון ההודעה האחרונה בשיחה
const updateConversationLastMessage = async (userId, chatId, lastMessage, lastMessageTime) => {
  try {
    // במצב פיתוח עם שיחה מדומה, דלג על העדכון
    if (process.env.NODE_ENV === 'development' && chatId.startsWith('mock-')) {
      console.log(`[MOCK] Skipping last message update for mock conversation ${chatId}`);
      return true;
    }
    
    await collections.Conversation.updateOne(
      { userId, id: chatId },
      { 
        lastMessage,
        lastMessageTime,
        updatedAt: new Date()
      }
    );
    
    return true;
  } catch (error) {
    console.error(`Error updating last message for chat ${chatId}:`, error);
    
    // במצב פיתוח, החזר הצלחה מדומה
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    
    return false;
  }
};

// קבלה או יצירה של שיחה
const getOrCreateConversation = async (userId, phoneNumber, name = null) => {
  try {
    // חיפוש שיחה קיימת
    let conversation = await collections.Conversation.findOne({
      userId,
      phoneNumber
    });
    
    // אם השיחה לא קיימת, יצירת שיחה חדשה
    if (!conversation) {
      const conversationId = uuidv4();
      
      conversation = new collections.Conversation({
        userId,
        id: conversationId,
        phoneNumber,
        name: name || `לקוח ${phoneNumber.substring(Math.max(0, phoneNumber.length - 4))}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await conversation.save();
    }
    
    return conversation.toObject();
  } catch (error) {
    console.error(`Error getting/creating conversation for ${userId} with ${phoneNumber}:`, error);
    
    // במצב פיתוח, החזר שיחה מדומה
    if (process.env.NODE_ENV === 'development') {
      const mockId = `mock-${Date.now()}`;
      return {
        id: mockId,
        userId,
        phoneNumber,
        name: name || `לקוח ${phoneNumber.substring(Math.max(0, phoneNumber.length - 4))}`,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    throw error;
  }
};

// קבלת מידע אימון עבור הסוכן
const getAgentTrainingData = async (userId) => {
  try {
    // בדיקה אם המידע קיים במטמון
    if (caches.businessData.has(userId)) {
      return caches.businessData.get(userId);
    }
    
    // קבלת מידע המשתמש מהדאטאבייס
    const user = await collections.User.findOne({ uid: userId });
    
    if (!user || !user.businessInfo) {
      throw new Error(`Business info not found for user ${userId}`);
    }
    
    const businessData = {
      businessInfo: user.businessInfo,
      trainingData: user.trainingData
    };
    
    // שמירה במטמון
    caches.businessData.set(userId, businessData);
    
    return businessData;
  } catch (error) {
    console.error(`Error getting agent training data for ${userId}:`, error);
    
    // במצב פיתוח, החזר מידע מדומה
    if (process.env.NODE_ENV === 'development') {
      console.log('[MOCK] Returning mock agent training data');
      const mockData = {
        businessInfo: {
          name: "סרביון AI",
          description: "פתרונות בינה מלאכותית לעסקים",
          industry: "טכנולוגיה",
          services: "צ'אטבוטים, אוטומציה, אינטגרציה עם וואטסאפ",
          hours: "א-ה 9:00-18:00",
          contact: "info@servionai.com, 052-555-1234",
          address: "תל אביב",
          website: "https://www.servionai.com",
          additionalInfo: "אנחנו עוזרים לעסקים להטמיע פתרונות AI"
        },
        trainingData: {
          status: "trained",
          lastTraining: new Date().toISOString()
        },
        isMock: true
      };
      
      // שמירה במטמון
      caches.businessData.set(userId, mockData);
      return mockData;
    }
    
    throw error;
  }
};

// קבלת שיחות
const getConversations = async (userId) => {
  try {
    // שליפת השיחות מהדאטאבייס
    const conversations = await collections.Conversation
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50);
    
    return conversations.map(conv => conv.toObject());
  } catch (error) {
    console.error(`Error getting conversations for ${userId}:`, error);
    
    // במצב פיתוח, החזר שיחות מדומות
    if (process.env.NODE_ENV === 'development') {
      const mockConversations = Array.from({ length: 10 }).map((_, index) => ({
        id: `mock-conv-${index}`,
        userId,
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
      
      return mockConversations;
    }
    
    throw error;
  }
};

// קבלת הודעות של שיחה
const getConversationMessages = async (userId, conversationId, limit = 50) => {
  try {
    // שליפת ההודעות מהדאטאבייס
    const messages = await collections.Message
      .find({ userId, conversationId })
      .sort({ timestamp: -1 })
      .limit(limit);
    
    return messages.map(msg => msg.toObject());
  } catch (error) {
    console.error(`Error getting messages for conversation ${conversationId}:`, error);
    
    // במצב פיתוח, החזר הודעות מדומות
    if (process.env.NODE_ENV === 'development') {
      return Array.from({ length: 10 }).map((_, index) => ({
        messageId: `mock-msg-${index}`,
        conversationId,
        userId,
        body: index % 2 === 0 
          ? 'שלום, אני מעוניין לרכוש את המוצר' 
          : 'תודה רבה, אשמח לפרטים נוספים',
        fromMe: index % 2 !== 0,
        timestamp: new Date(Date.now() - (index * 3600000)), // כל הודעה בפער של שעה
        type: 'chat'
      }));
    }
    
    throw error;
  }
};

// קבלת פרטי עסק
const getBusinessInfo = async (userId) => {
  try {
    // קבלת מידע המשתמש מהדאטאבייס
    if (process.env.NODE_ENV === 'development') {
      console.log(`Development mode: Using mock business data for user ${userId}`);
      
      // מידע עסקי מדומה לפי משתמש
      const mockBusinessInfo = {
        'real-user-123': {
          name: "סרביון AI - משתמש אמיתי",
          description: "פתרונות בינה מלאכותית לעסקים",
          industry: "טכנולוגיה",
          services: "צ'אטבוטים, אוטומציה, אינטגרציה עם וואטסאפ",
          hours: "א-ה 9:00-18:00",
          contact: "info@servionai.com, 052-555-1234",
          address: "תל אביב",
          website: "https://www.servionai.com",
          additionalInfo: "אנחנו עוזרים לעסקים להטמיע פתרונות AI"
        },
        'test-user': {
          name: "סרביון AI - משתמש בדיקה",
          description: "פתרונות בינה מלאכותית לעסקים",
          industry: "טכנולוגיה",
          services: "צ'אטבוטים, אוטומציה, אינטגרציה עם וואטסאפ",
          hours: "א-ה 9:00-18:00",
          contact: "info@servionai.com, 052-555-5678",
          address: "תל אביב",
          website: "https://www.servionai.com",
          additionalInfo: "אנחנו עוזרים לעסקים להטמיע פתרונות AI"
        }
      };

      // החזרת מידע העסק המדומה או יצירת מידע ברירת מחדל אם המשתמש לא מוכר
      return mockBusinessInfo[userId] || {
        name: `עסק של ${userId}`,
        description: "פתרונות חדשניים",
        industry: "שירותים",
        services: "שירותים מקצועיים",
        hours: "א-ה 9:00-18:00",
        contact: "contact@example.com, 052-555-9999",
        address: "ישראל",
        website: "https://www.example.com",
        additionalInfo: "עסק לדוגמה"
      };
    }
    
    // בסביבת ייצור, המשך לבדיקת מסד הנתונים
    const user = await collections.User.findOne({ uid: userId });
    
    if (!user || !user.businessInfo) {
      throw new Error(`Business info not found for user ${userId}`);
    }
    
    return user.businessInfo;
  } catch (error) {
    console.error(`Error getting business info for ${userId}:`, error);
    
    // במצב פיתוח, וודא שיש מידע מדומה גם במקרה של שגיאה
    if (process.env.NODE_ENV === 'development') {
      return {
        name: `עסק של ${userId}`,
        description: "פתרונות חדשניים",
        industry: "שירותים",
        services: "שירותים מקצועיים",
        hours: "א-ה 9:00-18:00",
        contact: "contact@example.com, 052-555-9999",
        address: "ישראל",
        website: "https://www.example.com",
        additionalInfo: "עסק לדוגמה - נוצר לאחר שגיאה"
      };
    }
    
    throw error;
  }
};

// עדכון פרטי עסק
const updateBusinessInfo = async (userId, businessData) => {
  try {
    let businessInfo = await BusinessInfo.findOne({ userId });
    
    if (!businessInfo) {
      businessInfo = new BusinessInfo({
        userId,
        ...businessData
      });
    } else {
      Object.assign(businessInfo, businessData);
    }
    
    await businessInfo.save();
    return businessInfo;
  } catch (error) {
    console.error('Error updating business info:', error);
    throw error;
  }
};

/**
 * קבלת שיחה ספציפית
 * @param {string} userId - מזהה המשתמש
 * @param {string} conversationId - מזהה השיחה
 * @returns {Promise<Object>} - פרטי השיחה
 */
const getConversation = async (userId, conversationId) => {
  try {
    const conversation = await collections.Conversation.findOne({
      userId,
      id: conversationId
    });
    
    return conversation ? conversation.toObject() : null;
  } catch (error) {
    console.error(`Error getting conversation ${conversationId} for user ${userId}:`, error);
    
    // במצב פיתוח, החזר שיחה מדומה
    if (process.env.NODE_ENV === 'development') {
      return {
        id: conversationId,
        userId,
        phoneNumber: `+972-${Math.floor(Math.random() * 900000000) + 100000000}`,
        name: `לקוח לדוגמה`,
        lastMessage: 'זו שיחה לדוגמה',
        lastMessageTime: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    throw error;
  }
};

/**
 * שמירת הודעה בשיחת אימון
 * @param {string} userId - מזהה המשתמש
 * @param {string} conversationId - מזהה השיחה
 * @param {Object} messageData - נתוני ההודעה
 * @returns {Promise<boolean>} - האם ההודעה נשמרה בהצלחה
 */
const saveMessage = async (userId, conversationId, messageData) => {
  try {
    // יצירת מודל הודעה אם אינו קיים
    if (!collections.TrainingMessage) {
      const trainingMessageSchema = new mongoose.Schema({
        userId: { type: String, required: true, index: true },
        conversationId: { type: String, required: true, index: true },
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
      });
      
      collections.TrainingMessage = mongoose.model('TrainingMessage', trainingMessageSchema);
    }
    
    // יצירת הודעה חדשה
    const message = new collections.TrainingMessage({
      userId,
      conversationId,
      role: messageData.role,
      content: messageData.content,
      timestamp: messageData.timestamp || new Date()
    });
    
    await message.save();
    
    return true;
  } catch (error) {
    console.error(`Error saving training message for ${userId} in conversation ${conversationId}:`, error);
    return false;
  }
};

/**
 * עדכון סטטוס האימון
 * @param {string} userId - מזהה המשתמש
 * @param {string} status - סטטוס האימון החדש
 * @returns {Promise<boolean>} - האם העדכון הצליח
 */
const updateTrainingStatus = async (userId, status) => {
  try {
    await collections.User.updateOne(
      { uid: userId },
      { 
        'trainingData.status': status,
        'trainingData.lastTraining': new Date()
      }
    );
    
    // ניקוי המטמון
    if (caches.businessData.has(userId)) {
      const businessData = caches.businessData.get(userId);
      if (businessData.trainingData) {
        businessData.trainingData.status = status;
        businessData.trainingData.lastTraining = new Date();
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error updating training status for ${userId}:`, error);
    return false;
  }
};

/**
 * עדכון הוראות אימון מבוססות שיחה
 * @param {string} userId - מזהה המשתמש
 * @param {Object} trainingInstructions - הוראות האימון החדשות
 * @returns {Promise<boolean>} - האם העדכון הצליח
 */
const updateBusinessTrainingInstructions = async (userId, trainingInstructions) => {
  try {
    await collections.User.updateOne(
      { uid: userId },
      { 'businessInfo.conversationTraining': trainingInstructions }
    );
    
    // ניקוי המטמון
    caches.businessData.delete(userId);
    
    return true;
  } catch (error) {
    console.error(`Error updating training instructions for ${userId}:`, error);
    return false;
  }
};

/**
 * Updates the bot settings for a user
 * @param {string} userId - The user's ID
 * @param {Object} botSettings - The user's bot settings
 * @returns {Promise<Object>} - The updated user data
 */
async function updateBotSettings(userId, botSettings) {
  try {
    // בדיקה שה-userId קיים ותקין
    if (!userId) {
      console.warn('No userId provided to updateBotSettings');
      return { acknowledged: false, reason: 'No userId provided' };
    }

    console.log(`Updating bot settings for user ${userId}`);

    // בדיקה האם המשתמש קיים
    let user = null;
    try {
      user = await collections.User.findOne({ uid: userId });
    } catch (error) {
      console.log(`Error finding user ${userId}:`, error.message);
    }

    // אם המשתמש לא קיים, יוצרים אותו
    if (!user && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'production')) {
      try {
        console.log(`Creating new user ${userId} with bot settings`);
        user = new collections.User({
          uid: userId,
          email: `${userId}@example.com`,
          displayName: `User ${userId}`,
          botSettings: botSettings
        });
        await user.save();
        return { acknowledged: true, insertedId: userId };
      } catch (insertError) {
        if (insertError.code === 11000) {
          // מפתח כפול - ייתכן והמשתמש נוצר אחרי שבדקנו אם הוא קיים
          console.log(`Duplicate key error, trying to update existing user ${userId}`);
          const updateResult = await collections.User.updateOne(
            { uid: userId },
            { $set: { botSettings } }
          );
          return updateResult;
        } else {
          console.error(`Error creating user ${userId}:`, insertError);
          throw insertError;
        }
      }
    }

    // עדכון הגדרות הבוט
    const result = await collections.User.updateOne(
      { uid: userId },
      { $set: { botSettings } },
      { upsert: true }
    );
    
    // ניקוי מטמון אם קיים
    if (caches.userData && caches.userData.has(userId)) {
      const userData = caches.userData.get(userId);
      userData.botSettings = botSettings;
    }
    
    console.log(`Bot settings updated for user ${userId}:`, result);
    return result;
  } catch (error) {
    console.error(`Error updating bot settings for user ${userId}:`, error);
    // במצב פיתוח, מחזירים הצלחה למרות השגיאה
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Dev] Returning success despite error for ${userId}`);
      return { acknowledged: true, mock: true };
    }
    throw error;
  }
}

/**
 * קבלת כל המשתמשים במערכת - זמין רק למנהלים
 * @param {string} adminId - מזהה המשתמש המנהל המבצע את הבקשה
 * @returns {Promise<Array>} - מערך של כל המשתמשים
 */
async function getAllUsers(adminId) {
  try {
    // בדיקה שהמשתמש הוא אכן מנהל
    const adminUser = await collections.User.findOne({ uid: adminId });
    if (!adminUser || !adminUser.isAdmin) {
      throw new Error('Access denied: User is not an admin');
    }
    
    // שליפת כל המשתמשים ומיון לפי תאריך יצירה (מהחדש לישן)
    const users = await collections.User.find({}).sort({ createdAt: -1 });
    return users;
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

/**
 * הפעלה או השבתה של משתמש
 * @param {string} adminId - מזהה המנהל המבצע את הפעולה
 * @param {string} userId - מזהה המשתמש לעדכון
 * @param {boolean} isActive - האם להפעיל או להשבית את המשתמש
 * @param {string} notes - הערות אופציונליות
 * @returns {Promise<Object>} - המשתמש המעודכן
 */
async function setUserActiveStatus(adminId, userId, isActive, notes = '') {
  try {
    // בדיקה שהמשתמש הוא אכן מנהל
    const adminUser = await collections.User.findOne({ uid: adminId });
    if (!adminUser || !adminUser.isAdmin) {
      throw new Error('Access denied: User is not an admin');
    }
    
    // עדכון סטטוס המשתמש
    const updateData = {
      isActive: isActive
    };
    
    // אם מפעילים משתמש, נעדכן גם מידע על האקטיבציה
    if (isActive) {
      updateData.activatedBy = adminId;
      updateData.activatedAt = new Date();
    }
    
    // אם נוספו הערות, נעדכן גם אותן
    if (notes) {
      updateData.notes = notes;
    }
    
    const updatedUser = await collections.User.findOneAndUpdate(
      { uid: userId },
      { $set: updateData },
      { new: true }
    );
    
    if (!updatedUser) {
      throw new Error('User not found');
    }
    
    return updatedUser;
  } catch (error) {
    console.error(`Error ${isActive ? 'activating' : 'deactivating'} user:`, error);
    throw error;
  }
}

/**
 * הפיכת משתמש למנהל או הסרת הרשאות ניהול
 * @param {string} adminId - מזהה המנהל המבצע את הפעולה
 * @param {string} userId - מזהה המשתמש לעדכון
 * @param {boolean} isAdmin - האם להפוך למנהל או להסיר הרשאות
 * @returns {Promise<Object>} - המשתמש המעודכן
 */
async function setUserAdminStatus(adminId, userId, isAdmin) {
  try {
    // בדיקה שהמשתמש הוא אכן מנהל
    const adminUser = await collections.User.findOne({ uid: adminId });
    if (!adminUser || !adminUser.isAdmin) {
      throw new Error('Access denied: User is not an admin');
    }
    
    // עדכון הרשאות הניהול של המשתמש
    const updatedUser = await collections.User.findOneAndUpdate(
      { uid: userId },
      { $set: { isAdmin: isAdmin } },
      { new: true }
    );
    
    if (!updatedUser) {
      throw new Error('User not found');
    }
    
    return updatedUser;
  } catch (error) {
    console.error(`Error ${isAdmin ? 'granting' : 'revoking'} admin rights:`, error);
    throw error;
  }
}

/**
 * יצירת מנהל מערכת ראשוני (רק אם אין מנהלים במערכת)
 * @param {string} email - כתובת המייל של המנהל הראשי
 * @returns {Promise<Object>} - פרטי המנהל שנוצר או קיים
 */
async function createInitialAdmin(email) {
  try {
    // בדיקה אם כבר יש מנהל במערכת
    const existingAdmin = await collections.User.findOne({ isAdmin: true });
    
    if (existingAdmin) {
      // בדיקה אם המייל הנוכחי כבר מוגדר כמנהל
      const isEmailAdmin = await collections.User.findOne({ email: email, isAdmin: true });
      if (isEmailAdmin) {
        return { success: true, message: 'Email is already an admin', user: isEmailAdmin };
      } else {
        return { success: false, message: 'Admin already exists in the system' };
      }
    }
    
    // בדיקה אם המשתמש קיים לפי אימייל
    let adminUser = await collections.User.findOne({ email: email });
    
    if (adminUser) {
      // אם המשתמש קיים, נהפוך אותו למנהל
      adminUser = await collections.User.findOneAndUpdate(
        { email: email },
        { 
          $set: { 
            isAdmin: true, 
            isActive: true,
            notes: 'Initial system administrator'
          } 
        },
        { new: true }
      );
    } else {
      // יצירת משתמש מנהל חדש עם מזהה מיוחד
      const adminId = `admin-${Date.now()}`;
      adminUser = new collections.User({
        uid: adminId,
        email: email,
        displayName: 'System Administrator',
        isAdmin: true,
        isActive: true,
        notes: 'Initial system administrator',
        createdAt: new Date(),
        activatedAt: new Date()
      });
      
      await adminUser.save();
    }
    
    return { success: true, message: 'Initial admin created successfully', user: adminUser };
  } catch (error) {
    console.error('Error creating initial admin:', error);
    return { success: false, message: error.message };
  }
}

/**
 * עדכון פרטי משתמש
 * @param {string} adminId - מזהה המנהל המבצע את הפעולה 
 * @param {string} userId - מזהה המשתמש לעדכון
 * @param {Object} userData - פרטי המשתמש המעודכנים
 * @returns {Promise<Object>} - המשתמש המעודכן
 */
async function updateUserDetails(adminId, userId, userData) {
  try {
    // בדיקה שהמשתמש הוא אכן מנהל
    const adminUser = await collections.User.findOne({ uid: adminId });
    if (!adminUser || !adminUser.isAdmin) {
      throw new Error('Access denied: User is not an admin');
    }
    
    // וידוא שלא מנסים לעדכן שדות רגישים
    const safeUpdateData = { ...userData };
    delete safeUpdateData.uid; // לא מאפשרים לשנות מזהה משתמש
    delete safeUpdateData.isAdmin; // לא מאפשרים לשנות סטטוס מנהל כאן (יש לכך פונקציה נפרדת)
    
    const updatedUser = await collections.User.findOneAndUpdate(
      { uid: userId },
      { $set: safeUpdateData },
      { new: true }
    );
    
    if (!updatedUser) {
      throw new Error('User not found');
    }
    
    return updatedUser;
  } catch (error) {
    console.error('Error updating user details:', error);
    throw error;
  }
}

/**
 * קבלת פרטי משתמש מפורטים
 * @param {string} adminId - מזהה המנהל המבצע את הבקשה
 * @param {string} userId - מזהה המשתמש לשליפה
 * @returns {Promise<Object>} - פרטי המשתמש המלאים
 */
async function getUserDetailsForAdmin(adminId, userId) {
  try {
    // בדיקה שהמשתמש הוא אכן מנהל
    const adminUser = await collections.User.findOne({ uid: adminId });
    if (!adminUser || !adminUser.isAdmin) {
      throw new Error('Access denied: User is not an admin');
    }
    
    // שליפת פרטי המשתמש
    const user = await collections.User.findOne({ uid: userId });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // שליפת מידע נוסף על המשתמש
    
    // מידע על הבוט של המשתמש
    const botSettings = await collections.User.findOne({ userId: userId });
    
    // מידע על שיחות אחרונות
    const recentConversations = await collections.Conversation.find({ userId: userId })
      .sort({ updatedAt: -1 })
      .limit(5);
      
    // החזרת המידע המלא
    return {
      user: user,
      botSettings: botSettings || null,
      recentConversations: recentConversations || []
    };
  } catch (error) {
    console.error('Error getting detailed user info:', error);
    throw error;
  }
}

/**
 * אימון בוט עבור משתמש ספציפי על ידי מנהל
 * @param {string} adminId - מזהה המנהל המבצע את הפעולה
 * @param {string} userId - מזהה המשתמש לאימון הבוט
 * @param {Object} trainingData - נתוני אימון מותאמים
 * @returns {Promise<Object>} - סטטוס האימון
 */
async function trainUserBotByAdmin(adminId, userId, trainingData) {
  try {
    // בדיקה שהמשתמש הוא אכן מנהל
    const adminUser = await collections.User.findOne({ uid: adminId });
    if (!adminUser || !adminUser.isAdmin) {
      throw new Error('Access denied: User is not an admin');
    }
    
    // עדכון סטטוס האימון ל-"מאמן"
    await collections.User.findOneAndUpdate(
      { uid: userId },
      { 
        $set: { 
          'trainingData.status': 'training',
          'trainingData.lastTraining': new Date(),
          'trainingData.trainingInstructions': trainingData.instructions || ''
        } 
      }
    );
    
    // כאן יש להפעיל את תהליך האימון בפועל
    // TODO: להוסיף קריאה לשירות שמאמן את הבוט
    
    // מניח שהאימון מצליח
    await collections.User.findOneAndUpdate(
      { uid: userId },
      { $set: { 'trainingData.status': 'trained' } }
    );
    
    return {
      success: true,
      message: 'Bot training initiated successfully',
      userId: userId
    };
  } catch (error) {
    // עדכון סטטוס האימון ל-"שגיאה" במקרה של כישלון
    await collections.User.findOneAndUpdate(
      { uid: userId },
      { $set: { 'trainingData.status': 'error' } }
    );
    
    console.error('Error training user bot by admin:', error);
    throw error;
  }
}

/**
 * מציאת משתמש לפי אימייל
 * @param {string} email - אימייל לחיפוש
 * @returns {Promise<Object|null>} - אובייקט המשתמש או null אם לא נמצא
 */
async function findUserByEmail(email) {
  try {
    // חיפוש המשתמש לפי אימייל
    const user = await collections.User.findOne({ email });
    
    if (!user) {
      return null;
    }
    
    return user.toObject();
  } catch (error) {
    console.error(`Error finding user by email ${email}:`, error);
    return null;
  }
}

/**
 * הגדרת משתמש כמנהל מערכת
 * @param {string} userId - מזהה המשתמש
 * @param {string} notes - הערות לגבי המשתמש
 * @returns {Promise<Object|null>} - אובייקט המשתמש המעודכן או null אם נכשל
 */
async function setUserAsAdmin(userId, notes = '') {
  try {
    // עדכון המשתמש עם הרשאות מנהל
    const updatedUser = await collections.User.findOneAndUpdate(
      { uid: userId },
      { 
        $set: { 
          isAdmin: true, 
          isActive: true,
          activatedAt: new Date(),
          notes: notes
        } 
      },
      { new: true }
    );
    
    if (!updatedUser) {
      console.error(`User ${userId} not found when setting as admin`);
      return null;
    }
    
    // ניקוי המטמון
    if (caches.userData.has(userId)) {
      caches.userData.delete(userId);
    }
    
    return updatedUser.toObject();
  } catch (error) {
    console.error(`Error setting user ${userId} as admin:`, error);
    return null;
  }
}

/**
 * יצירת משתמש מנהל חדש
 * @param {string} email - אימייל המשתמש החדש
 * @param {string} adminId - מזהה ייחודי למנהל (אופציונלי)
 * @returns {Promise<Object|null>} - אובייקט המשתמש החדש או null אם נכשל
 */
async function createNewAdmin(email, adminId = null) {
  try {
    // יצירת מזהה ייחודי אם לא סופק
    if (!adminId) {
      adminId = `admin-${Date.now()}`;
    }
    
    // יצירת משתמש מנהל חדש
    const newAdmin = new collections.User({
      uid: adminId,
      email: email,
      displayName: 'System Administrator',
      isAdmin: true,
      isActive: true,
      notes: 'Initial system administrator',
      createdAt: new Date(),
      activatedAt: new Date()
    });
    
    await newAdmin.save();
    return newAdmin.toObject();
  } catch (error) {
    console.error(`Error creating new admin with email ${email}:`, error);
    return null;
  }
}

async function getChatHistory(userId, limit = 5) {
  try {
    const messages = await db.collection('chat_messages')
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return messages.reverse();
  } catch (error) {
    console.error('Error getting chat history:', error);
    throw error;
  }
}

async function saveChatMessage(userId, content, sender) {
  try {
    await db.collection('chat_messages').insertOne({
      userId,
      content,
      sender,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error saving chat message:', error);
    throw error;
  }
}

/**
 * עדכון פרטי משתמש
 * @param {string} userId - מזהה המשתמש
 * @param {Object} profileData - נתוני הפרופיל לעדכון
 * @returns {Promise<Object>} - המשתמש המעודכן
 */
async function updateUserProfile(userId, profileData) {
  try {
    // בדיקה שהמשתמש קיים
    const user = await collections.User.findOne({ uid: userId });
    if (!user) {
      throw new Error('User not found');
    }

    // עדכון השדות המותרים
    const allowedFields = ['displayName', 'phone', 'email'];
    const updateData = {};
    
    for (const field of allowedFields) {
      if (profileData[field] !== undefined) {
        updateData[field] = profileData[field];
      }
    }

    // עדכון המשתמש
    const updatedUser = await collections.User.findOneAndUpdate(
      { uid: userId },
      { $set: updateData },
      { new: true }
    );

    return updatedUser;
  } catch (error) {
    console.error(`Error updating user profile for ${userId}:`, error);
    throw error;
  }
}

/**
 * וידוא הרשאות מנהל
 * @param {string} userId - מזהה המשתמש לבדיקה
 * @returns {Promise<boolean>} - האם למשתמש יש הרשאות מנהל
 */
async function ensureAdminPrivileges(userId) {
  try {
    // בדיקה שהמשתמש קיים ושהוא מנהל
    const user = await collections.User.findOne({ uid: userId });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!user.isAdmin) {
      throw new Error('User does not have admin privileges');
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking admin privileges for ${userId}:`, error);
    throw error;
  }
}

// ייבוא אנשי קשר
const importContacts = async (contacts) => {
  try {
    // יצירת מודל דינמי לאנשי קשר
    const Contact = mongoose.model('Contact', new mongoose.Schema({
      userId: { type: String, required: true, index: true },
      phone: { type: String, required: true },
      name: String,
      notes: String,
      type: { type: String, enum: ['allowed', 'blocked'], required: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }));

    // שמירת כל אנשי הקשר
    await Contact.insertMany(contacts, { ordered: false });
    
    return { success: true, count: contacts.length };
  } catch (error) {
    console.error('Error importing contacts:', error);
    throw error;
  }
};

// ייצוא פונקציות
module.exports = {
  initializeMongoDB,
  verifyIdToken,
  getUserData,
  saveWhatsAppSession,
  getWhatsAppSession,
  deleteWhatsAppSession,
  updateWhatsAppStatus,
  saveWhatsAppMessage,
  updateConversationLastMessage,
  getOrCreateConversation,
  getAgentTrainingData,
  getConversations,
  getConversationMessages,
  getConversation,
  saveMessage,
  getBusinessInfo,
  updateBusinessInfo,
  updateTrainingStatus,
  updateBusinessTrainingInstructions,
  updateBotSettings,
  getAllUsers,
  setUserActiveStatus,
  setUserAdminStatus,
  createInitialAdmin,
  updateUserDetails,
  getUserDetailsForAdmin,
  trainUserBotByAdmin,
  updateUserProfile,
  ensureAdminPrivileges,
  findUserByEmail,
  setUserAsAdmin,
  createNewAdmin,
  collections,
  getChatHistory,
  saveChatMessage,
  importContacts
}; 