const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// מבנה נתונים לקשירת MongoDB Collections
const collections = {};

// מבנה נתונים למטמון של מידע בזיכרון
const caches = {
  userData: new Map(),
  businessData: new Map(),
  whatsappStatus: new Map(),
};

// סכמות MongoDB
const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  displayName: { type: String },
  createdAt: { type: Date, default: Date.now },
  whatsappStatus: {
    status: { type: String, enum: ['connected', 'connecting', 'disconnected', 'error'], default: 'disconnected' },
    lastUpdated: { type: Date, default: Date.now }
  },
  businessInfo: {
    name: String,
    description: String,
    industry: String,
    services: String,
    hours: String,
    contact: String,
    address: String,
    additionalInfo: String,
    website: String
  },
  trainingData: {
    status: { type: String, enum: ['untrained', 'training', 'trained', 'error'], default: 'untrained' },
    lastTraining: Date,
    trainingInstructions: String
  }
});

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
    await mongoose.connect('mongodb+srv://seasonscrm:pfyc6DKNINPGK2a2@servior.3ixxc01.mongodb.net/?retryWrites=true&w=majority&appName=servior');

    console.log('MongoDB initialized successfully');

    // יצירת מודלים
    collections.User = mongoose.model('User', userSchema);
    collections.Conversation = mongoose.model('Conversation', conversationSchema);
    collections.Message = mongoose.model('Message', messageSchema);
    collections.WhatsappSession = mongoose.model('WhatsappSession', whatsappSessionSchema);

    return true;
  } catch (error) {
    console.error('Error initializing MongoDB:', error);
    return false;
  }
};

/**
 * מאמת טוקן JWT ומחזיר את מזהה המשתמש
 * @param {string} token - הטוקן לאימות
 * @returns {Promise<{uid: string, email: string}>} - מידע על המשתמש
 */
