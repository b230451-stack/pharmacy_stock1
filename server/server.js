import 'dotenv/config';
import express from 'express';
import { connectDatabase } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import { errorHandler } from './middleware/errorMiddleware.js';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', inventoryRoutes);

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'pharmacy-stock-api'
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    await connectDatabase();

    app.listen(port, () => {
      console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
}

startServer();
