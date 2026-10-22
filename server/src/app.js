import express from 'express';
import ingredientsRoutes from './routes/ingredients.js';
import recipeRoutes from './routes/recipes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import pantryRoutes from './routes/pantry.js';

const app = express();

app.use(express.json());

app.use('/api/ingredients', ingredientsRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/pantry', pantryRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(3000, () => console.log('Listening on http://localhost:3000'));