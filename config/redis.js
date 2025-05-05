const Redis = require('ioredis');



const redisClient = new Redis(process.env.REDIS_URL || 'rediss://default:n2GofQre4falRtw1q7d6Bpzevq6zEZIz@redis-15130.crce198.eu-central-1-3.ec2.redns.redis-cloud.com:15130');

redisClient.on('error', (err) => {
  console.log("Trying to login in to ", process.env.REDIS_URL || 'rediss://default:n2GofQre4falRtw1q7d6Bpzevq6zEZIz@redis-15130.crce198.eu-central-1-3.ec2.redns.redis-cloud.com:15130');
  if (err.code === 'ECONNREFUSED') {
    console.warn('Redis connection refused. Make sure Redis server is running.');
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Continuing without Redis connection');
    }
  } else {
    console.error('Redis Client Error:', err);
  }
});

redisClient.on('connect', () => {
  console.log('Redis connected successfully');
});

// פונקציות עזר ל-Redis
const getLastSender = async (phoneNumber) => {
  return await redisClient.get(`lastSender:${phoneNumber}`);
};

const getLastTimestamp = async (phoneNumber) => {
  return await redisClient.get(`lastTimestamp:${phoneNumber}`);
};

const setLastSender = async (phoneNumber, sender) => {
  await redisClient.set(`lastSender:${phoneNumber}`, sender);
};

const setLastTimestamp = async (phoneNumber, timestamp) => {
  await redisClient.set(`lastTimestamp:${phoneNumber}`, timestamp);
};

// פונקציה לבדיקה האם הבוט צריך להגיב
const shouldBotRespond = async (phoneNumber) => {
  const lastSender = await getLastSender(phoneNumber);
  const lastTimestamp = await getLastTimestamp(phoneNumber);
  
  // אם אין מידע קודם, הבוט יכול להגיב
  if (!lastSender || !lastTimestamp) {
    return true;
  }
  
  // אם הלקוח שלח הודעה אחרונה, הבוט יכול להגיב
  if (lastSender === 'client') {
    return true;
  }
  
  // אם אנחנו שלחנו הודעה אחרונה, בדוק את הזמן שחלף
  const timeElapsed = Date.now() - parseInt(lastTimestamp);
  const FIVE_MINUTES = 5 * 60 * 1000; // 5 דקות במילישניות
  
  // אם עברו יותר מ-5 דקות, הבוט יכול להגיב
  return timeElapsed > FIVE_MINUTES;
};

module.exports = {
  redisClient,
  getLastSender,
  getLastTimestamp,
  setLastSender,
  setLastTimestamp,
  shouldBotRespond
}; 