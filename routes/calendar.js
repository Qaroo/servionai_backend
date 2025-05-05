const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const Appointment = require('../models/Appointment');

// קבלת כל הפגישות
router.get('/appointments', authMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user.uid });
    res.json({ success: true, appointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ success: false, error: 'שגיאה בטעינת הפגישות' });
  }
});

// יצירת פגישה חדשה
router.post('/appointments', authMiddleware, async (req, res) => {
  try {
    const { title, description, startTime, endTime, clientName, clientPhone } = req.body;
    
    const appointment = new Appointment({
      userId: req.user.uid,
      title,
      description,
      startTime,
      endTime,
      clientName,
      clientPhone,
      status: 'scheduled'
    });

    await appointment.save();
    res.status(201).json({ appointment });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'שגיאה ביצירת הפגישה' });
  }
});

// עדכון פגישה
router.put('/appointments/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, startTime, endTime, clientName, clientPhone, status } = req.body;

    const appointment = await Appointment.findOneAndUpdate(
      { _id: id, userId: req.user.uid },
      { title, description, startTime, endTime, clientName, clientPhone, status },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ error: 'פגישה לא נמצאה' });
    }

    res.json({ appointment });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'שגיאה בעדכון הפגישה' });
  }
});

// מחיקת פגישה
router.delete('/appointments/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findOneAndDelete({ _id: id, userId: req.user.uid });

    if (!appointment) {
      return res.status(404).json({ error: 'פגישה לא נמצאה' });
    }

    res.json({ message: 'הפגישה נמחקה בהצלחה' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'שגיאה במחיקת הפגישה' });
  }
});

// קבלת הצעת זמן מהבינה המלאכותית
router.post('/ai-schedule', authMiddleware, async (req, res) => {
  try {
    const { clientName, clientPhone, description } = req.body;
    
    // כאן נשלב את הלוגיקה של הבינה המלאכותית
    // כרגע נחזיר זמן אקראי בתוך 7 הימים הקרובים
    const suggestedTime = new Date();
    suggestedTime.setDate(suggestedTime.getDate() + Math.floor(Math.random() * 7));
    suggestedTime.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);

    res.json({ suggestedTime });
  } catch (error) {
    console.error('Error getting AI schedule suggestion:', error);
    res.status(500).json({ error: 'שגיאה בקבלת הצעת זמן מהבינה המלאכותית' });
  }
});

module.exports = router; 