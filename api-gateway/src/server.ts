import mongoose from 'mongoose';
import app from './app';
import { config } from './config';
import { initRedis } from './services/redis';
import logger from './services/logger';

const startServer = async () => {
  try {
    // Connect to MongoDB
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    logger.info('MongoDB Connected successfully');

    // Connect to Redis
    logger.info('Initializing Redis Client...');
    await initRedis();

    // Start Listening
    app.listen(config.port, () => {
      logger.info(`API Gateway running on port ${config.port}`);
    });
  } catch (error) {
    logger.error(`Critical error starting API Gateway server: ${error}`);
    process.exit(1);
  }
};

startServer();
