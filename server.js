import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import websocketService from './services/websocketService.js';
import { createServer } from 'http';

dotenv.config();

const port = process.env.PORT || 5000;

connectDB();

const app = express();

app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({ extended: true, limit:'10mb' }));
app.use(cookieParser());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"]
}));

app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/categories', categoryRoutes);
app.use("/api/auth", authRoutes);

app.get('/', (req, res) => res.send('Server is ready'));

app.use(notFound);
app.use(errorHandler);

const server = createServer(app);

// Initialize WebSocket
websocketService.initialize(server);

server.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
