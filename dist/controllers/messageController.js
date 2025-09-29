"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageController = void 0;
const services_1 = require("@/services");
const utils_1 = require("@/utils");
const middleware_1 = require("@/middleware");
class MessageController {
}
exports.MessageController = MessageController;
_a = MessageController;
MessageController.sendMessage = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, type, message, options = {} } = req.body;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionData = sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated) {
        return res.status(400).json({
            success: false,
            message: 'Session not found or not authenticated'
        });
    }
    if (!jid || !message) {
        return res.status(400).json({
            success: false,
            message: 'JID and message are required'
        });
    }
    try {
        let targetJid = jid;
        if (type === 'number') {
            targetJid = (0, utils_1.formatPhoneNumber)(jid);
        }
        const result = await services_1.WhatsAppService.sendMessage(sessionId, targetJid, message, options);
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});
MessageController.sendBulkMessages = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const messages = req.body;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionData = sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated) {
        return res.status(400).json({
            success: false,
            message: 'Session not found or not authenticated'
        });
    }
    if (!Array.isArray(messages)) {
        return res.status(400).json({
            success: false,
            message: 'Request body must be an array of messages'
        });
    }
    const results = [];
    const errors = [];
    try {
        for (let i = 0; i < messages.length; i++) {
            const { jid, type, message, options = {}, delay = 1000 } = messages[i];
            try {
                if (i > 0) {
                    await (0, utils_1.sleep)(delay);
                }
                let targetJid = jid;
                if (type === 'number') {
                    targetJid = (0, utils_1.formatPhoneNumber)(jid);
                }
                const result = await services_1.WhatsAppService.sendMessage(sessionId, targetJid, message, options);
                results.push({ index: i, result });
            }
            catch (error) {
                errors.push({
                    index: i,
                    error: error.message
                });
            }
        }
        res.json({
            success: true,
            results,
            errors
        });
    }
    catch (error) {
        console.error('Error sending bulk messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send bulk messages',
            error: error.message
        });
    }
});
MessageController.getChatHistory = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId, jid } = req.params;
    const { page = '1', limit = '25', cursor } = req.query;
    try {
        let phoneNumber;
        if (jid) {
            phoneNumber = (0, utils_1.extractPhoneNumber)(jid);
        }
        const result = await services_1.DatabaseService.getChatHistory(sessionId, phoneNumber, parseInt(page), parseInt(limit), cursor ? parseInt(cursor) : undefined);
        res.json({
            success: true,
            ...result
        });
    }
    catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat history',
            error: error.message
        });
    }
});
MessageController.getContacts = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const { limit = '25', cursor, search } = req.query;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionData = sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated) {
        return res.status(400).json({
            success: false,
            message: 'Session not found or not authenticated'
        });
    }
    try {
        res.json({
            success: true,
            data: [],
            cursor: null,
            message: 'Contact list feature not yet implemented'
        });
    }
    catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch contacts',
            error: error.message
        });
    }
});
MessageController.sendPoll = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const { jid, type, name, options, selectableCount = 1 } = req.body;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionData = sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated) {
        return res.status(400).json({
            success: false,
            message: 'Session not found or not authenticated'
        });
    }
    if (!jid || !name || !options || !Array.isArray(options)) {
        return res.status(400).json({
            success: false,
            message: 'JID, poll name, and options array are required'
        });
    }
    if (options.length < 2 || options.length > 12) {
        return res.status(400).json({
            success: false,
            message: 'Poll must have between 2 and 12 options'
        });
    }
    if (selectableCount < 1 || selectableCount > options.length) {
        return res.status(400).json({
            success: false,
            message: 'Selectable count must be between 1 and the number of options'
        });
    }
    try {
        let targetJid = jid;
        if (type === 'number') {
            targetJid = (0, utils_1.formatPhoneNumber)(jid);
        }
        if (!targetJid.endsWith('@g.us')) {
            return res.status(400).json({
                success: false,
                message: 'Polls can only be sent to groups'
            });
        }
        const result = await services_1.WhatsAppService.sendPoll(sessionId, targetJid, name, options, selectableCount);
        res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Error sending poll:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send poll',
            error: error.message
        });
    }
});
MessageController.getGroups = (0, middleware_1.asyncHandler)(async (req, res) => {
    const { sessionId } = req.params;
    const sessions = services_1.WhatsAppService.getSessions();
    const sessionData = sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated) {
        return res.status(400).json({
            success: false,
            message: 'Session not found or not authenticated'
        });
    }
    try {
        const groups = await services_1.WhatsAppService.getGroups(sessionId);
        res.json({
            success: true,
            data: groups,
            count: groups.length
        });
    }
    catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch groups',
            error: error.message
        });
    }
});
//# sourceMappingURL=messageController.js.map