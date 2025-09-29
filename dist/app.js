"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("module-alias/register");
const express_1 = __importDefault(require("express"));
const dotenv_1 = require("dotenv");
const routes_1 = require("@/routes");
const middleware_1 = require("@/middleware");
const services_1 = require("@/services");
const services_2 = require("@/services");
(0, dotenv_1.config)();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(middleware_1.requestLogger);
app.use(middleware_1.corsHeaders);
app.use('/', routes_1.sessionRoutes);
app.use('/', routes_1.messageRoutes);
app.use('/', routes_1.legacyRoutes);
console.log('=== REGISTERED ROUTES ===');
app._router.stack.forEach((middleware) => {
    if (middleware.route) {
        console.log(`${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
    }
    else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
                console.log(`${Object.keys(handler.route.methods).join(',').toUpperCase()} ${handler.route.path}`);
            }
        });
    }
});
console.log('========================');
app.use(middleware_1.notFoundHandler);
app.use(middleware_1.errorHandler);
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
    console.log(`WhatsApp Multi-Session API Server running on port ${PORT}`);
    console.log('Server ready for session management');
    try {
        const sessionsHistory = await services_1.DatabaseService.getSessionsHistory(1, 100);
        const activeSessions = sessionsHistory.data.filter(session => session.status === 'connected' || session.status === 'authenticated');
        if (activeSessions.length > 0) {
            console.log(`Found ${activeSessions.length} previously active sessions, attempting to restore...`);
            for (const session of activeSessions) {
                try {
                    console.log(`Restoring session: ${session.sessionId}`);
                    await services_2.WhatsAppService.createConnection(session.sessionId);
                }
                catch (error) {
                    console.error(`Failed to restore session ${session.sessionId}:`, error);
                }
            }
        }
    }
    catch (error) {
        console.error('Error during auto-restore:', error);
    }
});
const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    server.close(async () => {
        console.log('HTTP server closed');
        try {
            await services_1.DatabaseService.disconnect();
            console.log('Database connection closed');
            process.exit(0);
        }
        catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    });
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown();
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown();
});
exports.default = app;
//# sourceMappingURL=app.js.map