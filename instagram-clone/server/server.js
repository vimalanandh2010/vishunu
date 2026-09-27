import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import dotenv from 'dotenv';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { generalLimiter } from './middleware/rateLimitMiddleware.js';

// Load environment variables (override: true so .env wins over stray shell env like PORT=0)
dotenv.config({ override: true });

// Connect to MongoDB (vlove)
connectDB();

const app = express();

// Security & parsing middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());

// Rate limit all API routes
app.use('/api', generalLimiter);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'instagram-clone-api' });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// 404 + centralized error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`
  );
});
