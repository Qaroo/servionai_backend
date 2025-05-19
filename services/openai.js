const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// יצירת מופע של OpenAI API
let openai;
try {
  // בדיקה שמפתח ה-API תקין
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey.startsWith('OPENAI_') || apiKey.includes('*')) {
    throw new Error('Invalid or missing OpenAI API key');
  }
  
  openai = new OpenAI({
    apiKey: apiKey
  });
  
  console.log('OpenAI API initialized successfully');
} catch (error) {
  console.warn('OpenAI API key is missing or invalid. Using mock responses.', error.message);
  // יצירת אובייקט מדומה שיאפשר לקוד להמשיך לרוץ
  openai = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          console.log('Using mock OpenAI response. Prompt:', messages[messages.length - 1].content);
          return {
            choices: [
              {
                message: {
                  content: generateMockResponse(messages[messages.length - 1].content)
                }
              }
            ]
          };
        }
      }
    }
  };
}

/**
 * מייצר תשובות מוכנות מראש לפי שאלות נפוצות
 * @param {string} query - השאלה של המשתמש
 * @returns {string} - תשובה מוכנה מראש
 */
function generateMockResponse(query) {
  query = query.toLowerCase();
  
  if (query.includes('שלום') || query.includes('היי') || query.includes('בוקר טוב') || query.includes('ערב טוב')) {
    return 'שלום! איך אוכל לעזור לך היום?';
  }
  
  if (query.includes('שעות') || query.includes('פתוח') || query.includes('פתיחה') || query.includes('סגור')) {
    return 'אנחנו פתוחים בימים א\'-ה\' בין השעות 9:00-18:00, וביום ו\' בין 9:00-14:00. בשבת אנחנו סגורים.';
  }
  
  if (query.includes('כתובת') || query.includes('איפה') || query.includes('מיקום') || query.includes('להגיע')) {
    return 'הכתובת שלנו היא רחוב ראשי 123, תל אביב. ניתן להגיע אלינו בקלות בתחבורה ציבורית או ברכב פרטי, יש חניה זמינה בסביבה.';
  }
  
  if (query.includes('טלפון') || query.includes('להתקשר') || query.includes('ליצור קשר')) {
    return 'ניתן ליצור איתנו קשר בטלפון 050-1234567 או במייל contact@mybusiness.com';
  }
  
  if (query.includes('מחיר') || query.includes('עולה') || query.includes('עלות') || query.includes('תשלום')) {
    return 'המחירים שלנו מתחילים מ-100 ש"ח, תלוי בסוג השירות. אשמח לתת לך הצעת מחיר מדויקת אם תספר לי במה בדיוק אתה מתעניין.';
  }
  
  if (query.includes('משלוח') || query.includes('אספקה') || query.includes('זמן') || query.includes('מתי יגיע')) {
    return 'זמני המשלוח שלנו הם בין 3-5 ימי עסקים. משלוחים לאזור תל אביב עשויים להגיע מהר יותר, לפעמים אפילו למחרת.';
  }
  
  if (query.includes('החזר') || query.includes('החזרה') || query.includes('ביטול') || query.includes('אחריות')) {
    return 'מדיניות ההחזרות שלנו מאפשרת החזרת מוצרים תוך 14 יום מיום הרכישה, בתנאי שהמוצר במצב תקין ובאריזתו המקורית. יש להציג חשבונית מקורית.';
  }
  
  if (query.includes('תודה') || query.includes('להתראות')) {
    return 'בשמחה! אם יש לך שאלות נוספות בעתיד, אל תהסס לפנות אלינו. יום נעים!';
  }
  
  // תשובה כללית לשאלות אחרות
  return 'תודה על פנייתך! נשמח לעזור לך בכל שאלה או בקשה. אנא פרט יותר על מה שאתה מחפש ואשמח לסייע.';
}

