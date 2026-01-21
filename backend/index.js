import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import pool from './db/pool.js';
import studentRoutes from './routes/student.js';
import authRoutes from './routes/auth.js';
import slotsRoutes from './routes/slots.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check + DB test
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      serverTime: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Routes
app.use('/student', studentRoutes);
app.use('/auth', authRoutes);
app.use('/slots', slotsRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});