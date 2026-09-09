// config/redis.js
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

let redis = null;

if (process.env.UPSTASH_REDIS_URL) try {
  // Initialize the ioredis client using your environment variable
  redis = new Redis(process.env.UPSTASH_REDIS_URL);

  redis.on('connect', () => {
    console.log('✅ Upstash Redis Connected Successfully!');
  });

  redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err);
  });
} catch (error) {
  console.error('❌ Could not initialize Redis client:', error);
}

// Export the instance so you can import it anywhere in your app
export { redis };