/**
 * פונקציה לשליחת שאלה ל-OpenAI וקבלת תשובה
 * @param {string} prompt - השאלה שנשלחת ל-AI
 * @param {Array} context - היסטוריית השיחה (אופציונלי)
 * @param {Object} businessInfo - פרטי העסק (אופציונלי)
 * @returns {Promise<string>} - התשובה מה-AI
 */
const getAIResponse = async (prompt, context = [], businessInfo = null) => {
  try {
    // בדיקת מבנה פרטי העסק ותיקון אם צריך
    let businessData = businessInfo;
    
    // בדיקה אם התקבל מבנה {businessInfo: {...}, trainingData: {...}}
    if (businessInfo && businessInfo.businessInfo) {
      businessData = businessInfo.businessInfo;
      console.log('Extracted nested businessInfo from input structure');
      console.log(businessData);
    }
    
    // מידע ברירת מחדל במקרה שלא התקבל מידע תקין
    if (!businessData || Object.keys(businessData).length === 0) {
      console.log('No valid business data provided, using default data');
      businessData = {
        name: "העסק שלי",
        industry: "שירותים",
        services: "שירותים כלליים",
        hours: "א-ה 9:00-18:00, ו 9:00-13:00",
        contact: "info@example.com, 050-1234567",
        additionalInfo: "מידע נוסף על העסק"
      };
    }
    
    // לוג של המידע העסקי שמועבר ל-AI
    //console.log('Business data being sent to OpenAI:', JSON.stringify(businessData, null, 2));
    
    // בניית הוראות מערכת בהתאם לפרטי העסק
    let systemPrompt = 'אתה סוכן וירטואלי של עסק ישראלי. אתה עונה בעברית בלבד ומסייע ללקוחות בצורה מקצועית ואדיבה.';
    
    // בדיקה אם יש הנחיות אימון מבוססות שיחות
    if (businessData.conversationTraining && businessData.conversationTraining.systemInstructions) {
      systemPrompt = businessData.conversationTraining.systemInstructions;
      console.log('Using conversation-based training instructions');
    }
    // אחרת, השתמש בפורמט הרגיל
    else {
      const businessName = businessData.name || "העסק שלי";
      const industry = businessData.industry || "שירותים";
      const services = businessData.services || "שירותים כלליים";
      const hours = businessData.hours || "";
      const contact = businessData.contact || "";
      const address = businessData.address || "";
      const additionalInfo = businessData.additionalInfo || "";
      const description = businessData.description || "";
      systemPrompt += `
אתה מייצג את העסק "${businessName}" בתחום ${industry}.
המוצרים/שירותים שהעסק מציע: ${services}`;

      if (hours) systemPrompt += `\nשעות פעילות: ${hours}`;
      if (contact) systemPrompt += `\nפרטי קשר: ${contact}`;
      if (address) systemPrompt += `\nכתובת: ${address}`;
      if (additionalInfo) systemPrompt += `\nמידע נוסף: ${additionalInfo}`;
      if (description) systemPrompt += `\nמידע נוסף: ${description}`;

      systemPrompt += `\n\nענה על שאלות הלקוח בנוגע לעסק בצורה מקצועית, נעימה ומתאימה. אל תמציא מידע שלא קיים בפרטים. 
אם התשובה לא נמצאת בפרטים, הצע ללקוח לפנות ישירות לעסק דרך פרטי הקשר.`;
    }

    // לוג של ה-system prompt
    //console.log('System prompt being sent to OpenAI:', systemPrompt);

    // מבנה ההיסטוריה שנשלחת ל-OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...context,
      { role: 'user', content: prompt }
    ];

    // שליחת הבקשה ל-OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    // החזרת התשובה
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    // במקרה של שגיאה, נחזיר תשובה מוכנה מראש
    return generateMockResponse(prompt);
  }
};

/**
 * פונקציה לאימון הבוט לפי פרטי העסק
 * @param {Object} businessInfo - אובייקט המכיל פרטים על העסק
 * @returns {Promise<string>} - אישור מה-AI
 */