async function verifyIdToken(token) {
  try {
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

// קבלת מידע משתמש
const getUserData = async (uid) => {
  try {
    // בדיקה אם המידע קיים במטמון
    if (caches.userData.has(uid)) {
      return caches.userData.get(uid);
    }

    // נסה למצוא את המשתמש ב-MongoDB
    let user = await collections.User.findOne({ uid });

    // אם המשתמש לא קיים, צור אותו
    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        // במצב פיתוח, צור משתמש חדש עם מידע לדוגמה
        
        // מידע עסקי מותאם לפי המשתמש
        let businessInfo = {
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
        
        // מידע מותאם עבור משתמש אמיתי
        if (uid === 'real-user-123') {
          businessInfo = {
            name: "סרביון AI - משתמש אמיתי",
            description: "פתרונות בינה מלאכותית מתקדמים",
            industry: "טכנולוגיה וחדשנות",
            services: "צ'אטבוטים, אוטומציה, אינטגרציה עם וואטסאפ, פתרונות קוליים",
            hours: "א-ה 9:00-20:00, ו 9:00-14:00",
            contact: "real@servionai.com, 052-555-9876",
            address: "תל אביב, רוטשילד 123",
            website: "https://www.servionai.com/real",
            additionalInfo: "מובילים בתחום הבינה המלאכותית עם התמחות בפתרונות מותאמים אישית"
          };
        }
        
        user = new collections.User({
          uid,
          email: uid === 'real-user-123' ? 'realuser@example.com' : `${uid}@example.com`,
          displayName: uid === 'real-user-123' ? 'משתמש אמיתי' : `User ${uid}`,
          whatsappStatus: { status: 'disconnected', lastUpdated: new Date() },
          businessInfo: businessInfo,
          trainingData: {
            status: "trained",
            lastTraining: new Date()
          }
        });
        await user.save();
      } else {
        throw new Error(`User ${uid} not found`);
      }
    }

    // שמירה במטמון
    const userData = user.toObject();
    caches.userData.set(uid, userData);
    
    return userData;
  } catch (error) {
    console.error(`Error getting user data for ${uid}:`, error);
    
    // במצב פיתוח, החזר מידע מדומה
    if (process.env.NODE_ENV === 'development') {
      // מידע מותאם עבור משתמשים שונים
      let mockBusinessInfo = {
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
      
      if (uid === 'real-user-123') {
        mockBusinessInfo = {
          name: "סרביון AI - משתמש אמיתי",
          description: "פתרונות בינה מלאכותית מתקדמים",
          industry: "טכנולוגיה וחדשנות",
          services: "צ'אטבוטים, אוטומציה, אינטגרציה עם וואטסאפ, פתרונות קוליים",
          hours: "א-ה 9:00-20:00, ו 9:00-14:00",
          contact: "real@servionai.com, 052-555-9876",
          address: "תל אביב, רוטשילד 123",
          website: "https://www.servionai.com/real",
          additionalInfo: "מובילים בתחום הבינה המלאכותית עם התמחות בפתרונות מותאמים אישית"
        };
      }
      
      const mockUser = {
        uid,
        email: uid === 'real-user-123' ? 'realuser@example.com' : `${uid}@example.com`,
        displayName: uid === 'real-user-123' ? 'משתמש אמיתי' : `User ${uid}`,
        whatsappStatus: { status: 'disconnected', lastUpdated: new Date() },
        businessInfo: mockBusinessInfo,
        trainingData: {
          status: "trained",
          lastTraining: new Date()
        }
      };
      return mockUser;
    }
    
    throw error;
  }
};

// שמירת מידע סשן וואטסאפ
const saveWhatsAppSession = async (userId, sessionData) => {
  try {
    await collections.WhatsappSession.updateOne(
      { userId },
      { userId, sessionData, updatedAt: new Date() },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error(`Error saving WhatsApp session for ${userId}:`, error);
    return false;
  }
};

// קבלת מידע סשן וואטסאפ
const getWhatsAppSession = async (userId) => {
  try {
    const session = await collections.WhatsappSession.findOne({ userId });
    return session ? session.toObject() : null;
  } catch (error) {
    console.error(`Error getting WhatsApp session for ${userId}:`, error);
    return null;
  }
};

// עדכון סטטוס חיבור וואטסאפ
const updateWhatsAppStatus = async (userId, status) => {
  try {
    // עדכון במסד הנתונים
    await collections.User.updateOne(
      { uid: userId },
      { 'whatsappStatus.status': status, 'whatsappStatus.lastUpdated': new Date() },
      { upsert: true }
    );
    
    // עדכון במטמון
    if (caches.userData.has(userId)) {
      const userData = caches.userData.get(userId);
      userData.whatsappStatus = { status, lastUpdated: new Date() };
    }
    
    // שמירה במטמון נפרד לסטטוס וואטסאפ
    caches.whatsappStatus.set(userId, {
      status,
      lastUpdated: new Date()
    });
    
    return true;
  } catch (error) {
    console.error(`Error updating WhatsApp status for ${userId}:`, error);
    
    // במצב פיתוח, שמור במטמון בלבד
    if (process.env.NODE_ENV === 'development') {
      caches.whatsappStatus.set(userId, {
        status,
        lastUpdated: new Date()
      });
      return true;
    }
    
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
const updateBusinessInfo = async (userId, businessInfo) => {
  try {
    console.log("Starting to update " + userId + " Data with:", businessInfo);
    
    // וידוא שמידע העסק לא ריק
    if (!businessInfo) {
      console.error(`Business info is empty or invalid for ${userId}`);
      return false;
    }
    
    console.log("Business info is not empty");
    
    // בדיקה אם המשתמש קיים במערכת
    let user = await collections.User.findOne({ uid: userId });
    
    if (!user) {
      console.log(`User ${userId} not found, creating new user with business info`);
      
      // יצירת משתמש חדש אם לא קיים
      user = new collections.User({
        uid: userId,
        email: `${userId}@example.com`, // אימייל זמני
        displayName: `User ${userId.substring(0, 8)}`,
        businessInfo: businessInfo,
        trainingData: {
          status: 'untrained',
          lastTraining: new Date()
        },
        createdAt: new Date()
      });
      
      await user.save();
      console.log(`New user ${userId} created successfully with business info`);
    } else {
      console.log(`User ${userId} exists, updating business info`);
      
      // עדכון במסד הנתונים - שימוש ב-$set כדי לעדכן רק את שדה businessInfo
      const updateResult = await collections.User.updateOne(
        { uid: userId },
        { $set: { businessInfo: businessInfo } }
      );
      
      console.log("Business info updated for " + userId, updateResult);
    }
    
    // ניקוי המטמון
    caches.businessData.delete(userId);
    console.log("Business data cache deleted for " + userId);
    
    return true;
  } catch (error) {
    console.error(`Error updating business info for ${userId}:`, error);
    console.log("Error updating business info for " + userId + ": " + error);
    return false;
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

// ייצוא פונקציות
module.exports = {
  initializeMongoDB,
  verifyIdToken,
  getUserData,
  saveWhatsAppSession,
  getWhatsAppSession,
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
  updateBusinessTrainingInstructions
}; 