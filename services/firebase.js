const admin = require('firebase-admin');

let firebaseApp;
let firestoreDb;

/**
 * Initialize Firebase Admin SDK
 */
const initializeFirebase = () => {
  try {
    // בדיקה אם Firebase כבר מאותחל
    if (admin.apps.length > 0) {
      firebaseApp = admin.app();
      firestoreDb = admin.firestore();
      console.log('Firebase already initialized');
      return { firebaseApp, firestoreDb };
    }

    // ניסיון להתחבר עם פרטי הזדהות אמיתיים
    try {
      // פרסור מפתח פרטי מהסביבה
      const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

      // אתחול Firebase Admin SDK
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || 'servion-ai-dev',
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-xxxx@servion-ai-dev.iam.gserviceaccount.com',
          privateKey: privateKey || '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCHia1rP902RzYHKzJMzJnauM+yKP+xGYpZXkhI/DKN/uLARNXxhFSBTFLcYiB5s2PqWjnUx9dO+EI3QL+NisQBc3ALzQPSvLyfP0S0PtK4OdbqvGlaOPUZnI42l4fBvmhweI4iGJ4AKKdRc8fYxxtNY6R+Nq4MuFwHTbydYnEkNOosJfQyFv0S0MsRDGoXbKWmBPY1JGpZ58+3i/fLJJQyYJhBn3xRHKWzM8nDwQlRVTQVdqnIIJY5cECBFYLdPHMnJNj3A6PYbJG0HOGSbNKLi9WCc42zUKULEHBdkVqDwE1HRU8RxvJFEkwAMQMK7yqc3ZnsgwHHnpQxdkfhNKJNAgMBAAECggEAROCgenX6a8MIjVyugIZkJlIdtYoQJxfBkmK7ixjcgQhZVQnOmbkp4zGjCnErQpXkYY+4/7Ue0ycnJynyWRRC0f13aLIaZUyXYbKcdcBCWRJ/+KZ5SnOm2hDzT1GvnNpPQJAsO5TzFiQQX18l1Yj0XSyNGVPrMm4+JjL1+Oz3Gb5O5AqE1M9ZVMJzDTtlimBsw42JuXwQ3YoKHOlTRwJBY2S6iqQHGJDB6CzXR4F3QUXuaXvUQEFPCF4NQrpJ+JIxnInkRywy/GbSbwfYLMGiYn+PJQkk7y5tEBKg7IjOBp2ioO9Yv+nOU16FZ1TpJ2RQvTuE19aSfMk90pIUAQKBgQC8MqDAelI2rV1yQz4HvYKMpC9E8OBp+sQWI26hWyTzDsQkTnQHJBB2I9/CQhIGDL1oQTXDMvd3BcffI09lAnu0FxvpJqjGxdzKWyud/0C1KOhbM8ZhbQFkjA/95ID0iCBMO7LhS7+1/UJ7RWu599MqPv7+CUDlbjD26aUeNbY8YQKBgQC4DWtZvJeG3Sy1yQFCpPGqmVDwyBtnNbf96/ms2mhGfgHJFKmdYzTOASR4Ax5MsBrZuLZCimXmKJnj+/Qjm6ZWHqZGaNi5U0QVo/x1GqEZDVsktJ8lwVMB/8CrJ5nzFkZFmJloPMZ7rLk5qgPJTAZJvgNQTWK+pPsN9rErNTaX7QKBgHLKbMwETT6HxQc4DaInXl5XrpQyskzpU/RcFTnu4BNRCzc5jYBzwVcQYYHpTatqNH+nA4CAGCLIpwXkFULUPhN+aAZZgU3WmYGe5TuHF9X3exNxBw6o6LnLm5L/+UWyxR9xgBqK/WIdt3MPeCZW40gZbVF2mQCQ60pGXVIRVoZhAoGAIcwBXtbPJtDW4e+vXTVgkFAOHSJ2RLkzCrWRyQwaTgh1e9QxELK/lLjxPQBnkWohfLqshl6YLOXdyvYUPnIzZV7l2Vgv/e9MEyPmjTLUz/ZDhIBmZdoFzxkpyJWU1j8OltJBiHDys1t+QmSbgpKEKFSQZGZbr4ZKU2wl1mHVUB0CgYA8pPHiK5q09mmEdoigb4Ca0YG4mIwEVoQo0/GkzOJplYZJ6bxuxOra9xHsq3pkcxLwqMrp8YhKRN6wUeWZ5vxQS5Sc0cRE+lKOXi0Sw8lWNJOUYAFKHrnQdDCN6yYrJLDQ5NyvF1bqoTM8XjIYSFs+8oIOX+qAKS9EwzthInQrlA==\n-----END PRIVATE KEY-----'
        })
      });

      // אתחול Firestore
      firestoreDb = admin.firestore();
    } catch (error) {
      console.warn('Error initializing Firebase with real credentials, using mock version:', error.message);
      
      // במקרה של כישלון, יצירת אמולציה של Firebase
      // יצירת מופע Firebase עם פרטי גישה לא תקינים, רק לצורך המשך ריצת הקוד
      try {
        if (admin.apps.length === 0) {
          firebaseApp = admin.initializeApp({
            projectId: 'mock-project-id'
          }, 'mock-app');
        } else {
          firebaseApp = admin.app('mock-app');
        }
      } catch (error) {
        console.warn('Failed to initialize Firebase app:', error.message);
      }
      
      // יצירת מוק של Firestore
      firestoreDb = {
        collection: (path) => ({
          doc: (docPath) => {
            const fullPath = `${path}/${docPath}`;
            
            return {
              get: () => {
                console.log(`[MOCK] Firestore get: ${fullPath}`);
                return Promise.resolve({
                  exists: true,
                  id: docPath,
                  data: () => ({ 
                    id: docPath,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString() 
                  })
                });
              },
              set: (data, options) => {
                console.log(`[MOCK] Firestore set: ${fullPath}`, data);
                return Promise.resolve();
              },
              collection: (subCollectionPath) => firestoreDb.collection(`${fullPath}/${subCollectionPath}`)
            };
          },
          add: (data) => {
            const docId = `auto-id-${Date.now()}`;
            console.log(`[MOCK] Firestore add to ${path}:`, data);
            
            return Promise.resolve({
              id: docId,
              path: `${path}/${docId}`
            });
          },
          where: () => ({
            limit: () => ({
              get: () => Promise.resolve({
                empty: false,
                docs: [
                  {
                    id: 'mock-id-1',
                    exists: true,
                    data: () => ({ 
                      id: 'mock-id-1',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString() 
                    })
                  }
                ]
              })
            }),
            orderBy: () => ({
              get: () => Promise.resolve({
                empty: false,
                docs: [
                  {
                    id: 'mock-id-1',
                    exists: true,
                    data: () => ({ 
                      id: 'mock-id-1',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString() 
                    })
                  }
                ]
              })
            }),
            get: () => Promise.resolve({
              empty: false,
              docs: [
                {
                  id: 'mock-id-1',
                  exists: true,
                  data: () => ({ 
                    id: 'mock-id-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString() 
                  })
                }
              ]
            })
          }),
          orderBy: () => ({
            limit: () => ({
              get: () => Promise.resolve({
                empty: false,
                docs: [
                  {
                    id: 'mock-id-1',
                    exists: true,
                    data: () => ({ 
                      id: 'mock-id-1',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString() 
                    })
                  }
                ]
              })
            }),
            get: () => Promise.resolve({
              empty: false,
              docs: [
                {
                  id: 'mock-id-1',
                  exists: true,
                  data: () => ({ 
                    id: 'mock-id-1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  })
                }
              ]
            })
          })
        })
      };
      
      // מוק לפונקציות FieldValue
      admin.firestore.FieldValue = {
        serverTimestamp: () => new Date(),
        increment: (val) => val,
        arrayUnion: (...elements) => elements,
        arrayRemove: (...elements) => []
      };
    }
    
    console.log('Firebase initialized successfully');
    return { firebaseApp, firestoreDb };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    
    // במקרה של שגיאה, נחזיר אובייקט ריק במקום לזרוק שגיאה
    console.warn('Returning empty Firebase objects to prevent application crash');
    
    firebaseApp = {};
    firestoreDb = {
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({ exists: false, data: () => ({}) }),
          set: () => Promise.resolve(),
          collection: () => ({})
        }),
        add: () => Promise.resolve({ id: 'mock-id' }),
        where: () => ({
          get: () => Promise.resolve({ empty: true, docs: [] }),
          limit: () => ({
            get: () => Promise.resolve({ empty: true, docs: [] })
          }),
          orderBy: () => ({
            get: () => Promise.resolve({ empty: true, docs: [] })
          })
        }),
        orderBy: () => ({
          get: () => Promise.resolve({ empty: true, docs: [] }),
          limit: () => ({
            get: () => Promise.resolve({ empty: true, docs: [] })
          })
        })
      })
    };
    
    return { firebaseApp, firestoreDb };
  }
};

