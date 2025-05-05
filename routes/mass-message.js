const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { whatsappService } = require('../services/whatsapp');

// שליחת הודעה המונית
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { message, contacts } = req.body;
    const userId = req.user.uid;

    if (!message || !contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // שליחת ההודעות
    const results = await Promise.allSettled(
      contacts.map(async (contact) => {
        try {
          await whatsappService.sendMessage(userId, contact.phone, message);
          return { phone: contact.phone, status: 'success' };
        } catch (error) {
          console.error(`Error sending message to ${contact.phone}:`, error);
          return { phone: contact.phone, status: 'error', error: error.message };
        }
      })
    );

    // סיכום התוצאות
    const summary = {
      total: contacts.length,
      success: results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length,
      failed: results.filter(r => r.status === 'rejected' || r.value.status === 'error').length,
      details: results.map(r => r.status === 'fulfilled' ? r.value : { phone: r.reason.phone, status: 'error', error: r.reason.message })
    };

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Error sending mass message:', error);
    res.status(500).json({ error: 'Failed to send mass message' });
  }
});

// ייבוא אנשי קשר מקובץ אקסל
router.post('/import', authMiddleware, async (req, res) => {
  try {
    const { contacts } = req.body;
    const userId = req.user.uid;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'Invalid contacts data' });
    }

    // בדיקת תקינות הנתונים
    const validContacts = contacts.filter(contact => {
      return contact.phone && typeof contact.phone === 'string' && contact.phone.length >= 10;
    });

    res.json({ 
      success: true, 
      imported: validContacts.length,
      total: contacts.length,
      contacts: validContacts
    });
  } catch (error) {
    console.error('Error importing contacts:', error);
    res.status(500).json({ error: 'Failed to import contacts' });
  }
});

module.exports = router; 