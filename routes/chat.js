const express = require('express');
const router = express.Router();
const { getChatHistory, saveChatMessage } = require('../services/mongodb');
const { generateChatResponse } = require('../services/openai');

// קבלת היסטוריית השיחה
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await getChatHistory(userId);
    res.json(history);
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

// שליחת הודעה חדשה
router.post('/message', async (req, res) => {
  try {
    const { userId, content } = req.body;
    
    // שמירת הודעת המשתמש
    await saveChatMessage(userId, content, 'user');
    
    // קבלת תשובה מ-OpenAI
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content }
    ];
    const response = await generateChatResponse(messages);
    
    // שמירת תשובת המערכת
    await saveChatMessage(userId, response, 'assistant');
    
    res.json({ response });
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

module.exports = router; 