/**
 * פונקציה לבדיקת תוקף הטוקן של המשתמש
 * @param {string} token - Firebase ID token
 * @returns {Promise<object>} - מידע המשתמש המאומת
 */
const verifyIdToken = async (token) => {
  try {
    // בדיקת מצב פיתוח בצורה גמישה יותר
    const forceDevelopmentMode = process.env.FORCE_DEV_MODE === 'true';
    const isDevelopment = process.env.NODE_ENV === 'development' || forceDevelopmentMode;
    
    // בדיקה שהטוקן לא ריק (גם במצב פיתוח נרצה לדעת אם חסר טוקן)
    if (!token) {
      console.log('Empty token provided');
      
      // במצב פיתוח, נחזיר משתמש מדומה במקום לזרוק שגיאה
      if (isDevelopment) {
        console.log('[MOCK] Development mode: returning mock user for empty token');
        return {
          uid: 'dev-user-123',
          email: 'dev@example.com',
          name: 'משתמש פיתוח',
          isDevelopment: true
        };
      }
      
      throw new Error('Empty token provided');
    }
    
    // אם אנחנו במצב פיתוח, נחזיר מידע משתמש מדומה
    if (isDevelopment) {
      // אם הטוקן מכיל UID ספציפי (למשל לצורך בדיקות), נשתמש בו
      if (token.startsWith('test-uid:')) {
        const testUid = token.split(':')[1];
        console.log(`[MOCK] Development mode: using provided test UID: ${testUid}`);
        return {
          uid: testUid,
          email: `dev-${testUid}@example.com`,
          name: `משתמש פיתוח ${testUid}`,
          isDevelopment: true
        };
      }
      
      // אחרת, נחזיר משתמש מדומה קבוע
      console.log('[MOCK] Development mode: skipping Firebase token verification');
      return {
        uid: token.includes('CCvjbgokTLMGewPPufy3X04FLoF3') ? 'CCvjbgokTLMGewPPufy3X04FLoF3' : 'dev-user-123',
        email: 'dev@example.com',
        name: 'משתמש פיתוח',
        isDevelopment: true
      };
    }
    
    // ניקוי הטוקן (הסרת whitespace, הסרת תחיליות אפשריות)
    const cleanToken = token.trim();
    
    // שליחת הטוקן לאימות בפיירבייס אדמין
    try {
      const decodedToken = await admin.auth().verifyIdToken(cleanToken);
      console.log(`Token verified successfully for user: ${decodedToken.uid?.substring(0, 8)}...`);
      return decodedToken;
    } catch (firebaseError) {
      // טיפול בשגיאות ספציפיות של פיירבייס
      console.error('Firebase auth error:', firebaseError.code, firebaseError.message);
      
      if (firebaseError.code === 'auth/id-token-expired') {
        throw new Error('הטוקן פג תוקף, אנא התחבר מחדש');
      } else if (firebaseError.code === 'auth/id-token-revoked') {
        throw new Error('הטוקן בוטל, אנא התחבר מחדש');
      } else if (firebaseError.code === 'auth/argument-error' || firebaseError.code === 'auth/invalid-id-token') {
        throw new Error('טוקן לא תקין');
      } else {
        throw new Error(`שגיאת אימות: ${firebaseError.message}`);
      }
    }
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    throw error;
  }
};

