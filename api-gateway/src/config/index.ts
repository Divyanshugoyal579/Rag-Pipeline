import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'rag_jwt_secret_key_change_in_production_12345',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'rag_jwt_refresh_secret_key_change_in_production_12345',
  mongoUri: process.env.MONGO_URI || 'mongodb://admin:admin_password@localhost:27017/rag_auth_db?authSource=admin',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  springServiceUrl: process.env.SPRING_SERVICE_URL || 'http://localhost:8081/api/documents',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
};
