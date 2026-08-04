import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import gatewayRoutes from './routes/gateway.routes';
import errorHandler from './middleware/errorHandler';
import logger from './services/logger';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: '*', // In production, replace with specific domain configs
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logger
const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};
app.use(morgan(':method :url :status :res[content-length] - :response-time ms', { stream: morganStream }));

// Base routes
app.use('/api', gatewayRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
  });
});

// Error handling middleware
app.use(errorHandler);

export default app;
