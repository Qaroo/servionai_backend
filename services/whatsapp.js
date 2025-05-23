const { Client, NoAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const mongodbService = require('./mongodb');
const openaiService = require('./openai');
const MongoDBAuthStrategy = require('./MongoDBAuthStrategy');

// מאגר של חיבורי WhatsApp פעילים
const clients = new Map();

// שמירת בקשות אחרונות לפי משתמש (לטובת מניעת עומס)
const lastRequests = new Map();

// מיפוי לשמירת מידע על ייבואים פעילים לפי משתמש
const activeImports = new Map();

let client = null;
let sessions = new Map();
let io = null;

/**
 * אתחול מערכת ה-WhatsApp והרשמה לאירועים
 * @param {Object} socketIO - מופע Socket.IO server
 * @returns {Promise<void>}
 */
const initializeWhatsApp = async (socketIO) => {
  return new Promise((resolve) => {
    io = socketIO;
    
  // טיפול באירועי Socket.IO
  io.on('connection', (socket) => {
    console.log('New client connected to WhatsApp service:', socket.id);

    // אירוע התנתקות
    socket.on('disconnect', () => {
      console.log('Client disconnected from WhatsApp service:', socket.id);
    });
  });

  console.log('WhatsApp service initialized');
    resolve();
  });
};

async function getOrCreateSession(userId) {
  if (!sessions.has(userId)) {
    const user = await mongodbService.getUserByWhatsAppId(userId);
    if (!user) {
      throw new Error('User not found');
    }
    sessions.set(userId, {
      userId: user._id,
      lastActive: Date.now()
    });
  }
  return sessions.get(userId);
}

async function handleMessage(message, session) {
  try {
    const chatHistory = await mongodbService.getChatHistory(session.userId, 5); // מקבל 5 ההודעות האחרונות
    const response = await openaiService.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        ...chatHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: 'user', content: message }
      ],
      max_tokens: 150
    });
    
    await mongodbService.saveChatMessage(session.userId, message, 'user');
    await mongodbService.saveChatMessage(session.userId, response.data.choices[0].message.content, 'assistant');
    
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error handling message:', error);
    throw error;
  }
}

/**
 * יצירת לקוח WhatsApp חדש למשתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Object>} - מידע על החיבור
 */
