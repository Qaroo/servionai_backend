const openaiService = require('./openai');

/**
 * קבלת השלמת צ'אט מ-OpenAI
 * @param {Array} messages - מערך של הודעות בפורמט של OpenAI
 * @param {Object} options - אפשרויות נוספות
 * @returns {Promise<string>} - תוכן התשובה
 */
const getChatCompletion = async (messages, options = {}) => {
  try {
    const response = await openaiService.getChatCompletionRaw(messages, options);
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error getting chat completion:', error);
    return "אירעה שגיאה בשרת. אנא נסה שוב מאוחר יותר.";
  }
};

/**
 * יצירת מודל אמבדינג עבור טקסט
 * @param {string} text - הטקסט שעבורו יש ליצור אמבדינג
 * @returns {Promise<Array<number>>} - וקטור האמבדינג
 */
const createEmbedding = async (text) => {
  try {
    return await openaiService.createEmbedding(text);
  } catch (error) {
    console.error('Error creating embedding:', error);
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
    return await openaiService.transcribeSpeech(audioData);
  } catch (error) {
    console.error('Error transcribing speech:', error);
    return "אירעה שגיאה בתעתוק הדיבור.";
  }
};

/**
 * המרת טקסט לדיבור
 * @param {string} text - הטקסט להמרה לדיבור
 * @returns {Promise<Buffer>} - נתוני האודיו
 */
const textToSpeech = async (text) => {
  try {
    return await openaiService.textToSpeech(text);
  } catch (error) {
    console.error('Error converting text to speech:', error);
    throw error;
  }
};

module.exports = {
  getChatCompletion,
  createEmbedding,
  transcribeSpeech,
  textToSpeech
}; 