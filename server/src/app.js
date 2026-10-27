import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { createRequestLogger } from './middleware/requestLogger.js';
import { generalLimiter } from './middleware/rateLimiters.js';
import healthRoutes from './routes/health.js';
import ingredientsRoutes from './routes/ingredients.js';
import recipeRoutes from './routes/recipes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import pantryRoutes from './routes/pantry.js';

const app = express();

if (config.trustProxy  > 0) {
    app.set('trust proxy', config.trustProxy);
}

app.use(createRequestLogger(logger));

app.use(helmet());

app.use(
    cors({
        origin: config.corsOrigins,
        methods: ['GET', 'POST', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-Request-Id'],
        maxAge: 600,
    })
);

app.use('/api/health', healthRoutes);

app.use('/api', generalLimiter);

app.use(express.json({ limit: '10kb' }));

app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/pantry', pantryRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;