const createClient = async (userId) => {
  try {
    console.log(`[createClient] Creating WhatsApp client for user: ${userId}`);
    
    // בדיקה אם כבר קיים לקוח למשתמש זה
    if (clients.has(userId)) {
      const existingClient = clients.get(userId);
      
      console.log(`[createClient] Client already exists with status: ${existingClient.status}`);
      
      // אם הלקוח כבר מאותחל, החזר שגיאה
      if (existingClient.status === 'CONNECTED') {
        return { 
          success: false, 
          error: 'WhatsApp client already connected' 
        };
      }
      
      // אם הלקוח בתהליך אתחול, החזר את ה-QR code הקיים
      if (existingClient.status === 'INITIALIZING' && existingClient.qrCode) {
        return { 
          success: true, 
          status: 'INITIALIZING',
          qrCode: existingClient.qrCode 
        };
      }
      
      // סגירת הלקוח הקיים אם הוא לא תקין
      try {
        console.log(`[createClient] Destroying existing client for user: ${userId}`);
        await existingClient.client.destroy();
      } catch (error) {
        console.error('[createClient] Error destroying existing client:', error);
      }
      
      // הסרת הלקוח מהמאגר
      clients.delete(userId);
      console.log(`[createClient] Removed existing client for user: ${userId}`);
    }
    
    // נסה לטעון סשן קיים מ-MongoDB
    let sessionData = null;
    try {
      sessionData = await mongodbService.getWhatsAppSession(userId);
      if (sessionData) {
        console.log(`[createClient] Found existing session in MongoDB for user: ${userId}`);
      }
    } catch (error) {
      console.error(`[createClient] Error retrieving session from MongoDB for user ${userId}:`, error);
      // ממשיכים גם אם אין סשן
    }
    
    // יצירת לקוח WhatsApp חדש עם NoAuth strategy
    console.log(`[createClient] Creating new client for user: ${userId} with NoAuth Strategy`);
    const client = new Client({
      authStrategy: new NoAuth(),
      webVersionCache: {
        type: 'remote',
      },
      puppeteer: null, // ביטול השימוש בפאפטיר לחלוטין
      webVersion: '2.2326.0',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    
    // אובייקט לשמירת מידע על החיבור
    const clientInfo = {
      client,
      status: 'INITIALIZING',
      qrCode: null,
      createdAt: new Date(),
      userId
    };
    
    // שמירת הלקוח במאגר
    clients.set(userId, clientInfo);
    console.log(`[createClient] Client instance created and stored for user: ${userId}`);
    
    // אירוע קבלת קוד QR
    client.on('qr', async (qr) => {
      try {
        console.log(`[QR Event] QR Code received for user: ${userId}`);
      
        // יצירת תמונת QR פשוטה יותר
        const qrDataURL = await qrcode.toDataURL(qr, {
          errorCorrectionLevel: 'L',
          margin: 1,
          scale: 4
        });
        
        clientInfo.qrCode = qrDataURL;
        clientInfo.status = 'INITIALIZING';
        
        // עדכון סטטוס החיבור ב-MongoDB
        await mongodbService.updateWhatsAppStatus(userId, 'connecting');
        console.log(`[QR Event] Updated QR code and status for user: ${userId}`);
        
        // שליחת אירוע QR דרך Socket.IO
        if (io) {
          io.to(userId).emit('whatsapp_qr', { qrCode: qrDataURL });
          console.log(`[QR Event] Emitted QR code via Socket.IO to user: ${userId}`);
        }
      } catch (error) {
        console.error('[QR Event] Error generating QR image:', error);
        clientInfo.qrCode = qr;
        clientInfo.status = 'INITIALIZING';
      }
    });
    
    // אירוע אימות מוצלח
    client.on('authenticated', async (session) => {
      console.log(`[Authenticated Event] Client ${userId} authenticated successfully`);
      clientInfo.status = 'AUTHENTICATED';
      
      // שמירת הסשן ב-MongoDB
      try {
        await mongodbService.saveWhatsAppSession(userId, session);
        console.log(`[Authenticated Event] Session saved to MongoDB for user: ${userId}`);
      } catch (error) {
        console.error(`[Authenticated Event] Error saving session to MongoDB for user ${userId}:`, error);
      }
      
      // שליחת אירוע אימות דרך Socket.IO
      if (io) {
        io.to(userId).emit('whatsapp_authenticated');
        console.log(`[Authenticated Event] Emitted authentication event via Socket.IO to user: ${userId}`);
      }
    });
    
    // אירוע מוכן לשימוש
    client.on('ready', async () => {
      console.log(`[Ready Event] Client ${userId} is ready`);
      clientInfo.status = 'CONNECTED';
      
      // עדכון סטטוס החיבור ב-MongoDB
      await mongodbService.updateWhatsAppStatus(userId, 'connected');
      
      // שליחת אירוע מוכנות דרך Socket.IO
      if (io) {
        io.to(userId).emit('whatsapp_ready');
        console.log(`[Ready Event] Emitted ready event via Socket.IO to user: ${userId}`);
      }
    });
    
    // אירוע התנתקות
    client.on('disconnected', async (reason) => {
      console.log(`[Disconnected Event] Client ${userId} disconnected, reason: ${reason}`);
      clientInfo.status = 'DISCONNECTED';
      
      // מחיקת הסשן ב-MongoDB
      try {
        await mongodbService.deleteWhatsAppSession(userId);
        console.log(`[Disconnected Event] Session deleted from MongoDB for user: ${userId}`);
      } catch (error) {
        console.error(`[Disconnected Event] Error deleting session from MongoDB for user ${userId}:`, error);
      }
      
      // עדכון סטטוס החיבור ב-MongoDB
      await mongodbService.updateWhatsAppStatus(userId, 'disconnected');
      
      // שליחת אירוע התנתקות דרך Socket.IO
      if (io) {
        io.to(userId).emit('whatsapp_disconnected', { reason });
        console.log(`[Disconnected Event] Emitted disconnected event via Socket.IO to user: ${userId}`);
      }
      
      // הסרת הלקוח מהמאגר
      clients.delete(userId);
      console.log(`[Disconnected Event] Removed client from map for user: ${userId}`);
    });
    
    // אירוע שגיאה
    client.on('auth_failure', async (error) => {
      console.error(`[Auth Failure Event] Authentication failed for user: ${userId}`, error);
      clientInfo.status = 'AUTH_FAILURE';
      
      // עדכון סטטוס החיבור ב-MongoDB
      await mongodbService.updateWhatsAppStatus(userId, 'auth_failure');
      
      // שליחת אירוע שגיאת אימות דרך Socket.IO
      if (io) {
        io.to(userId).emit('whatsapp_auth_failure', { error: error.toString() });
        console.log(`[Auth Failure Event] Emitted auth failure event via Socket.IO to user: ${userId}`);
      }
    });
    
    // פתרון באגים
    client.on('change_state', state => {
      console.log(`[State Change Event] Client ${userId} state changed to:`, state);
    });
    
    // לוג של כל שגיאה
    client.on('message_create', async (message) => {
      console.log(`[Message Create Event] New message created for user: ${userId}, message ID: ${message.id.id}`);
    });
    
    // אירוע קבלת הודעה
    client.on('message', async (message) => {
      // טיפול בהודעות חדשות
      console.log(`[Message Event] New message received for user: ${userId}, from: ${message.from}, body length: ${message.body.length}`);
      await handleIncomingMessage(userId, message);
    });
    
    // אתחול הלקוח
    console.log(`[createClient] Initializing client for user: ${userId}`);
    try {
      await client.initialize();
      console.log(`[createClient] Client initialized for user: ${userId}`);
      
      return { 
        success: true, 
        status: 'INITIALIZING',
        qrCode: clientInfo.qrCode 
      };
    } catch (error) {
      console.error(`[createClient] Error initializing client for user: ${userId}:`, error);
      
      // הסרת הלקוח מהמאגר במקרה של שגיאה
      clients.delete(userId);
      
      return { 
        success: false, 
        error: `Failed to initialize WhatsApp client: ${error.message}` 
      };
    }
  } catch (error) {
    console.error(`[createClient] General error for user: ${userId}:`, error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * טיפול בהודעה נכנסת
 * @param {string} userId - מזהה המשתמש
 * @param {Object} message - אובייקט ההודעה מ-whatsapp-web.js
 */
const handleIncomingMessage = async (userId, message) => {
  try {
    console.log(`[handleIncomingMessage] Processing message for user: ${userId}, from: ${message.from}`);
    
    // בדיקה שקיבלנו הודעה וגם משתמש תקין
    if (!message || !userId) {
      console.error('Invalid message or userId received in handleIncomingMessage');
      return;
    }

    // קבלת מידע הלקוח
    const phoneNumber = message.from;
    
    // הוצאת המספר טלפון בפורמט תקין
    if (!phoneNumber || phoneNumber === 'status@broadcast') {
      // נדלג על הודעות status broadcast
      return;
    }

    let name = null;
    let chat = null;
    
    try {
      chat = await message.getChat();
      
      // נדלג על צ'אטים קבוצתיים
      if (chat.isGroup) {
        return;
      }
      
      const contact = await message.getContact();
      name = contact.name || contact.pushname || `לקוח ${phoneNumber.substring(phoneNumber.length - 4)}`;
    } catch (chatError) {
      // במקרה של שגיאה בקבלת המידע, נשתמש בשם ברירת מחדל
      name = `לקוח ${phoneNumber.substring(Math.max(0, phoneNumber.length - 4))}`;
    }
    
    console.log(`Processing incoming message for user ${userId} from ${phoneNumber}, name: ${name}`);
    
    try {
      // יצירת/קבלת שיחה ב-MongoDB
      let conversation = await mongodbService.getOrCreateConversation(userId, phoneNumber, name);
      
      // שמירת ההודעה הנכנסת
      await mongodbService.saveWhatsAppMessage(userId, conversation.id, {
        messageId: message.id?._serialized || `msg-${Date.now()}`,
        body: message.body,
        fromMe: false,
        timestamp: new Date(message.timestamp * 1000 || Date.now()),
        type: message.type || 'chat',
        hasMedia: message.hasMedia || false,
        phoneNumber
      });
      
      // בדיקה האם יש להגיב למספר טלפון זה לפי הגדרות הבוט
      const shouldRespond = await shouldRespondToPhone(userId, phoneNumber);
      if (!shouldRespond) {
        console.log(`Skipping AI response for ${phoneNumber} based on bot settings`);
        return;
      }

      // בדיקה האם זה חלק משיחה אנושית פעילה
      const isHumanConversation = await isActiveHumanConversation(userId, conversation.id, phoneNumber);
      if (isHumanConversation) {
        console.log(`Skipping AI response for ${phoneNumber} because there's an active human conversation`);
        return;
      }
      
      // קבלת נתוני אימון הסוכן
      let agentData = null;
      try {
        agentData = await mongodbService.getAgentTrainingData(userId);
      } catch (agentError) {
        console.error(`Error retrieving agent data for user ${userId}:`, agentError.message);
        // במקרה של שגיאת אימון הסוכן, ננסה להשתמש בנתונים מדומים
        console.log('[MOCK] Returning mock agent data for message handling');
        agentData = {
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
      }
      
      // קבלת תגובה מה-AI
      if (!agentData || !agentData.businessInfo) {
        console.log(`No business info for user ${userId}, skipping AI response`);
        return;
      }
      
      let aiResponse = null;
      try {
        // שימוש במנגנון החדש לניהול שיחה
        const result = await openaiService.handleSmartConversation(
          message.body,
          userId,
          agentData.businessInfo
        );
        
        aiResponse = result.response;
        
        // לוג של השימוש בטוקנים
        console.log(`AI Response for user ${userId}:
          Model: ${result.model}
          Prompt Tokens: ${result.usage.prompt_tokens}
          Completion Tokens: ${result.usage.completion_tokens}
          Total Tokens: ${result.usage.total_tokens}
        `);
      } catch (aiError) {
        console.error(`Error getting AI response for user ${userId}:`, aiError.message);
        return;
      }
      
      // שליחת תגובת AI
      if (!clients.has(userId)) {
        console.log(`Cannot send AI response - no client for user ${userId}`);
        return;
      }
      
      const clientInfo = clients.get(userId);
      if (clientInfo && (clientInfo.status === 'CONNECTED' || clientInfo.status === 'connected')) {
        try {
          await clientInfo.client.sendMessage(phoneNumber, aiResponse);
          console.log(`Sent AI response to ${phoneNumber} for user ${userId}`);
          
          // שמירת תגובת ה-AI ב-MongoDB
          await mongodbService.saveWhatsAppMessage(userId, conversation.id, {
            messageId: `ai-${Date.now()}`,
            body: aiResponse,
            fromMe: true,
            isAI: true,
            timestamp: new Date(),
            type: 'chat',
            hasMedia: false,
            phoneNumber
          });
        } catch (sendError) {
          console.error(`Error sending AI response to ${phoneNumber} for user ${userId}:`, sendError.message);
        }
        } else {
        console.log(`Cannot send AI response - client not connected for user ${userId}. Client status: ${clientInfo ? clientInfo.status : 'no client'}`);
      }
    } catch (processError) {
      console.error(`Error processing message for user ${userId}:`, processError.message);
        }
      } catch (error) {
    console.error('Error handling incoming message:', error);
  }
};

/**
 * בדיקה האם מתנהלת שיחה אנושית פעילה
 * שיחה תיחשב כאנושית אם:
 * 1. המשתמש שלח הודעה ללקוח בטווח של 5 דקות האחרונות, או
 * 2. נשלחו לפחות 2 הודעות אנושיות ברצף על ידי המשתמש
 * @param {string} userId - מזהה המשתמש
 * @param {string} conversationId - מזהה השיחה
 * @param {string} phoneNumber - מספר הטלפון של הלקוח
 * @returns {Promise<boolean>} - האם מתנהלת שיחה אנושית פעילה
 */
const isActiveHumanConversation = async (userId, conversationId, phoneNumber) => {
  try {
    // קבלת ההודעות האחרונות בשיחה
    const messages = await mongodbService.getConversationMessages(userId, conversationId, 10);
    
    if (!messages || messages.length === 0) {
      return false;
    }
    
    // מיון ההודעות לפי זמן, מהחדש לישן
    const sortedMessages = [...messages].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // בדיקה 1: האם נשלחה הודעה אנושית (לא AI) מהמשתמש ב-5 דקות האחרונות
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentHumanMessages = sortedMessages.filter(msg => 
      msg.fromMe && 
      !msg.isAI && 
      new Date(msg.timestamp) > fiveMinutesAgo
    );
    
    if (recentHumanMessages.length > 0) {
      console.log(`Found ${recentHumanMessages.length} recent human messages within last 5 minutes`);
      return true;
    }
    
    // בדיקה 2: האם נשלחו לפחות 2 הודעות אנושיות ברצף
    let consecutiveHumanMessages = 0;
    
    for (const msg of sortedMessages) {
      if (msg.fromMe && !msg.isAI) {
        consecutiveHumanMessages++;
        if (consecutiveHumanMessages >= 2) {
          console.log('Found at least 2 consecutive human messages');
          return true;
        }
      } else {
        // נפסק הרצף של הודעות אנושיות
        break;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking for active human conversation: ${error.message}`);
    // במקרה של שגיאה, נחזיר שאין שיחה אנושית פעילה
    return false;
  }
};

/**
 * בדיקת סטטוס חיבור WhatsApp של משתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Object>} - סטטוס החיבור
 */
const checkStatus = async (userId) => {
  try {
    // בדיקה אם קיים לקוח למשתמש זה
    if (clients.has(userId)) {
      const clientInfo = clients.get(userId);
      
      return { 
        success: true, 
        status: clientInfo.status.toLowerCase()
      };
    }
    
    // במצב פיתוח, אם אין לקוח פעיל, נחזיר סטטוס מנותק
    if (process.env.NODE_ENV === 'development') {
      console.log(`Development mode: No active client for user ${userId}. Returning disconnected status.`);
      return { 
        success: true, 
        status: 'disconnected',
        isDevelopment: true
      };
    }
    
    // אם לא קיים לקוח, בדוק אם יש מידע session ב-MongoDB
    try {
      const connectionInfo = await mongodbService.getWhatsAppSession(userId);
      
      // הפחתת כמות הלוגים - רק לוג אחד כל כמה בקשות
      if (Math.random() < 0.1) { // 10% מהבקשות יציגו לוג
        console.log(`No active client for user ${userId}. Session info from MongoDB:`, 
          connectionInfo ? connectionInfo.status : 'none');
      }
      
      if (connectionInfo && connectionInfo.status === 'connected') {
        console.log(`Session data indicates user ${userId} was previously connected. Will try to reinitialize.`);
        
        // במצב של פער בין המידע במסד הנתונים למצב בפועל, עדכן ל-disconnected
        try {
          await mongodbService.updateWhatsAppStatus(userId, 'disconnected');
        } catch (updateError) {
          console.warn(`Could not update status to disconnected: ${updateError.message}`);
          // נמשיך למרות השגיאה
        }
        
        return { 
          success: true, 
          status: 'disconnected',
          message: 'Previous session found but no active connection. Ready to reconnect.'
        };
      }
      
      // הפחתת כמות הלוגים - רק לוג אחד כל כמה בקשות
      if (Math.random() < 0.1) { // 10% מהבקשות יציגו לוג
        console.log(`No session data found for user ${userId} or status is disconnected`);
      }
      
      return { 
        success: true, 
        status: 'disconnected' 
      };
    } catch (dbError) {
      console.error(`MongoDB error when checking status for user ${userId}:`, dbError);
      
      // במקרה של שגיאת מסד הנתונים, נחזיר סטטוס מנותק כדי לאפשר התחברות מחדש
      return { 
        success: true, 
        status: 'disconnected',
        message: 'Could not retrieve previous session info. Ready to connect.'
      };
        }
      } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    return { 
      success: false, 
      status: 'error',
      error: error.message 
    };
  }
};

/**
 * קבלת קוד QR החדש ביותר של משתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Object>} - מידע על קוד ה-QR
 */
const getQrCode = async (userId) => {
  try {
    // בדיקה אם קיים לקוח למשתמש זה
    if (clients.has(userId)) {
      const clientInfo = clients.get(userId);
      
      // אם הסטטוס הוא מחובר, אין צורך בקוד QR
      if (clientInfo.status === 'CONNECTED') {
        return { 
          success: true, 
          status: 'connected',
          message: 'WhatsApp is already connected'
        };
      }
      
      // אם קיים קוד QR, החזר אותו
      if (clientInfo.qrCode) {
        console.log(`Returning existing QR code for user ${userId}`);
        return { 
          success: true, 
          status: 'initializing',
          qrCode: clientInfo.qrCode 
        };
      }
      
      // אם אין קוד QR אבל יש לקוח בתהליך אתחול, המתן עד 5 שניות לקבלת קוד QR
      if (clientInfo.status === 'INITIALIZING') {
        console.log(`Waiting for QR code generation for user ${userId}...`);
        
        // נמתין עד 5 שניות לקבלת קוד QR
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          // בדיקה אם התקבל קוד QR בינתיים
          if (clientInfo.qrCode) {
            console.log(`QR code generated for user ${userId} after waiting`);
            return { 
              success: true, 
              status: 'initializing',
              qrCode: clientInfo.qrCode 
            };
          }
          
          // אם לקוח התחבר בינתיים
          if (clientInfo.status === 'CONNECTED') {
            return { 
              success: true, 
              status: 'connected',
              message: 'WhatsApp is now connected'
            };
          }
          
          // אם הלקוח נכשל
          if (clientInfo.status === 'ERROR') {
            throw new Error('WhatsApp initialization failed');
          }
          
          // המתנה של 500 מילישניות
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        // אם הגענו לכאן, עדיין אין קוד QR
        console.log(`No QR code generated for user ${userId} after multiple attempts`);
        return { 
          success: false, 
          status: 'initializing',
          message: 'Still waiting for QR code generation. Please try again in a few seconds.'
        };
      }
    }
    
    // אם לא קיים לקוח, יצירת לקוח חדש
    console.log(`No WhatsApp client exists for user ${userId}, creating new client`);
    const initResult = await createClient(userId);
    
    // אם יצירת הלקוח הצליחה, ננסה לקבל את הקוד מיד
    if (initResult.success && clients.has(userId)) {
      const clientInfo = clients.get(userId);
      
      // אם כבר יש קוד QR, נחזיר אותו מיד
      if (clientInfo.qrCode) {
        return { 
          success: true, 
          status: 'initializing',
          qrCode: clientInfo.qrCode 
        };
      }
    }
    
    return { 
      success: true, 
      status: 'initializing',
      message: 'WhatsApp client initializing, waiting for QR code. Please try again in a few seconds.'
    };
      } catch (error) {
    console.error('Error getting QR code:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * שליחת הודעה ל-WhatsApp
 * @param {string} userId - מזהה המשתמש
 * @param {string} chatId - מזהה השיחה
 * @param {string} message - תוכן ההודעה
 * @returns {Promise<Object>} - תוצאת השליחה
 */
const sendMessage = async (userId, chatId, message) => {
  try {
    console.log(`[sendMessage] Sending message for user: ${userId}, to: ${chatId}, message length: ${message.length}`);
    
    // בדיקה אם קיים לקוח למשתמש זה
    if (!clients.has(userId)) {
      return { 
        success: false, 
        error: 'WhatsApp client not connected' 
      };
    }
    
    const clientInfo = clients.get(userId);
    
    // בדיקה אם הלקוח מחובר
    if (clientInfo.status !== 'CONNECTED') {
      return { 
        success: false, 
        error: 'WhatsApp client not ready' 
      };
    }
    
    // קבלת פרטי השיחה מ-MongoDB
    const conversation = await mongodbService.getConversation(userId, chatId);
    
    if (!conversation) {
      return { 
        success: false, 
        error: 'Conversation not found' 
      };
    }
    
    // שליחת ההודעה ל-WhatsApp
    const result = await clientInfo.client.sendMessage(conversation.phoneNumber, message);
    
    // שמירת ההודעה ב-MongoDB
    await mongodbService.saveWhatsAppMessage(userId, chatId, {
      messageId: result.id._serialized,
      body: message,
      fromMe: true,
      timestamp: new Date(),
      type: 'chat',
      hasMedia: false,
      phoneNumber: conversation.phoneNumber
    });
    
    return { 
      success: true, 
      messageId: result.id._serialized 
    };
      } catch (error) {
    console.error('Error sending message:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * ניתוק חיבור WhatsApp למשתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Object>} - סטטוס הניתוק
 */
const disconnect = async (userId) => {
  try {
    console.log(`Attempting to disconnect WhatsApp for user ${userId}`);
    
    if (clients.has(userId)) {
      const clientInfo = clients.get(userId);
      
      try {
        console.log(`Destroying client for user ${userId}`);
        await clientInfo.client.destroy();
        console.log(`Client destroyed successfully for user ${userId}`);
      } catch (error) {
        console.error(`Error destroying client for user ${userId}:`, error);
        // אנחנו ממשיכים בתהליך הניתוק גם במקרה של שגיאה
      }
      
      // מחיקת ה-client מהרשימה
      clients.delete(userId);
      console.log(`Client removed from active clients map for user ${userId}`);
        } else {
      console.log(`No active client found for user ${userId} to disconnect`);
    }
    
    // עדכון סטטוס ב-MongoDB
    await mongodbService.updateWhatsAppStatus(userId, 'disconnected');
    console.log(`Status updated to 'disconnected' in MongoDB for user ${userId}`);
    
    // ניקוי קובצי ה-session אם קיימים
    try {
      const userSessionDir = path.join(process.env.SESSIONS_DIR || './sessions', userId);
      if (fs.existsSync(userSessionDir)) {
        console.log(`Cleaning up session files for user ${userId} at ${userSessionDir}`);
        fs.rmdirSync(userSessionDir, { recursive: true });
        console.log(`Session directory removed for user ${userId}`);
        }
      } catch (error) {
      console.error(`Error cleaning up session files for user ${userId}:`, error);
      // ממשיכים בתהליך הניתוק גם במקרה של שגיאה
    }
    
    return { 
      success: true, 
      message: 'WhatsApp disconnected successfully' 
    };
      } catch (error) {
    console.error('Error during WhatsApp disconnection:', error);
    // למרות השגיאה, ננסה לעדכן את הסטטוס ל-disconnected
    try {
      await mongodbService.updateWhatsAppStatus(userId, 'disconnected');
    } catch (innerError) {
      console.error('Error updating disconnected status to MongoDB:', innerError);
    }
    
    return { 
      success: false, 
      error: error.message 
    };
  }
};

/**
 * ייבוא השיחות האחרונות מוואטסאפ ושמירתן ב-MongoDB
 * @param {string} userId - מזהה המשתמש
 * @param {Object} options - אפשרויות נוספות
 * @param {boolean} options.useRealData - האם להשתמש בנתונים אמיתיים גם במצב פיתוח
 * @param {boolean} options.ignoreAuthErrors - האם להתעלם משגיאות אימות ולהחזיר מידע מדומה במקום
 * @returns {Promise<Object>} - תוצאות הייבוא
 */
const importConversationsFromWhatsApp = async (userId, options = {}) => {
  try {
    const { useRealData = false, ignoreAuthErrors = false } = options;
    
    // יצירת מידע התחלתי על הייבוא
    const importInfo = {
      status: 'starting',
      startTime: Date.now(),
      conversations: [],
      processedCount: 0,
      totalCount: 0,
      currentChatId: null,
      error: null
    };
    
    // שמירת מידע הייבוא במפה הגלובלית
    activeImports.set(userId, importInfo);
    
    // במצב פיתוח, ניתן להשתמש בנתוני דוגמה (אלא אם התבקשו נתונים אמיתיים)
    if (process.env.NODE_ENV === 'development' && !useRealData) {
      // בדיקה אם יש לקוח אמיתי - אם יש נשתמש בו, אחרת נחזיר נתוני דוגמה
      const hasRealClient = clients.has(userId) && 
        (clients.get(userId).status === 'CONNECTED' || clients.get(userId).status === 'connected');
      
      if (!hasRealClient) {
        console.log(`[WhatsApp] Development mode: returning mock conversations for user ${userId}`);
        
        // יצירת נתוני שיחות לדוגמה
        const mockConversations = [];
        const numMockConversations = Math.floor(Math.random() * 5) + 3; // 3-7 שיחות
        
        // דימוי תהליך ייבוא איטי
        importInfo.status = 'importing';
        importInfo.totalCount = numMockConversations;
        
        for (let i = 0; i < numMockConversations; i++) {
          // בדיקה אם הייבוא נעצר
          if (activeImports.has(userId) && activeImports.get(userId).status === 'cancelled') {
            console.log(`[WhatsApp] Import was cancelled for user ${userId}`);
            const cancelResult = {
              success: true,
              message: `ייבוא נעצר. יובאו ${importInfo.processedCount} שיחות מתוך ${importInfo.totalCount}`,
              conversationsCount: importInfo.processedCount,
              conversations: importInfo.conversations,
              isMock: true,
              cancelled: true
            };
            
            // נעדכן את סטטוס הייבוא
            importInfo.status = 'completed';
            importInfo.endTime = Date.now();
            
            return cancelResult;
          }
          
          // המתנה מדומה
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const mockConv = {
            id: `mock-conv-${i}`,
            phoneNumber: `+972-${Math.floor(Math.random() * 900000000) + 100000000}`,
            name: `לקוח לדוגמה ${i + 1}`,
            messagesCount: Math.floor(Math.random() * 15) + 5
          };
          
          mockConversations.push(mockConv);
          importInfo.conversations.push(mockConv);
          importInfo.processedCount++;
          importInfo.currentChatId = mockConv.id;
        }
        
        // עדכון סטטוס הייבוא
        importInfo.status = 'completed';
        importInfo.endTime = Date.now();
        
        return {
          success: true,
          message: `יובאו ${mockConversations.length} שיחות לדוגמה בהצלחה (מצב פיתוח)`,
          conversationsCount: mockConversations.length,
          conversations: mockConversations,
          isMock: true
        };
      }
    }
    
    // בדיקה שהלקוח מחובר
    if (!clients.has(userId)) {
      // עדכון סטטוס הייבוא
      importInfo.status = 'error';
      importInfo.error = 'לא נמצא חיבור וואטסאפ פעיל למשתמש';
      importInfo.endTime = Date.now();
      
      return {
        success: false,
        message: 'לא נמצא חיבור וואטסאפ פעיל למשתמש'
      };
    }

    const clientInfo = clients.get(userId);
    console.log(`Client status for user ${userId}:`, clientInfo.status);
    
    // בדיקה משופרת שמתחשבת גם במקרה של 'CONNECTED' באותיות גדולות
    if (clientInfo.status !== 'CONNECTED' && clientInfo.status !== 'connected') {
      // עדכון סטטוס הייבוא
      importInfo.status = 'error';
      importInfo.error = 'חיבור הוואטסאפ אינו פעיל. נא לסרוק קוד QR ולהתחבר';
      importInfo.endTime = Date.now();
      
      return {
        success: false,
        message: 'חיבור הוואטסאפ אינו פעיל. נא לסרוק קוד QR ולהתחבר'
      };
    }

    const client = clientInfo.client;
    console.log(`Importing conversations for user ${userId}`);

    // עדכון סטטוס הייבוא
    importInfo.status = 'loading_chats';
    
    // ניסיון לקבל שיחות עם המתנה לטעינה
    console.log(`Attempting to get all chats for user ${userId}...`);
    
    // המתנה קצרה לפני בקשת השיחות - לפעמים זה עוזר לוודא שכולן נטענו
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // בדיקה אם הייבוא נעצר
    if (activeImports.has(userId) && activeImports.get(userId).status === 'cancelled') {
      console.log(`[WhatsApp] Import was cancelled for user ${userId} before loading chats`);
      return {
        success: true,
        message: `ייבוא נעצר לפני טעינת השיחות`,
        conversationsCount: 0,
        conversations: [],
        cancelled: true
      };
    }
    
    // קבלת כל השיחות
    let chats = await client.getChats();
    console.log(`Initially received ${chats.length} total chats from WhatsApp Web`);
    
    if (chats.length === 0) {
      // ניסיון נוסף לקבל שיחות - לפעמים הניסיון הראשון נכשל
      console.log(`No chats found on first attempt, waiting and trying again...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // בדיקה אם הייבוא נעצר
      if (activeImports.has(userId) && activeImports.get(userId).status === 'cancelled') {
        console.log(`[WhatsApp] Import was cancelled for user ${userId} during retry`);
        return {
          success: true,
          message: `ייבוא נעצר בזמן ניסיון נוסף לטעינת השיחות`,
          conversationsCount: 0,
          conversations: [],
          cancelled: true
        };
      }
      
      chats = await client.getChats();
      console.log(`Second attempt received ${chats.length} total chats`);
    }
    
    // אם עדיין אין שיחות, ננסה לקבל את הצ'אטים הפרטיות ישירות
    if (chats.length === 0) {
      console.log(`Still no chats, attempting to fetch private chats directly...`);
      try {
        // ניסיון לקבל את כל השיחות הפרטיות - API לא מתועד אבל עשוי לעבוד
        const privateChatsOnly = await client.getPrivateChats();
        chats = privateChatsOnly || [];
        console.log(`Direct private chats query returned ${chats.length} chats`);
      } catch (error) {
        console.log(`Error fetching private chats directly: ${error.message}`);
      }
    }

    // ניקוי רשימת צ'אטים במקרה שיש צ'אטים שאינם תקינים
    const validChats = chats.filter(chat => chat && chat.id && chat.id._serialized);
    console.log(`Found ${validChats.length} valid chats out of ${chats.length} total`);
    
    // סינון שיחות פרטיות (לא קבוצות)
    const nonGroupChats = validChats.filter(chat => !chat.isGroup);
    console.log(`Found ${nonGroupChats.length} non-group chats`);
    
    // בדיקה נוספת למערך ההודעות - לא לסנן צ'אטים שאין להם הודעות כרגע
    const privateChats = nonGroupChats;
    
    console.log(`Proceeding with ${privateChats.length} private chats`);
      
      // עדכון מידע הייבוא
    importInfo.status = 'importing';
    importInfo.totalCount = privateChats.length;

    const importedConversations = [];
    
    // אם אין שיחות בכלל, נחזיר הודעה ספציפית
    if (privateChats.length === 0) {
      console.log(`No private chats found for user ${userId}. This could be due to:
      1. WhatsApp Web connection is new and hasn't loaded chats yet
      2. API limitation in accessing chat history
      3. There are truly no private chats`);
      
      // עדכון סטטוס הייבוא
      importInfo.status = 'completed';
      importInfo.endTime = Date.now();
      
      return {
        success: false,
        message: 'לא נמצאו שיחות וואטסאפ. ייתכן שההתחברות חדשה ועדיין לא נטענו שיחות, או שנתקלנו במגבלה של וואטסאפ ווב.',
        conversationsCount: 0,
        conversations: []
      };
    }
    
    // עיבוד כל שיחה
    for (const chat of privateChats) {
      try {
        // בדיקה אם הייבוא נעצר
        if (activeImports.has(userId) && activeImports.get(userId).status === 'cancelled') {
          console.log(`[WhatsApp] Import was cancelled for user ${userId}`);
          const cancelResult = {
            success: true,
            message: `ייבוא נעצר. יובאו ${importInfo.processedCount} שיחות מתוך ${importInfo.totalCount}`,
            conversationsCount: importInfo.processedCount,
            conversations: importInfo.conversations,
            cancelled: true
          };
          
          // נעדכן את סטטוס הייבוא
          importInfo.status = 'completed';
          importInfo.endTime = Date.now();
          
          return cancelResult;
        }
        
        // עדכון השיחה הנוכחית במידע הייבוא
        if (chat && chat.id && chat.id._serialized) {
          importInfo.currentChatId = chat.id._serialized;
        }
        
        // לוג מידע מפורט על השיחה
        console.log(`Processing chat:`, {
          id: chat.id?._serialized || 'unknown',
          isGroup: chat.isGroup || false,
          hasMessages: chat.messages !== undefined,
          messagesCount: chat.messages?.length || 0,
          name: chat.name || 'unknown'
        });
        
        const contact = await chat.getContact();
        const phoneNumber = chat.id._serialized.split('@')[0];
        const name = contact.name || contact.pushname || null;

        console.log(`Processing chat with ${name || phoneNumber}, contact info:`, {
          name: contact.name || 'none',
          pushname: contact.pushname || 'none',
          number: contact.number || 'none'
        });
        
        // הודעות - נסה לקבל גם אם המערך לא קיים
        let messages = [];
        try {
          if (chat.messages && chat.messages.length > 0) {
            // במקרה שיש מערך הודעות
            const maxMessages = Math.min(chat.messages.length, 100);
            messages = await Promise.all(
              // סינון ההודעות האחרונות
              chat.messages
                .slice(Math.max(0, chat.messages.length - maxMessages))
                .filter(msg => msg && (msg.type === 'chat' || msg.type === 'text'))
                .map(async (msg) => ({
                  messageId: msg.id._serialized,
                  body: msg.body,
                  fromMe: msg.fromMe,
                  timestamp: new Date(msg.timestamp * 1000)
                }))
            );
          } else {
            // ניסיון לקבל הודעות ישירות
            console.log(`No messages in chat array, attempting to fetch messages directly for chat ${chat.id._serialized}`);
          }
        } catch (error) {
          console.error(`Error fetching messages for chat ${chat.id._serialized}:`, error);
        }
        
        // עיבוד השיחה
        let conversation = await mongodbService.getOrCreateConversation(userId, phoneNumber, name);
        
        // עדכון מידע הייבוא
        importInfo.processedCount++;
        importInfo.conversations.push({
          id: conversation.id,
          phoneNumber,
          name,
          messagesCount: messages.length,
          messages
        });
      } catch (error) {
        console.error(`Error processing chat ${chat.id._serialized}:`, error);
        importInfo.error = error.message;
        importInfo.status = 'error';
        importInfo.endTime = Date.now();
        return {
          success: false,
          message: `ייבוא נעצר בזמן טעינת השיחה ${chat.id._serialized}: ${error.message}`,
          conversationsCount: importInfo.processedCount,
          conversations: importInfo.conversations,
          cancelled: true
        };
      }
    }

    // עדכון סטטוס הייבוא
    importInfo.status = 'completed';
    importInfo.endTime = Date.now();
    
    return {
      success: true,
      message: `יובאו ${importInfo.conversations.length} שיחות לדוגמה בהצלחה (מצב פיתוח)`,
      conversationsCount: importInfo.conversations.length,
      conversations: importInfo.conversations
    };
      } catch (error) {
    console.error('Error importing conversations:', error);
    importInfo.error = error.message;
    importInfo.status = 'error';
    importInfo.endTime = Date.now();
    return {
      success: false,
      message: `ייבוא נעצר בזמן טעינת השיחות: ${error.message}`,
      conversationsCount: importInfo.processedCount,
      conversations: importInfo.conversations,
      cancelled: true
    };
  }
};

/**
 * פונקציה לביטול ייבוא שיחות פעיל
 * @param {string} userId - מזהה המשתמש
 * @returns {Object} - תוצאת הביטול
 */
const cancelImport = (userId) => {
  try {
    console.log(`Attempting to cancel import for user ${userId}`);
    
    // בדיקה אם קיים ייבוא פעיל למשתמש
    if (!activeImports.has(userId)) {
      return {
        success: false,
        message: 'לא נמצא ייבוא פעיל לביטול'
      };
    }
    
    // עדכון סטטוס הייבוא לביטול
    const importInfo = activeImports.get(userId);
    importInfo.status = 'cancelled';
    importInfo.endTime = Date.now();
    
    console.log(`Import cancelled for user ${userId}`);
    
    return {
      success: true,
      message: 'ייבוא בוטל בהצלחה',
      importInfo: {
        status: importInfo.status,
        processedCount: importInfo.processedCount,
        totalCount: importInfo.totalCount
      }
    };
      } catch (error) {
    console.error(`Error cancelling import for user ${userId}:`, error);
    return {
      success: false,
      message: `שגיאה בביטול הייבוא: ${error.message}`
    };
  }
};

/**
 * פונקציה לקבלת סטטוס ייבוא שיחות
 * @param {string} userId - מזהה המשתמש
 * @returns {Object} - סטטוס הייבוא
 */
const getImportStatus = (userId) => {
  try {
    // בדיקה אם קיים ייבוא פעיל למשתמש
    if (!activeImports.has(userId)) {
      return {
        success: false,
        message: 'לא נמצא ייבוא פעיל'
      };
    }
    
    // החזרת מידע על הייבוא
    const importInfo = activeImports.get(userId);
    
    return {
      success: true,
      status: importInfo.status,
      startTime: importInfo.startTime,
      endTime: importInfo.endTime,
      processedCount: importInfo.processedCount,
      totalCount: importInfo.totalCount,
      currentChatId: importInfo.currentChatId,
      error: importInfo.error
    };
      } catch (error) {
    console.error(`Error getting import status for user ${userId}:`, error);
    return {
      success: false,
      message: `שגיאה בקבלת סטטוס הייבוא: ${error.message}`
    };
  }
};

/**
 * קבלת שיחות המשתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Array>} - מערך השיחות
 */
const getConversations = async (userId) => {
  return await mongodbService.getConversations(userId);
};

/**
 * קבלת הודעות של שיחה ספציפית
 * @param {string} userId - מזהה המשתמש
 * @param {string} conversationId - מזהה השיחה
 * @returns {Promise<Array>} - מערך ההודעות
 */
const getConversationMessages = async (userId, conversationId) => {
  return await mongodbService.getConversationMessages(userId, conversationId);
};

/**
 * בודק האם לענות להודעה בהתאם להגדרות הבוט
 * @param {string} userId - מזהה המשתמש
 * @param {string} phoneNumber - מספר הטלפון של השולח
 * @returns {Promise<boolean>} - האם לענות להודעה
 */
const shouldRespondToPhone = async (userId, phoneNumber) => {
  try {
    // במצב פיתוח תמיד נענה
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    // קבלת הגדרות הבוט
    const userData = await mongodbService.getUserData(userId);
    if (!userData || !userData.botSettings) {
      // אם אין הגדרות בוט, נענה כברירת מחדל
      return true;
    }

    const botSettings = userData.botSettings;
    
    // ניקוי מספר הטלפון להשוואה (הסרת תחיליות ותווים מיוחדים)
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '').replace(/^0/, '');
    const lastDigits = cleanPhoneNumber.slice(-9); // נלקח 9 ספרות אחרונות לצורך השוואה
    
    // בדיקה אם המספר נמצא ברשימת המורשים
    const isInAllowedList = botSettings.allowedContacts?.some(contact => {
      const contactCleanNumber = contact.phone.replace(/\D/g, '').replace(/^0/, '');
      return contactCleanNumber.includes(lastDigits) || lastDigits.includes(contactCleanNumber);
    }) || false;
    
    // בדיקה אם המספר נמצא ברשימת החסומים
    const isInBlockedList = botSettings.blockedContacts?.some(contact => {
      const contactCleanNumber = contact.phone.replace(/\D/g, '').replace(/^0/, '');
      return contactCleanNumber.includes(lastDigits) || lastDigits.includes(contactCleanNumber);
    }) || false;
    
    // החלטה בהתאם למצב רשימה לבנה/שחורה
    if (botSettings.contactsListMode === 'whitelist') {
      // במצב רשימה לבנה, צריך להיות ברשימת המורשים
      return isInAllowedList;
    } else {
      // במצב רשימה שחורה, צריך לא להיות ברשימת החסומים
      return !isInBlockedList;
    }
  } catch (error) {
    console.error('Error checking if should respond to phone:', error);
    // במקרה של שגיאה, החזר true כברירת מחדל
    return true;
  }
};

// ייצוא הפונקציות
module.exports = {
  initializeWhatsApp,
  createClient,
  checkStatus,
  getQrCode,
  sendMessage,
  disconnect,
  importConversationsFromWhatsApp,
  cancelImport,
  getImportStatus,
  getConversations,
  getConversationMessages,
  shouldRespondToPhone,
  clients,
  activeImports,
  getOrCreateSession,
  handleMessage
};
