// Register module aliases for runtime path resolution
import 'module-alias/register';

import express from 'express';
import { config } from 'dotenv';
import { sessionRoutes, messageRoutes, legacyRoutes } from '@/routes';
import { 
  errorHandler, 
  notFoundHandler, 
  requestLogger, 
  corsHeaders 
} from '@/middleware';
import { DatabaseService } from '@/services';
import { WhatsAppService } from '@/services';

// Load environment variables
config();

const app = express();

// Middleware setup
app.use(express.json());
app.use(requestLogger);
app.use(corsHeaders);

// Routes setup
app.use('/', sessionRoutes);
app.use('/', messageRoutes);
app.use('/', legacyRoutes);

// Debug: List all registered routes
console.log('=== REGISTERED ROUTES ===');
app._router.stack.forEach((middleware: any) => {
  if (middleware.route) {
    console.log(`${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    middleware.handle.stack.forEach((handler: any) => {
      if (handler.route) {
        console.log(`${Object.keys(handler.route.methods).join(',').toUpperCase()} ${handler.route.path}`);
      }
    });
  }
});
console.log('========================');

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Start server
const server = app.listen(PORT, async () => {
  console.log(`WhatsApp Multi-Session API Server running on port ${PORT}`);
  console.log('Server ready for session management');
  
  // Auto-restore sessions on startup
  try {
    const sessionsHistory = await DatabaseService.getSessionsHistory(1, 100);
    const activeSessions = sessionsHistory.data.filter(session => 
      session.status === 'connected' || session.status === 'authenticated'
    );
    
    if (activeSessions.length > 0) {
      console.log(`Found ${activeSessions.length} previously active sessions, attempting to restore...`);
      
      for (const session of activeSessions) {
        try {
          console.log(`Restoring session: ${session.sessionId}`);
          await WhatsAppService.createConnection(session.sessionId);
        } catch (error) {
          console.error(`Failed to restore session ${session.sessionId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error during auto-restore:', error);
  }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  
  // Close server
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      // Disconnect from database
      await DatabaseService.disconnect();
      console.log('Database connection closed');
      
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown();
});

export default app; 