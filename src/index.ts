import express from 'express';
import cors from 'cors';
import { config } from './config/config';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import routes from './routes/index.js';

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

// Request logging (development)
if (config.server.nodeEnv === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================
// ROUTES
// ============================================================

app.use('/api', routes);

// ============================================================
// ERROR HANDLING
// ============================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================================
// SERVER START
// ============================================================

const PORT = config.server.port;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          Mi Pago Backend Server Started                    ║
╠════════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(51)}║
║  Environment: ${config.server.nodeEnv.padEnd(48)}║
║  Supabase URL: ${config.supabase.url.substring(0, 45).padEnd(48)}║
╚════════════════════════════════════════════════════════════╝
  `);

  console.log('API Endpoints:');
  console.log('  - Health Check: GET /api/health');
  console.log('  - User Accounts: /api/accounts/*');
  console.log('  - Credits: /api/credits/*');
  console.log('  - Transfers: /api/transfers/*');
});

export default app;
