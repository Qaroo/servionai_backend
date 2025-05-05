const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true
  },
  name: {
    type: String
  },
  phone: {
    type: String
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  activatedBy: {
    type: String
  },
  activatedAt: {
    type: Date
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  whatsappStatus: {
    type: Object,
    default: () => ({
      status: 'disconnected',
      lastUpdated: new Date()
    })
  },
  businessInfo: {
    type: Object,
    default: () => ({
      name: 'עסק חדש',
      description: 'תיאור העסק',
      industry: 'כללי',
      services: 'שירותים',
      hours: 'שעות פעילות',
      contact: 'פרטי קשר',
      address: 'כתובת',
      website: '',
      additionalInfo: 'מידע נוסף'
    })
  },
  trainingData: {
    type: Object,
    default: () => ({})
  },
  botSettings: {
    type: Object,
    default: () => ({})
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware לעדכון תאריך העדכון
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User; 