"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const services_1 = require("@/services");
const utils_1 = require("@/utils");
const middleware_1 = require("@/middleware");
class SessionController {
}
exports.SessionController = SessionController;
_a = SessionController;
SessionController.listSessions = (0, middleware_1.asyncHandler)(async (req, res) => {
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionList = [];
    for (const [sessionId] of sessions) {
        sessionList.push({
            id: sessionId,
            status: (0, utils_1.getSessionStatus)(sessionId, sessions)
        });
    }
    res.json(sessionList);
});
SessionController.findSession = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const sessions = services_1.WhatsAppService.getSessions();
    if (sessions.has(sessionId)) {
        res.json({
            success: true,
            message: 'Session found',
            data: {
                id: sessionId,
                status: (0, utils_1.getSessionStatus)(sessionId, sessions)
            }
        });
    }
    else {
        res.status(404).json({
            success: false,
            message: 'Session not found'
        });
    }
});
SessionController.getSessionStatus = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionQRs = services_1.WhatsAppService.getSessionQRs();
    const status = (0, utils_1.getSessionStatus)(sessionId, sessions);
    const qr = sessionQRs.get(sessionId);
    const response = { status };
    if (qr && status !== 'AUTHENTICATED') {
        response.qr = qr;
    }
    res.json(response);
});
SessionController.getQRCode = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionQRs = services_1.WhatsAppService.getSessionQRs();
    if (!sessions.has(sessionId)) {
        return res.status(404).json({
            success: false,
            message: 'Session not found'
        });
    }
    const sessionData = sessions.get(sessionId);
    if (sessionData.isAuthenticated) {
        return res.json({
            success: true,
            message: 'Session already authenticated',
            status: 'AUTHENTICATED'
        });
    }
    const qr = sessionQRs.get(sessionId);
    if (qr) {
        const response = {
            success: true,
            qr: qr,
            message: 'Scan QR code with WhatsApp',
            sessionId: sessionId,
            status: (0, utils_1.getSessionStatus)(sessionId, sessions)
        };
        res.json(response);
    }
    else {
        const response = {
            success: false,
            message: 'QR code not available yet',
            sessionId: sessionId,
            status: (0, utils_1.getSessionStatus)(sessionId, sessions)
        };
        res.json(response);
    }
});
SessionController.addSession = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId, ...options } = req.body;
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Session ID is required'
        });
    }
    if (!(0, utils_1.isValidSessionId)(sessionId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid session ID format'
        });
    }
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionQRs = services_1.WhatsAppService.getSessionQRs();
    if (sessions.has(sessionId)) {
        const existingSession = sessions.get(sessionId);
        if (existingSession.isAuthenticated) {
            return res.json({
                success: true,
                message: 'Session already authenticated',
                sessionId: sessionId,
                status: 'AUTHENTICATED'
            });
        }
        const existingQR = sessionQRs.get(sessionId);
        if (existingQR) {
            return res.json({
                success: true,
                qr: existingQR,
                message: 'Session exists, scan QR code to authenticate',
                sessionId: sessionId,
                status: (0, utils_1.getSessionStatus)(sessionId, sessions)
            });
        }
        console.log(`[${sessionId}] Session exists but no QR available, recreating...`);
    }
    console.log(`[${sessionId}] Creating new WhatsApp connection...`);
    try {
        await services_1.WhatsAppService.createConnection(sessionId, options);
        const qrResult = await services_1.WhatsAppService.waitForQR(sessionId);
        if (qrResult === 'authenticated') {
            return res.json({
                success: true,
                message: 'Session authenticated successfully',
                sessionId: sessionId,
                status: 'AUTHENTICATED'
            });
        }
        else if (qrResult) {
            return res.json({
                success: true,
                qr: qrResult,
                message: 'QR code generated successfully',
                sessionId: sessionId,
                status: (0, utils_1.getSessionStatus)(sessionId, sessions)
            });
        }
        else {
            const currentStatus = (0, utils_1.getSessionStatus)(sessionId, sessions);
            const session = sessions.get(sessionId);
            console.log(`[${sessionId}] QR generation timeout. Current status: ${currentStatus}`);
            return res.status(408).json({
                success: false,
                message: 'QR code generation timeout. The connection might be slow or there might be network issues. Try again or check your internet connection.',
                sessionId: sessionId,
                status: currentStatus,
                retry: {
                    available: true,
                    message: 'You can retry by calling this endpoint again',
                    recommendation: 'Wait a few seconds before retrying'
                },
                debug: {
                    hasSession: !!session,
                    hasSocket: !!session?.socket,
                    hasWebSocket: !!session?.socket?.ws,
                    timeoutAfter: '40 seconds',
                    suggestion: 'Try deleting and recreating the session if this persists'
                }
            });
        }
    }
    catch (error) {
        console.error(`Error adding session:`, error);
        try {
            await services_1.WhatsAppService.deleteSession(sessionId);
        }
        catch (cleanupError) {
            console.error(`Error cleaning up failed session ${sessionId}:`, cleanupError);
        }
        res.status(500).json({
            success: false,
            message: 'Failed to add session',
            error: error.message,
            sessionId: sessionId,
            retry: {
                available: true,
                message: 'Session has been cleaned up, you can try again'
            }
        });
    }
});
SessionController.deleteSession = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    try {
        await services_1.WhatsAppService.deleteSession(sessionId);
        res.json({
            success: true,
            message: 'Session deleted'
        });
    }
    catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete session',
            error: error.message
        });
    }
});
SessionController.getSessionsHistory = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { page = '1', limit = '20' } = req.query;
    try {
        const result = await services_1.DatabaseService.getSessionsHistory(parseInt(page), parseInt(limit));
        res.json({
            success: true,
            ...result
        });
    }
    catch (error) {
        console.error('Error fetching sessions history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sessions history',
            error: error.message
        });
    }
});
//# sourceMappingURL=sessionController.js.map