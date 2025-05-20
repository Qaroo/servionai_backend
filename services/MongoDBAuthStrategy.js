const { Client } = require('whatsapp-web.js');
const mongodbService = require('./mongodb');

/**
 * MongoDB auth strategy that implements the WhatsApp Web authentication strategy using MongoDB
 * @param {Object} options - Options for the auth strategy
 */
class MongoDBAuthStrategy {
  constructor(options = {}) {
    this.clientId = options.clientId || 'session';
    this.dataPath = options.dataPath;
  }

  async beforeBrowserInitialized() {
    const sessionData = await mongodbService.getWhatsAppSession(this.clientId);
    
    if (sessionData) {
      try {
        return JSON.parse(JSON.stringify(sessionData));
      } catch (error) {
        console.error('Error parsing session data:', error);
      }
    }
    
    return null;
  }

  async onAuthenticationNeeded() {
    console.log(`Authentication needed for ${this.clientId}`);
  }

  async afterBrowserInitialized() {
    // No action needed
  }

  async onAuthenticated(sessionData) {
    await mongodbService.saveWhatsAppSession(this.clientId, sessionData);
  }

  async logout() {
    await mongodbService.deleteWhatsAppSession(this.clientId);
  }
}

module.exports = MongoDBAuthStrategy; 