// This file is used as an entry point for Render deployment
// It simply requires the actual server entry point

console.log('Loading from server/server.js, redirecting to index.js');

try {
  require('./index.js');
  console.log('Server started successfully via server.js in server directory');
} catch (error) {
  console.error('Error starting server from server/server.js:', error);
}

// Routes
const aiRouter = require('./routes/ai');
const authRouter = require('./routes/auth');
const uploadRouter = require('./routes/upload');
const faqRouter = require('./routes/faq');
const businessRouter = require('./routes/business');
const websiteRouter = require('./routes/website');
const whatsappRouter = require('./routes/whatsapp');
const botRouter = require('./routes/bot');

// ... existing code ...
app.use('/api/ai', aiRouter);
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/faq', faqRouter);
app.use('/api/business', businessRouter);
app.use('/api/website', websiteRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/bot', botRouter);
// ... existing code ... 