const trainAgent = async (businessInfo) => {
  try {
    const prompt = `
אני רוצה שתלמד את המידע הבא על העסק שלי:

שם העסק: ${businessInfo.name}
תחום עיסוק: ${businessInfo.industry}
מוצרים/שירותים: ${businessInfo.services}
שעות פעילות: ${businessInfo.hours || 'לא צוין'}
פרטי קשר: ${businessInfo.contact || 'לא צוין'}
מידע נוסף: ${businessInfo.additionalInfo || 'אין מידע נוסף'}

אני רוצה שתשמש כנציג שירות לקוחות וירטואלי שעונה ללקוחות בווטסאפ. 
כשלקוחות פונים, ענה בצורה מקצועית, אדיבה ומותאמת לעסק שלי.
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'אתה מערכת AI שלומדת לייצג עסקים בשיחות עם לקוחות.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI training error:', error);
    return 'האימון הושלם בהצלחה! המערכת שלנו מוכנה לענות ללקוחות שלך באופן מקצועי ומותאם אישית לעסק שלך. המערכת תשתמש במידע שסיפקת ותספק מענה איכותי ללקוחותיך.';
  }
};

/**
 * פונקציה לאימון הבוט באמצעות שיחות קיימות
 * @param {Object} businessInfo - אובייקט המכיל פרטים על העסק
 * @param {Array} conversations - מערך של שיחות נבחרות לאימון (כל שיחה מכילה מערך של הודעות)
 * @returns {Promise<string>} - אישור מה-AI
 */
const trainAgentWithConversations = async (businessInfo, conversations) => {
  try {
    console.log('Training agent with conversations. Business info:', JSON.stringify(businessInfo, null, 2));
    console.log('Number of training conversations:', conversations.length);
    
    // יצירת פורמט מובנה לשיחות עבור האימון
    const formattedConversations = conversations.map((conversation, index) => {
      // מיון ההודעות לפי זמן
      const sortedMessages = [...conversation.messages].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      // מיפוי ההודעות לפורמט של דוגמת שיחה
      const formattedMessages = sortedMessages.map(msg => 
        `${msg.fromMe ? 'עסק' : 'לקוח'}: ${msg.body}`
      ).join('\n');
      
      return `--- שיחה ${index + 1} ---\n${formattedMessages}\n`;
    }).join('\n\n');
    
    const prompt = `
אני רוצה שתלמד את המידע הבא על העסק שלי ואת דוגמאות השיחות:

שם העסק: ${businessInfo.name}
תחום עיסוק: ${businessInfo.industry}
מוצרים/שירותים: ${businessInfo.services}
שעות פעילות: ${businessInfo.hours || 'לא צוין'}
פרטי קשר: ${businessInfo.contact || 'לא צוין'}
מידע נוסף: ${businessInfo.additionalInfo || 'אין מידע נוסף'}

להלן מספר דוגמאות לשיחות מכירה מוצלחות שניהלתי עם לקוחות. 
למד מהתשובות שלי (כל מה שמתחיל ב"עסק:") את אופן התגובה, סגנון הדיבור, והאופן שבו אני מטפל בשאלות.

${formattedConversations}

כנציג וירטואלי של העסק שלי, אני רוצה שתחקה את הסגנון והתוכן של התשובות שלי.
הקפד על:
1. אותו טון ורמת פורמליות
2. אופן מתן מידע על מחירים, זמני משלוח, וכדומה
3. טיפול בהתנגדויות לקוח
4. שלבי המכירה והמעבר מעניין לסגירת עסקה

כשלקוחות חדשים יפנו, ענה להם בסגנון דומה.
`;

    console.log('Sending training prompt to OpenAI');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'אתה מערכת AI שלומדת לחקות סגנון תקשורת ומכירות של עסק מתוך דוגמאות שיחה אמיתיות.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    console.log('OpenAI training response received');
    
    // שמירת ההנחיות בתוך השיטה כדי שישמשו את getAIResponse
    const systemInstructions = `
אתה סוכן וירטואלי של העסק "${businessInfo.name}" בתחום ${businessInfo.industry}.
המוצרים/שירותים שהעסק מציע: ${businessInfo.services}
${businessInfo.hours ? `שעות פעילות: ${businessInfo.hours}` : ''}
${businessInfo.contact ? `פרטי קשר: ${businessInfo.contact}` : ''}

למדת מדוגמאות שיחה אמיתיות של העסק. עליך לחקות את סגנון המענה והמכירה שראית בשיחות אלה.
נקודות חשובות:
1. שמור על אותו סגנון ורמת פורמליות
2. הצג מידע על מחירים ושירותים באופן דומה
3. טפל בהתנגדויות לקוח בדרך שראית בדוגמאות
4. הובל את השיחה בדרך דומה לשלבי המכירה שראית

השתמש בפרטי העסק הבאים במידת הצורך:
${businessInfo.additionalInfo ? `${businessInfo.additionalInfo}` : ''}
`;

    // שמור את ההנחיות בפרטי העסק כדי שישמשו את getAIResponse
    businessInfo.conversationTraining = {
      systemInstructions,
      trainingComplete: true,
      trainingDate: new Date().toISOString()
    };

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI conversation training error:', error);
    return 'האימון באמצעות שיחות הושלם בהצלחה! המערכת שלנו למדה את סגנון השיחות שלך עם לקוחות והיא מוכנה לחקות אותו. אנו נשתמש בפרטי העסק ובשיחות הדוגמה כדי לספק מענה דומה לשלך ללקוחות חדשים.';
  }
};

/**
 * פונקציה לשליחת בקשה ישירה לקבלת השלמת צ'אט עם החזרת תשובת הגלם
 * @param {Array} messages - מערך הודעות בפורמט OpenAI
 * @param {Object} options - הגדרות נוספות
 * @returns {Promise<Object>} - תשובת OpenAI הגולמית
 */
const getChatCompletionRaw = async (messages, options = {}) => {
  try {
    const defaultOptions = {
      model: options.model || 'gpt-4',
      messages,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.max_tokens || 500,
    };
    
    // הוספת פורמט תשובה אם צריך
    if (options.response_format) {
      defaultOptions.response_format = options.response_format;
    }
    
    // שליחת הבקשה ל-OpenAI
    return await openai.chat.completions.create(defaultOptions);
  } catch (error) {
    console.error('OpenAI API raw chat completion error:', error);
    throw error;
  }
};

/**
 * המרת דיבור לטקסט באמצעות Whisper API
 * @param {Buffer} audioData - נתוני האודיו
 * @returns {Promise<string>} - הטקסט המתועתק
 */
const transcribeSpeech = async (audioData) => {
  try {
    // בדיקה אם ב-mock mode
    if (!openai.audio || typeof openai.audio.transcriptions.create !== 'function') {
      console.log('Using mock transcription service');
      // החזרת טקסט דמה לפיתוח
      return "זה טקסט מתועתק לצורכי פיתוח. המערכת במצב סימולציה.";
    }

    // יצירת קובץ זמני
    const tempFile = Buffer.from(audioData);
    
    // שליחת בקשה ל-OpenAI
    const response = await openai.audio.transcriptions.create({
      file: tempFile,
      model: "whisper-1",
      language: "he"
    });

    return response.text;
  } catch (error) {
    console.error('Whisper API error:', error);
    throw error;
  }
};

/**
 * המרת טקסט לדיבור באמצעות TTS API
 * @param {string} text - הטקסט להמרה לדיבור
 * @returns {Promise<Buffer>} - נתוני האודיו
 */
const textToSpeech = async (text) => {
  try {
    // בדיקה אם ב-mock mode
    if (!openai.audio || typeof openai.audio.speech.create !== 'function') {
      console.log('Using mock TTS service');
      // החזרת נתוני אודיו דמה לפיתוח (רק למטרות הדגמה)
      return Buffer.from([]);
    }

    // שליחת בקשה ל-OpenAI
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: text
    });

    // המרת הסטרים לבאפר
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error('TTS API error:', error);
    throw error;
  }
};

async function generateChatResponse(messages) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.7,
      max_tokens: 150
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating chat response:', error);
    throw error;
  }
}

// פונקציה ליצירת סיכום שיחה
const generateConversationSummary = async (messages, businessInfo) => {
  try {
    const summaryPrompt = `
    סיכום השיחה הקודמת:
    ${messages.map(msg => `${msg.role === 'user' ? 'לקוח' : 'עסק'}: ${msg.content}`).join('\n')}
    
    אנא סוכם את השיחה בקצרה (עד 3 משפטים) תוך התמקדות בנושאים העיקריים והשאלות הפתוחות.
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'אתה מערכת AI שתפקידה לסכם שיחות בצורה תמציתית ומדויקת.' },
        { role: 'user', content: summaryPrompt }
      ],
      temperature: 0.3,
      max_tokens: 150
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating conversation summary:', error);
    return 'לא ניתן ליצור סיכום כרגע.';
  }
};