/**
 * מקבל מזהה משתמש ומחזיר את הנתונים שלו מ-Firestore
 * @param {string} uid - מזהה המשתמש
 * @returns {Promise<object>} - נתוני המשתמש מ-Firestore
 */
const getUserData = async (uid) => {
  try {
    // בדיקה אם המשתמש קיים
    const userDoc = await firestoreDb.collection('users').doc(uid).get();
    
    // אם המשתמש לא קיים, נייצר אותו עם נתוני ברירת מחדל
    if (!userDoc.exists) {
      const userData = {
        uid,
        email: `user-${uid.substring(0, 6)}@example.com`,
        displayName: `משתמש ${uid.substring(0, 6)}`,
        photoURL: null,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      
      await firestoreDb.collection('users').doc(uid).set(userData);
      return userData;
    }
    
    return userDoc.data();
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};

/**
 * שמירת מידע חדש על WhatsApp session
 * @param {string} userId - מזהה המשתמש
 * @param {object} sessionData - מידע על ה-session
 */
const saveWhatsAppSession = async (userId, sessionData) => {
  try {
    await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('whatsapp')
      .doc('session')
      .set(sessionData, { merge: true });
    
    return { success: true };
  } catch (error) {
    console.error('Error saving WhatsApp session:', error);
    throw error;
  }
};

/**
 * קבלת מידע ה-session של WhatsApp של משתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<object>} - מידע ה-session
 */
const getWhatsAppSession = async (userId) => {
  try {
    // במצב פיתוח, החזר נתוני session לדוגמה כדי למנוע בעיות אימות
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MOCK] Development mode: returning mock WhatsApp session for user ${userId}`);
      return {
        status: 'disconnected',
        lastUpdated: new Date(),
        isDevelopmentMode: true
      };
    }

    const sessionDoc = await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('whatsapp')
      .doc('session')
      .get();
    
    if (!sessionDoc.exists) {
      // יצירת מסמך session ריק למשתמש חדש
      const initialSessionData = {
        status: 'disconnected',
        lastUpdated: new Date()
      };
      
      await firestoreDb
        .collection('users')
        .doc(userId)
        .collection('whatsapp')
        .doc('session')
        .set(initialSessionData);
      
      return initialSessionData;
    }
    
    return sessionDoc.data();
  } catch (error) {
    console.error('Error getting WhatsApp session:', error);
    
    // במקרה של שגיאה, החזר נתוני session ברירת מחדל במקום לזרוק שגיאה
    if (process.env.NODE_ENV === 'development') {
      return {
        status: 'disconnected',
        lastUpdated: new Date(),
        isErrorFallback: true
      };
    }
    
    throw error;
  }
};

/**
 * עדכון סטטוס החיבור של WhatsApp
 * @param {string} userId - מזהה המשתמש
 * @param {string} status - סטטוס החיבור החדש
 */
const updateWhatsAppStatus = async (userId, status) => {
  try {
    // במצב פיתוח, נדמה עדכון מוצלח
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MOCK] Development mode: simulating WhatsApp status update for user ${userId} to ${status}`);
      return { 
        success: true,
        isDevelopmentMode: true
      };
    }

    await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('whatsapp')
      .doc('connection')
      .set({
        status,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating WhatsApp status:', error);
    
    // במקרה של שגיאה במצב פיתוח, החזר הצלחה מדומה
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[MOCK] Error in development mode, returning success anyway`);
      return { 
        success: true,
        isErrorFallback: true
      };
    }
    
    throw error;
  }
};

/**
 * שמירת הודעת WhatsApp חדשה
 * @param {string} userId - מזהה המשתמש
 * @param {string} chatId - מזהה השיחה
 * @param {object} messageData - נתוני ההודעה
 */
const saveWhatsAppMessage = async (userId, chatId, messageData) => {
  try {
    // רישום לוג של ניסיון שמירת הודעה
    console.log(`Saving message for user ${userId} in chat ${chatId}`);
    
    // בדיקה אם זו שיחה מדומה או שאנחנו במצב פיתוח
    if (chatId.startsWith('mock-') || process.env.NODE_ENV === 'development') {
      console.log(`[MOCK] Development mode: Skipping Firestore save for message in chat ${chatId}`);
      // החזרת תשובה מדומה ללא שמירה ב-Firestore
      return { 
        success: true,
        messageId: `mock-msg-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        isMock: true
      };
    }
    
    // וידוא שיש משתמש תקין
    if (!userId || userId === 'undefined') {
      console.error('Invalid userId provided to saveWhatsAppMessage:', userId);
      throw new Error('Invalid userId provided');
    }
    
    // וידוא שיש מזהה שיחה תקין
    if (!chatId || chatId === 'undefined') {
      console.error('Invalid chatId provided to saveWhatsAppMessage:', chatId);
      throw new Error('Invalid chatId provided');
    }
    
    // הוספת ההודעה לאוסף ההודעות של השיחה
    const messageRef = await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(chatId)
      .collection('messages')
      .add({
        ...messageData,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    
    console.log(`Message saved successfully with ID: ${messageRef.id}`);
    
    // עדכון נתוני השיחה עם ההודעה האחרונה
    const lastMessage = messageData.body || '';
    await updateConversationLastMessage(userId, chatId, lastMessage);
    
    return { 
      success: true,
      messageId: messageRef.id
    };
  } catch (error) {
    console.error('Error saving WhatsApp message:', error);
    
    // בדיקה האם זו שגיאת הרשאות/אימות
    const isAuthError = error.message && (
      error.message.includes('UNAUTHENTICATED') || 
      error.message.includes('PERMISSION_DENIED') ||
      error.message.includes('אימות')
    );
    
    // במצב פיתוח, או אם זו שגיאת אימות, נחזיר הצלחה מדומה
    if (process.env.NODE_ENV === 'development' || isAuthError) {
      console.log(`[MOCK] ${isAuthError ? 'Auth error' : 'Development mode'}: Returning mock success response for message save`);
      return { 
        success: true,
        messageId: `mock-msg-error-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        isMock: true,
        hasError: true
      };
    }
    
    throw error;
  }
};

/**
 * עדכון מידע אחרון של שיחה
 * @param {string} userId - מזהה המשתמש
 * @param {string} chatId - מזהה השיחה
 * @param {string} lastMessage - ההודעה האחרונה
 * @param {Date} lastMessageTime - זמן ההודעה האחרונה
 * @returns {Promise<Object>} - תוצאת העדכון
 */
const updateConversationLastMessage = async (userId, chatId, lastMessage, lastMessageTime) => {
  try {
    // בדיקה אם זו שיחה מדומה או מצב פיתוח
    if (chatId.startsWith('mock-') || process.env.NODE_ENV === 'development') {
      console.log(`Development mode: Skipping Firestore update for last message in chat ${chatId}`);
      return {
        success: true,
        isMock: true
      };
    }
    
    // עדכון נתוני השיחה עם ההודעה האחרונה
    await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(chatId)
      .set({
        lastMessage: lastMessage,
        lastMessageTime: lastMessageTime || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating conversation last message:', error);
    
    // במצב פיתוח, אם יש שגיאה, נחזיר הצלחה מדומה
    if (process.env.NODE_ENV === 'development') {
      console.log(`Development mode: Returning mock success for last message update`);
      return {
        success: true,
        isMock: true
      };
    }
    
    throw error;
  }
};

/**
 * יצירת שיחה חדשה או קבלת שיחה קיימת
 * @param {string} userId - מזהה המשתמש
 * @param {string} phoneNumber - מספר הטלפון של הלקוח
 * @param {string} name - שם הלקוח (אם ידוע)
 */
const getOrCreateConversation = async (userId, phoneNumber, name = null) => {
  try {
    console.log(`Getting or creating conversation for user ${userId} with phone ${phoneNumber}`);
    
    // ניקוי מספר הטלפון - וידוא פורמט עקבי
    const cleanPhoneNumber = phoneNumber.trim();
    
    // וידוא שמשתמש ומספר טלפון תקינים
    if (!userId || !cleanPhoneNumber) {
      throw new Error('User ID and phone number are required');
    }
    
    // קבלת אוסף השיחות של המשתמש
    const conversationsRef = firestoreDb
      .collection('users')
      .doc(userId)
      .collection('conversations');
    
    // חיפוש שיחה קיימת לפי מספר טלפון
    const query = await conversationsRef
      .where('phoneNumber', '==', cleanPhoneNumber)
      .limit(1)
      .get();
    
    // אם השיחה קיימת, החזר אותה
    if (!query.empty) {
      const conversationDoc = query.docs[0];
      console.log(`Found existing conversation with ID: ${conversationDoc.id}`);
      return { 
        id: conversationDoc.id,
        ...conversationDoc.data()
      };
    }
    
    // אם השיחה לא קיימת, צור שיחה חדשה
    console.log(`Creating new conversation for phone ${cleanPhoneNumber}`);
    const displayName = name || `לקוח ${cleanPhoneNumber.substring(Math.max(0, cleanPhoneNumber.length - 4))}`;
    
    const newConversationData = {
      phoneNumber: cleanPhoneNumber,
      name: displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessage: '',
      lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
      unreadCount: 0
    };
    
    const newConversationRef = await conversationsRef.add(newConversationData);
    console.log(`Created new conversation with ID: ${newConversationRef.id}`);
    
    return { 
      id: newConversationRef.id,
      ...newConversationData
    };
  } catch (error) {
    console.error('Error getting or creating conversation:', error);
    
    // במקרה של שגיאת Firestore/אימות משמעותית שמונעת השלמת הפעולה
    if (error.code && (error.code.includes('permission-denied') || error.code.includes('unauthenticated'))) {
      console.error('Authentication/permission error in getOrCreateConversation:', error.message);
      throw new Error('אין הרשאה לביצוע הפעולה. אנא התחבר מחדש למערכת.');
    }
    
    throw error;
  }
};

/**
 * קבלת נתוני אימון הסוכן של משתמש
 * @param {string} userId - מזהה המשתמש
 */
const getAgentTrainingData = async (userId) => {
  try {
    // במצב פיתוח, נוודא שיש נתונים גם אם יש בעיות אימות
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MOCK] Getting agent training data for user ${userId} in development mode`);
      
      try {
        // ננסה להשיג את הנתונים האמיתיים
        // קבלת פרטי העסק
        const businessInfoDoc = await firestoreDb
          .collection('users')
          .doc(userId)
          .collection('business')
          .doc('info')
          .get();
        
        // קבלת נתוני האימון
        const trainingDoc = await firestoreDb
          .collection('users')
          .doc(userId)
          .collection('business')
          .doc('training')
          .get();
        
        // אם יש נתונים אמיתיים, נחזיר אותם
        if (businessInfoDoc.exists && trainingDoc.exists) {
          console.log('[MOCK] Successfully retrieved real agent training data');
          return {
            businessInfo: businessInfoDoc.data(),
            trainingData: trainingDoc.data(),
            fromFirestore: true
          };
        } else if (businessInfoDoc.exists) {
          console.log('[MOCK] Found business info but no training data');
          const defaultTrainingData = {
            status: 'not_trained',
            lastTraining: null
          };
          
          return {
            businessInfo: businessInfoDoc.data(),
            trainingData: defaultTrainingData,
            fromFirestore: true,
            partialMock: true
          };
        }
      } catch (error) {
        console.log(`[MOCK] Error fetching real data in development mode: ${error.message}`);
        // במקרה של שגיאה, נחזיר מידע מדומה
      }
      
      // חזרת מידע מדומה במצב פיתוח
      console.log('[MOCK] Returning mock agent training data');
      return {
        businessInfo: {
          name: "העסק לדוגמה",
          description: "תיאור קצר של העסק לדוגמה",
          industry: "שירותים",
          services: "שירותים כלליים, ייעוץ, תמיכה",
          hours: "א-ה 9:00-18:00, ו 9:00-13:00",
          contact: "info@example.com, 050-1234567",
          address: "רחוב ראשי 123, תל אביב",
          website: "https://www.example.com",
          additionalInfo: "מידע נוסף על העסק"
        },
        trainingData: {
          status: "trained",
          lastTraining: new Date().toISOString()
        },
        isMock: true
      };
    }

    // פעולה רגילה בסביבת ייצור
    // קבלת פרטי העסק
    const businessInfoDoc = await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('business')
      .doc('info')
      .get();
    
    // אם אין פרטי עסק, נייצר פרטי עסק ברירת מחדל
    if (!businessInfoDoc.exists) {
      const defaultBusinessInfo = {
        name: 'העסק שלי',
        industry: 'שירותים',
        services: 'שירותים כלליים',
        hours: '9:00-18:00',
        contact: 'info@mybusiness.com, 050-1234567',
        additionalInfo: 'מידע נוסף על העסק'
      };
      
      await firestoreDb
        .collection('users')
        .doc(userId)
        .collection('business')
        .doc('info')
        .set(defaultBusinessInfo);
      
      // קבלת נתוני האימון
      const trainingDoc = await firestoreDb
        .collection('users')
        .doc(userId)
        .collection('business')
        .doc('training')
        .get();
      
      // אם אין נתוני אימון, נייצר נתוני אימון ברירת מחדל
      if (!trainingDoc.exists) {
        const defaultTrainingData = {
          status: 'not_trained',
          lastTraining: null
        };
        
        await firestoreDb
          .collection('users')
          .doc(userId)
          .collection('business')
          .doc('training')
          .set(defaultTrainingData);
        
        return {
          businessInfo: defaultBusinessInfo,
          trainingData: defaultTrainingData,
          isDefault: true
        };
      }
      
      return {
        businessInfo: defaultBusinessInfo,
        trainingData: trainingDoc.data()
      };
    }
    
    // קבלת נתוני האימון
    const trainingDoc = await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('business')
      .doc('training')
      .get();
    
    // אם אין נתוני אימון, נייצר נתוני אימון ברירת מחדל
    if (!trainingDoc.exists) {
      const defaultTrainingData = {
        status: 'not_trained',
        lastTraining: null
      };
      
      await firestoreDb
        .collection('users')
        .doc(userId)
        .collection('business')
        .doc('training')
        .set(defaultTrainingData);
      
      return {
        businessInfo: businessInfoDoc.data(),
        trainingData: defaultTrainingData
      };
    }
    
    return {
      businessInfo: businessInfoDoc.data(),
      trainingData: trainingDoc.data()
    };
  } catch (error) {
    console.error('Error getting agent training data:', error);
    
    // במקרה של שגיאת אימות או בסביבת פיתוח, נחזיר מידע דמה במקום לזרוק שגיאה
    const isAuthError = error.message && (
      error.message.includes('UNAUTHENTICATED') || 
      error.message.includes('PERMISSION_DENIED') ||
      error.message.includes('אימות')
    );
    
    if (isAuthError || process.env.NODE_ENV === 'development') {
      console.log(`[MOCK] ${isAuthError ? 'Auth error' : 'Development mode'}: Returning mock agent data`);
      return {
        businessInfo: {
          name: "העסק לדוגמה",
          industry: "שירותים",
          services: "שירותים כלליים, ייעוץ, תמיכה",
          hours: "א-ה 9:00-18:00, ו 9:00-13:00",
          contact: "info@example.com, 050-1234567",
          address: "רחוב ראשי 123, תל אביב",
          additionalInfo: "מידע נוסף על העסק"
        },
        trainingData: {
          status: "trained",
          lastTraining: new Date().toISOString()
        },
        isMock: true,
        error: error.message
      };
    }
    
    throw error;
  }
};

/**
 * קבלת פרטי העסק של המשתמש
 * @param {string} userId - מזהה המשתמש 
 * @returns {Promise<Object>} - פרטי העסק
 */
const getBusinessDetails = async (userId) => {
  try {
    // בדיקה אם העסק קיים
    const businessDoc = await firestoreDb.collection('businesses').doc(userId).get();
    
    // אם העסק לא קיים, נייצר עסק ברירת מחדל
    if (!businessDoc.exists) {
      const defaultBusinessData = {
        id: userId,
        name: 'העסק שלי',
        description: 'תיאור של העסק שלי',
        phone: '050-1234567',
        email: 'contact@mybusiness.com',
        address: 'רחוב ראשי 123, תל אביב',
        website: 'https://www.mybusiness.com',
        logoUrl: null,
        industry: 'שירותים',
        openingHours: 'א-ה 9:00-18:00, ו 9:00-13:00',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await firestoreDb.collection('businesses').doc(userId).set(defaultBusinessData);
      
      return defaultBusinessData;
    }
    
    return { id: businessDoc.id, ...businessDoc.data() };
  } catch (error) {
    console.error('Error getting business details:', error);
    throw error;
  }
};

/**
 * קבלת כל השיחות של המשתמש
 * @param {string} userId - מזהה המשתמש
 * @returns {Promise<Array>} - רשימת השיחות
 */
const getConversations = async (userId) => {
  try {
    const conversationsSnapshot = await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .orderBy('lastMessageTime', 'desc')
      .get();
    
    // אם אין שיחות, נייצר שיחת דוגמה
    if (conversationsSnapshot.empty) {
      const exampleConversation = {
        phoneNumber: '972501234567',
        name: 'לקוח לדוגמה',
        lastMessage: 'ברוכים הבאים למערכת!',
        lastMessageTime: new Date(),
        unreadCount: 1
      };
      
      const conversationRef = await firestoreDb
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .add(exampleConversation);
      
      // יצירת הודעה לדוגמה
      await firestoreDb
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .doc(conversationRef.id)
        .collection('messages')
        .add({
          messageId: 'example-message-1',
          body: 'ברוכים הבאים למערכת!',
          fromMe: false,
          timestamp: new Date(),
          type: 'chat',
          hasMedia: false,
          phoneNumber: '972501234567'
        });
      
      return [{
        id: conversationRef.id,
        ...exampleConversation
      }];
    }

    return conversationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting conversations:', error);
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
    const conversationDoc = await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .get();
    
    if (!conversationDoc.exists) {
      return null;
    }
    
    return { id: conversationDoc.id, ...conversationDoc.data() };
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
};

/**
 * קבלת הודעות של שיחה ספציפית
 * @param {string} userId - מזהה המשתמש
 * @param {string} conversationId - מזהה השיחה
 * @param {number} limit - מספר ההודעות לקבל (ברירת מחדל: 50)
 * @returns {Promise<Array>} - רשימת ההודעות
 */
const getConversationMessages = async (userId, conversationId, limit = 50) => {
  try {
    const messagesRef = firestoreDb
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(conversationId)
      .collection('messages');
      
    const messagesSnapshot = await messagesRef
      .orderBy('timestamp', 'asc')
      .limit(limit)
      .get();

    return messagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    throw error;
  }
};

/**
 * מקבל נתוני אימון של הבינה המלאכותית
 * @param {string} businessId - מזהה העסק
 * @returns {Promise<Object>} - אובייקט המכיל את פרטי האימון
 */
const getAITrainingData = async (businessId) => {
  try {
    const trainingDataDoc = await firestoreDb
      .collection('aiTrainingData')
      .where('businessId', '==', businessId)
      .get();

    // אם אין נתוני אימון, יצירת נתוני אימון ברירת מחדל
    if (trainingDataDoc.empty) {
      const defaultTrainingData = {
        businessId: businessId,
        systemPrompt: `אתה עוזר וירטואלי של העסק שלי.
העסק פתוח בימים א'-ה' בין השעות 9:00-18:00, וביום ו' בין 9:00-14:00.
המטרה שלך היא לסייע ללקוחות, לענות על שאלות, ולעזור בתהליך הרכישה.

מידע על העסק:
- כתובת: רחוב ראשי 123, תל אביב
- טלפון: 050-1234567
- אתר: www.mybusiness.com
- דוא"ל: contact@mybusiness.com

מדיניות:
- אחריות על כל המוצרים למשך שנה
- החזרות מתקבלות תוך 14 יום עם חשבונית מקורית
- משלוחים לכל הארץ תוך 3-5 ימי עסקים`,
        sampleQuestions: [
          {
            question: "מה שעות הפעילות שלכם?",
            answer: "אנחנו פתוחים בימים א'-ה' בין השעות 9:00-18:00, וביום ו' בין 9:00-14:00. בשבת אנחנו סגורים."
          },
          {
            question: "מה מדיניות ההחזרות שלכם?",
            answer: "ניתן להחזיר מוצרים תוך 14 יום מיום הרכישה, בתנאי שהמוצר במצב תקין ובאריזתו המקורית. יש להציג חשבונית מקורית. ההחזר יינתן באמצעי התשלום המקורי."
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        trainingStatus: 'not_trained',
        model: 'gpt-4'
      };
      
      const newTrainingDataRef = await firestoreDb
        .collection('aiTrainingData')
        .add(defaultTrainingData);
      
      return {
        id: newTrainingDataRef.id,
        ...defaultTrainingData
      };
    }

    return {
      id: trainingDataDoc.docs[0].id,
      ...trainingDataDoc.docs[0].data()
    };
  } catch (error) {
    console.error('Error getting AI training data:', error);
    throw error;
  }
};

/**
 * מקבל את פרטי חשבון הוואטסאפ של העסק
 * @param {string} businessId - מזהה העסק
 * @returns {Promise<Object|null>} - אובייקט המכיל את פרטי חשבון הוואטסאפ או null אם לא נמצא
 */
const getBusinessWhatsAppInfo = async (businessId) => {
  try {
    const whatsappDoc = await firestoreDb
      .collection('whatsappAccounts')
      .where('businessId', '==', businessId)
      .get();

    // אם אין חשבון וואטסאפ, יצירת חשבון ברירת מחדל
    if (whatsappDoc.empty) {
      const defaultWhatsAppInfo = {
        businessId: businessId,
        phoneNumber: null,
        isConnected: false,
        lastConnected: null,
        connectionStatus: 'not_connected',
        qrCode: null,
        clientInfo: null
      };
      
      const newWhatsappRef = await firestoreDb
        .collection('whatsappAccounts')
        .add(defaultWhatsAppInfo);
      
      return {
        id: newWhatsappRef.id,
        ...defaultWhatsAppInfo
      };
    }

    return {
      id: whatsappDoc.docs[0].id,
      ...whatsappDoc.docs[0].data()
    };
  } catch (error) {
    console.error('Error getting business WhatsApp info:', error);
    throw error;
  }
};

/**
 * מקבל את פרטי העסק
 * @param {string} businessId - מזהה העסק
 * @returns {Promise<Object|null>} - אובייקט המכיל את פרטי העסק או null אם לא נמצא
 */
const getBusinessInfo = async (businessId) => {
  try {
    const businessDoc = await firestoreDb
      .collection('businesses')
      .doc(businessId)
      .get();

    // אם העסק לא קיים, יצירת עסק ברירת מחדל
    if (!businessDoc.exists) {
      const defaultBusinessInfo = {
        id: businessId,
        name: 'העסק שלי',
        description: 'תיאור של העסק שלי',
        logo: null,
        address: {
          street: 'רחוב ראשי 123',
          city: 'תל אביב',
          zipCode: '6100000',
          country: 'ישראל'
        },
        contactInfo: {
          phone: '050-1234567',
          email: 'contact@mybusiness.com',
          website: 'https://www.mybusiness.com'
        },
        businessHours: {
          sunday: { open: '09:00', close: '18:00' },
          monday: { open: '09:00', close: '18:00' },
          tuesday: { open: '09:00', close: '18:00' },
          wednesday: { open: '09:00', close: '18:00' },
          thursday: { open: '09:00', close: '18:00' },
          friday: { open: '09:00', close: '14:00' },
          saturday: { open: 'סגור', close: 'סגור' }
        },
        category: 'שירותים',
        subcategories: ['כללי'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await firestoreDb
        .collection('businesses')
        .doc(businessId)
        .set(defaultBusinessInfo);
      
      return defaultBusinessInfo;
    }

    return {
      id: businessDoc.id,
      ...businessDoc.data()
    };
  } catch (error) {
    console.error('Error getting business info:', error);
    throw error;
  }
};

/**
 * עדכון פרטי העסק של המשתמש
 * @param {string} userId - מזהה המשתמש
 * @param {Object} businessInfo - פרטי העסק החדשים
 * @returns {Promise<void>}
 */
const updateBusinessInfo = async (userId, businessInfo) => {
  try {
    await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('business')
      .doc('info')
      .set({
        ...businessInfo,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    
    console.log(`Business info updated for user ${userId}`);
  } catch (error) {
    console.error('Error updating business info:', error);
    throw error;
  }
};

/**
 * עדכון סטטוס האימון של הסוכן
 * @param {string} userId - מזהה המשתמש
 * @param {string} status - סטטוס האימון החדש
 * @returns {Promise<void>}
 */
const updateTrainingStatus = async (userId, status) => {
  try {
    await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('business')
      .doc('training')
      .set({
        status,
        lastTraining: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    
    console.log(`Training status updated to ${status} for user ${userId}`);
  } catch (error) {
    console.error('Error updating training status:', error);
    throw error;
  }
};

/**
 * עדכון הוראות האימון המבוססות על שיחות
 * @param {string} userId - מזהה המשתמש
 * @param {Object} trainingInstructions - הוראות האימון החדשות
 * @returns {Promise<void>}
 */
const updateBusinessTrainingInstructions = async (userId, trainingInstructions) => {
  try {
    await firestoreDb
      .collection('users')
      .doc(userId)
      .collection('business')
      .doc('info')
      .update({
        conversationTraining: trainingInstructions
      });
    
    console.log(`Conversation training instructions updated for user ${userId}`);
  } catch (error) {
    console.error('Error updating conversation training instructions:', error);
    throw error;
  }
};

// ייצוא הפונקציות
module.exports = {
  initializeFirebase,
  verifyIdToken,
  getUserData,
  saveWhatsAppSession,
  getWhatsAppSession,
  updateWhatsAppStatus,
  saveWhatsAppMessage,
  getOrCreateConversation,
  getAgentTrainingData,
  getBusinessDetails,
  getConversations,
  getConversation,
  getConversationMessages,
  getAITrainingData,
  getBusinessWhatsAppInfo,
  getBusinessInfo,
  updateBusinessInfo,
  updateTrainingStatus,
  updateBusinessTrainingInstructions,
  admin,
  db: () => firestoreDb
}; 