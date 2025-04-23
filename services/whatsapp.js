const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode_terminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const mongodbService = require('./mongodb');
const openaiService = require('./openai');

// מאגר של חיבורי WhatsApp פעילים
const clients = new Map();

// שמירת בקשות אחרונות לפי משתמש (לטובת מניעת עומס)
const lastRequests = new Map();

// מיפוי לשמירת מידע על ייבואים פעילים לפי משתמש
const activeImports = new Map();

/**
 * אתחול מערכת ה-WhatsApp והרשמה לאירועים
 * @param {Object} io - מופע Socket.IO server
 */
const initializeWhatsApp = (io) => {
  // טיפול באירועי Socket.IO
  io.on('connection', (socket) => {
    console.log('New client connected to WhatsApp service:', socket.id);

    // אירוע התנתקות
    socket.on('disconnect', () => {
      console.log('Client disconnected from WhatsApp service:', socket.id);
    });
  });

  console.log('WhatsApp service initialized');
};

/**
 * יצירת לקוח WhatsApp חדש למשתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Object>} - מידע על החיבור
 */
const createClient = async (userId) => {
  try {
    // בדיקה אם כבר קיים לקוח למשתמש זה
    if (clients.has(userId)) {
      const existingClient = clients.get(userId);
      
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
        await existingClient.client.destroy();
      } catch (error) {
        console.error('Error destroying existing client:', error);
      }
      
      // הסרת הלקוח מהמאגר
      clients.delete(userId);
    }
    
    // יצירת תיקיית session אם לא קיימת
    const sessionDir = path.join(process.env.SESSIONS_DIR || './sessions', userId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    } else {
      console.log(`Using existing session directory: ${sessionDir}`);
    }
    
    // תצורה של puppeteer לעבודה אופטימלית - headless: "new" הוא המצב המודרני המומלץ
    const puppeteerConfig = {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // משפר את היציבות במערכות מסוימות
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-features=site-per-process', // יכול להקטין צריכת זיכרון
        '--disable-translate',
        '--disable-sync',
        '--metrics-recording-only',
        '--disable-browser-side-navigation'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1280, height: 800 } // גודל חלון גדול יותר לנוחות
    };

    // יצירת לקוח WhatsApp חדש
    const client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: userId,
        dataPath: process.env.SESSIONS_DIR || './sessions'
      }),
      puppeteer: puppeteerConfig,
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2332.15.html'
      },
      webVersion: '2.2332.15' // ספק גרסה ספציפית לשיפור היציבות
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
    
    // אירוע קבלת קוד QR
    client.on('qr', async (qr) => {
      // הצגת קוד QR במסוף
      console.log('======================================');
      console.log(`QR Code received for user: ${userId}`);
      console.log('======================================');
      qrcode_terminal.generate(qr, { small: true });
      
      // יצירת QR code כתמונה
      try {
        // שמירת קוד ה-QR המקורי 
        clientInfo.rawQrCode = qr;
        
        // יצירת תמונת QR באיכות גבוהה
        // במקום לשמור את כל הקוד כ-data URL, נשמור רק את הערך עצמו
        // זה יקטין את גודל הקוד שצריך להיות מוצג
        if (qr.length > 1000 && process.env.NODE_ENV === 'development') {
          // במצב פיתוח נשתמש בקוד קצר יותר
          console.log('QR code is too long, generating a simpler one for development');
          const qrDataURL = await qrcode.toDataURL('https://servionai.com/connect-whatsapp', {
            errorCorrectionLevel: 'H',
            margin: 4,
            scale: 16,
            width: 1000,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          clientInfo.qrCode = qrDataURL;
        } else {
          // יצירת תמונת QR באיכות גבוהה
          const qrDataURL = await qrcode.toDataURL(qr, {
            errorCorrectionLevel: 'H',
            margin: 4,
            scale: 16,
            width: 1000,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          clientInfo.qrCode = qrDataURL;
        }
        
        clientInfo.status = 'INITIALIZING';
        
        // עדכון סטטוס החיבור ב-MongoDB
        mongodbService.updateWhatsAppStatus(userId, 'connecting');
      } catch (qrError) {
        console.error('Error generating QR image:', qrError);
        // במקרה של שגיאה, נשתמש בקוד המקורי
        clientInfo.qrCode = qr;
        clientInfo.status = 'INITIALIZING';
      }
    });
    
    // אירוע אימות מוצלח
    client.on('authenticated', () => {
      console.log(`Client ${userId} authenticated successfully`);
      clientInfo.status = 'AUTHENTICATED';
    });
    
    // אירוע מוכן לשימוש
    client.on('ready', async () => {
      console.log(`Client ${userId} is ready and connected`);
      clientInfo.status = 'CONNECTED';
      
      // עדכון סטטוס החיבור ב-MongoDB
      await mongodbService.updateWhatsAppStatus(userId, 'connected');
      
      // נקה את קוד ה-QR כי כבר לא צריך אותו
      clientInfo.qrCode = null;
      
      // נקבל מידע על המשתמש המחובר
      try {
        const info = await client.getState();
        console.log(`Connected WhatsApp state: ${info}`);
        
        // נסיון לקבל מידע על הטלפון המחובר
        try {
          const phoneInfo = await client.getWid();
          console.log(`Connected phone number: ${phoneInfo}`);
        } catch (err) {
          console.log('Could not get phone info:', err.message);
        }
      } catch (err) {
        console.log('Could not get state info:', err.message);
      }
    });
    
    // אירוע ניתוק
    client.on('disconnected', async (reason) => {
      console.log(`Client ${userId} disconnected. Reason:`, reason);
      clientInfo.status = 'DISCONNECTED';
      
      // עדכון סטטוס החיבור ב-MongoDB
      await mongodbService.updateWhatsAppStatus(userId, 'disconnected');
      
      // הסרת הלקוח מהמאגר
      clients.delete(userId);
    });
    
    // אירוע קבלת הודעה
    client.on('message', async (message) => {
      try {
        if (message.fromMe) return; // התעלם מהודעות שנשלחו על ידי המשתמש
        const isGroup = message.from.endsWith('@g.us');
        if(isGroup) return;//התעלם מהודעות בקבוצות
        console.log(`New message for ${userId} from ${message.from}:`, message.body);
        
        // טיפול בהודעה נכנסת
        await handleIncomingMessage(userId, message);
      } catch (error) {
        console.error('Error handling incoming message:', error);
      }
    });
    
    // אתחול הלקוח עם טיפול בשגיאות
    console.log(`Initializing WhatsApp client for user ${userId}`);
    client.initialize()
      .then(() => console.log(`Client initialized for ${userId}`))
      .catch((error) => {
        console.error(`Error initializing client for ${userId}:`, error);
        clientInfo.status = 'ERROR';
        clients.delete(userId);
      });
    
    // החזרת מידע על החיבור
    return { 
      success: true, 
      status: 'INITIALIZING',
      message: 'WhatsApp client initializing, waiting for QR code'
    };
  } catch (error) {
    console.error('Error creating WhatsApp client:', error);
    throw error;
  }
};

/**
 * טיפול בהודעה נכנסת
 * @param {string} userId - מזהה המשתמש
 * @param {Object} message - אובייקט ההודעה מ-whatsapp-web.js
 */
const handleIncomingMessage = async (userId, message) => {
  try {
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
        aiResponse = await openaiService.getAIResponse(message.body, [], agentData);
        console.log(`Received AI response for user ${userId}`);
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
    const conversationDoc = await mongodbService.db()
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(chatId)
      .get();
    
    if (!conversationDoc.exists) {
      return { 
        success: false, 
        error: 'Conversation not found' 
      };
    }
    
    const conversation = conversationDoc.data();
    
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
    
    // אם עדיין אין שיחות, ננסה לקבל את הצ'אטים הפרטיים ישירות
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
  activeImports
};