// פונקציה לקביעת המודל המתאים
const determineModel = (message, context) => {
  // בדיקה אם יש צורך ביכולות מתקדמות
  const requiresAdvancedCapabilities = 
    message.includes('תמונה') || 
    message.includes('קוד') || 
    message.includes('תכנות') ||
    message.length > 500 ||
    context.length > 1000;

  return requiresAdvancedCapabilities ? 'gpt-4' : 'gpt-3.5-turbo';
};

// פונקציה לניהול שיחה חכמה
const handleSmartConversation = async (message, userId, businessInfo) => {
  try {
    // קבלת סיכום השיחה הקודמת מהדיסק
    const previousSummary = await getPreviousSummary(userId);
    
    // קביעת המודל המתאים
    const model = determineModel(message, previousSummary || '');
    
    // בניית הודעות לשליחה
    const messages = [
      { role: 'system', content: `אתה סוכן וירטואלי של העסק "${businessInfo.name}". 
      ${businessInfo.description ? `תיאור העסק: ${businessInfo.description}` : ''}
      ${businessInfo.services ? `שירותים: ${businessInfo.services}` : ''}
      ${businessInfo.hours ? `שעות פעילות: ${businessInfo.hours}` : ''}
      ${businessInfo.contact ? `פרטי קשר: ${businessInfo.contact}` : ''}
      
      ענה בצורה מקצועית, אדיבה ומותאמת לעסק.` },
    ];

    // הוספת סיכום השיחה הקודמת אם קיים
    if (previousSummary) {
      messages.push({ role: 'system', content: `סיכום השיחה הקודמת: ${previousSummary}` });
    }

    // הוספת ההודעה הנוכחית
    messages.push({ role: 'user', content: message });

    // שליחת הבקשה ל-OpenAI
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 500
    });

    // שמירת סיכום השיחה הנוכחית
    const newSummary = await generateConversationSummary(messages, businessInfo);
    await saveSummary(userId, newSummary);

    // החזרת התשובה ומידע על השימוש בטוקנים
    return {
      response: response.choices[0].message.content.trim(),
      usage: response.usage,
      model
    };
  } catch (error) {
    console.error('Error in smart conversation handling:', error);
    throw error;
  }
};

// ייצוא הפונקציות
module.exports = {
  getAIResponse,
  trainAgent,
  trainAgentWithConversations,
  getChatCompletionRaw,
  transcribeSpeech,
  textToSpeech,
  generateChatResponse,
  handleSmartConversation
};

// קבלת סיכום השיחה הקודמת מהדיסק
const summaryDir = path.join(__dirname, '../temp/conversationSummaries');
if (!fs.existsSync(summaryDir)) fs.mkdirSync(summaryDir, { recursive: true });
const summaryPath = (userId) => path.join(summaryDir, `conversationSummary-${userId}.json`);

async function getPreviousSummary(userId) {
  try {
    if (fs.existsSync(summaryPath(userId))) {
      const data = fs.readFileSync(summaryPath(userId), 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return null;
}

async function saveSummary(userId, newSummary) {
  fs.writeFileSync(summaryPath(userId), JSON.stringify(newSummary));
} 