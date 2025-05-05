const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const { MONGODB_URI } = process.env;
    
    if (!MONGODB_URI) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('MONGODB_URI is not defined, but continuing in development mode');
        return;
      }
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('MongoDB connection failed, but continuing in development mode:', error.message);
      return;
    }
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

module.exports = { connectDB }; 