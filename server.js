// This file is used as an entry point for Render deployment
// It simply requires the actual server entry point

console.log('Loading from server/server.js, redirecting to index.js');

try {
  require('./index.js');
  console.log('Server started successfully via server.js in server directory');
} catch (error) {
  console.error('Error starting server from server/server.js:', error);
} 