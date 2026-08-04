import { createClient } from 'redis';
import logger from './logger';
import { config } from '../config';

const redisClient = createClient({
  url: config.redisUrl,
});

redisClient.on('error', (err) => logger.error(`Redis Client Error: ${err}`));
redisClient.on('connect', () => logger.info('Redis Client Connected'));

export const initRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.error(`Failed to connect to Redis: ${error}`);
  }
};

export default redisClient;
