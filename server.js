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
import dashboardRoutes from './routes/dashboardRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import websocketService from './services/websocketService.js';
import { createServer } from 'http';

dotenv.config();

const port = process.env.PORT || 5000;

connectDB();

const app = express();

app.use(express.json({limit:'2048mb'}));
app.use(express.urlencoded({ extended: true, limit:'2048mb' }));

// Set timeout for large uploads
app.timeout = 3600000; // 1 hour
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'; upgrade-insecure-requests"
  );
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // or 'DENY' if you prefer
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=()'
  );
  next();
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"]
}));

app.use('/api/users', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/support', supportRoutes);

app.get('/', (req, res) => res.send('Server is ready'));

app.use(notFound);
app.use(errorHandler);

const server = createServer(app);

// Disable Nagle's algorithm to prevent buffering of small packets
server.on('connection', (socket) => {
  socket.setNoDelay(true);
});

// Initialize WebSocket
websocketService.initialize(server);

server.listen(port, () => {
  console.log(`Server started on port ${port}`);
});