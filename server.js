// This file is used as an entry point for Render deployment
// It simply requires the actual server entry point

console.log('Starting server from root server.js file...');
console.log('Current directory:', process.cwd());
console.log('Files in current directory:', require('fs').readdirSync('.'));

try {
  require('./server/index.js');
  console.log('Server started successfully');
} catch (error) {
  console.error('Error starting server:', error);
} 