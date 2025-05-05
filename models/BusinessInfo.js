const mongoose = require('mongoose');

const businessInfoSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    default: 'עסק חדש'
  },
  description: {
    type: String,
    default: 'תיאור העסק'
  },
  industry: {
    type: String,
    default: 'כללי'
  },
  services: {
    type: String,
    default: 'שירותים'
  },
  hours: {
    type: String,
    default: 'שעות פעילות'
  },
  contact: {
    type: String,
    default: 'פרטי קשר'
  },
  address: {
    type: String,
    default: 'כתובת'
  },
  website: {
    type: String,
    default: ''
  },
  additionalInfo: {
    type: String,
    default: 'מידע נוסף'
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
businessInfoSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const BusinessInfo = mongoose.model('BusinessInfo', businessInfoSchema);

module.exports = BusinessInfo; 