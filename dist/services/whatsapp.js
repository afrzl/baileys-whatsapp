"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const baileys_1 = require("@whiskeysockets/baileys");
const qrcode_1 = __importDefault(require("qrcode"));
const fs_1 = __importDefault(require("fs"));
const pino_1 = __importDefault(require("pino"));
const utils_1 = require("@/utils");
const databaseAuth_1 = require("@/utils/databaseAuth");
const database_1 = require("./database");
const logger = (0, pino_1.default)({ level: 'silent' });
class WhatsAppService {
    static getSessions() {
        return this.sessions;
    }
    static getSessionQRs() {
        return this.sessionQRs;
    }
    static async createConnection(sessionId, options = {}) {
        try {
            if (this.sessions.has(sessionId)) {
                const existingSession = this.sessions.get(sessionId);
                if (existingSession.isAuthenticated) {
                    console.log(`Session ${sessionId} already authenticated, skipping creation`);
                    return existingSession;
                }
                console.log(`Cleaning up existing session ${sessionId} before recreating`);
                if (existingSession.socket) {
                    try {
                        await existingSession.socket.end(undefined);
                    }
                    catch (error) {
                        console.error('Error ending existing socket:', error);
                    }
                }
                this.sessions.delete(sessionId);
                this.sessionQRs.delete(sessionId);
            }
            const waWebVersion = await this.getWaWebVersion(sessionId);
            const authDir = `auth_info_${sessionId}`;
            if (fs_1.default.existsSync(authDir)) {
                console.log(`Removing legacy auth directory: ${authDir}`);
                fs_1.default.rmSync(authDir, { recursive: true, force: true });
            }
            const { state, saveCreds, clearAuth } = await (0, databaseAuth_1.useDatabaseAuthState)(sessionId);
            await database_1.DatabaseService.createSessionRecord(sessionId);
            const socket = (0, baileys_1.makeWASocket)({
                auth: state,
                logger,
                browser: baileys_1.Browsers.macOS('Chrome'),
                version: waWebVersion,
                defaultQueryTimeoutMs: undefined,
                keepAliveIntervalMs: 30000,
                connectTimeoutMs: 60000,
                qrTimeout: 60000,
                emitOwnEvents: true,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                shouldSyncHistoryMessage: () => false,
                markOnlineOnConnect: true,
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 3,
                patchMessageBeforeSending: (message) => {
                    return message;
                },
                shouldIgnoreJid: (jid) => false,
                linkPreviewImageThumbnailWidth: 192,
                transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
                ...options
            });
            const sessionData = {
                socket,
                isAuthenticated: false,
                authDir: `db_auth_${sessionId}`,
                status: 'connecting',
                startTime: Date.now()
            };
            this.sessions.set(sessionId, sessionData);
            this.setupEventHandlers(sessionId, socket, sessionData, saveCreds, clearAuth);
            return sessionData;
        }
        catch (error) {
            console.error(`[${sessionId}] Error creating WhatsApp connection:`, error);
            this.sessions.delete(sessionId);
            this.sessionQRs.delete(sessionId);
            throw error;
        }
    }
    static async getWaWebVersion(sessionId) {
        try {
            const { version, isLatest, error } = await (0, baileys_1.fetchLatestWaWebVersion)();
            if (isLatest) {
                console.log(`[${sessionId}] Using latest WhatsApp Web version: ${version.join('.')}`);
                return version;
            }
            console.warn(`[${sessionId}] Could not confirm latest WhatsApp Web version, trying Baileys default source:`, error instanceof Error ? error.message : error);
        }
        catch (error) {
            console.warn(`[${sessionId}] Failed to fetch WhatsApp Web version, trying Baileys default source:`, error instanceof Error ? error.message : error);
        }
        try {
            const { version, isLatest, error } = await (0, baileys_1.fetchLatestBaileysVersion)();
            if (isLatest) {
                console.log(`[${sessionId}] Using latest Baileys version hint: ${version.join('.')}`);
                return version;
            }
            console.warn(`[${sessionId}] Could not confirm Baileys version hint, using fallback:`, error instanceof Error ? error.message : error);
        }
        catch (error) {
            console.warn(`[${sessionId}] Failed to fetch Baileys version hint, using fallback:`, error instanceof Error ? error.message : error);
        }
        console.log(`[${sessionId}] Using fallback WhatsApp Web version: ${this.fallbackWaWebVersion.join('.')}`);
        return this.fallbackWaWebVersion;
    }
    static setupEventHandlers(sessionId, socket, sessionData, saveCreds, clearAuth) {
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;
            console.log(`[${sessionId}] Connection update:`, {
                connection,
                isNewLogin,
                isOnline,
                hasQR: !!qr,
                lastDisconnect: lastDisconnect?.error?.message
            });
            if (qr) {
                console.log(`[${sessionId}] QR Code received, generating data URL...`);
                try {
                    const qrImage = await qrcode_1.default.toDataURL(qr, {
                        margin: 2,
                        width: 256,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    });
                    this.sessionQRs.set(sessionId, qrImage);
                    await database_1.DatabaseService.updateSessionStatus(sessionId, 'waiting_qr_scan');
                    console.log(`[${sessionId}] QR Code generated and stored`);
                }
                catch (qrError) {
                    console.error(`[${sessionId}] Error generating QR code:`, qrError);
                }
            }
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
                const reconnectAttempts = this.reconnectAttempts.get(sessionId) || 0;
                console.log(`[${sessionId}] Connection closed:`, {
                    statusCode,
                    reason: Object.keys(baileys_1.DisconnectReason).find(key => baileys_1.DisconnectReason[key] === statusCode),
                    shouldReconnect,
                    error: lastDisconnect?.error?.message
                });
                await database_1.DatabaseService.updateSessionStatus(sessionId, 'disconnected');
                sessionData.isAuthenticated = false;
                this.sessionQRs.delete(sessionId);
                if (shouldReconnect && reconnectAttempts < this.maxReconnectAttempts) {
                    const nextAttempt = reconnectAttempts + 1;
                    this.reconnectAttempts.set(sessionId, nextAttempt);
                    console.log(`[${sessionId}] Attempting reconnection ${nextAttempt}/${this.maxReconnectAttempts} in 5 seconds...`);
                    setTimeout(() => {
                        console.log(`[${sessionId}] Reconnecting...`);
                        this.createConnection(sessionId, {}).catch(error => {
                            console.error(`[${sessionId}] Reconnection failed:`, error);
                        });
                    }, 5000);
                }
                else if (reconnectAttempts >= this.maxReconnectAttempts) {
                    console.log(`[${sessionId}] Max reconnection attempts reached, stopping reconnection`);
                    this.sessions.delete(sessionId);
                    this.sessionQRs.delete(sessionId);
                    this.reconnectAttempts.delete(sessionId);
                }
                else {
                    console.log(`[${sessionId}] Session logged out, cleaning up...`);
                    this.sessions.delete(sessionId);
                    this.sessionQRs.delete(sessionId);
                    this.reconnectAttempts.delete(sessionId);
                    await clearAuth();
                }
            }
            else if (connection === 'connecting') {
                console.log(`[${sessionId}] Connecting to WhatsApp...`);
                await database_1.DatabaseService.updateSessionStatus(sessionId, 'connecting');
            }
            else if (connection === 'open') {
                console.log(`[${sessionId}] WhatsApp connection opened successfully`);
                sessionData.isAuthenticated = true;
                this.reconnectAttempts.delete(sessionId);
                this.sessionQRs.delete(sessionId);
                await database_1.DatabaseService.updateSessionStatus(sessionId, 'connected');
                try {
                    const info = socket.user;
                    console.log(`[${sessionId}] Authenticated as:`, {
                        id: info?.id,
                        name: info?.name,
                        isOnline
                    });
                }
                catch (error) {
                    console.log(`[${sessionId}] Could not get user info:`, error.message);
                }
            }
        });
        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                console.log(`[${sessionId}] Credentials updated and saved to database`);
            }
            catch (error) {
                console.error(`[${sessionId}] Error saving credentials:`, error);
            }
        });
        socket.ev.on('messages.upsert', async (messageUpdate) => {
            const { messages } = messageUpdate;
            for (const message of messages) {
                if (message.key.fromMe)
                    continue;
                const phoneNumber = message.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '');
                if (!phoneNumber)
                    continue;
                let messageText = '';
                let messageType = 'unknown';
                let metadata = {};
                if (message.message?.conversation) {
                    messageText = message.message.conversation;
                    messageType = 'text';
                }
                else if (message.message?.extendedTextMessage?.text) {
                    messageText = message.message.extendedTextMessage.text;
                    messageType = 'text';
                }
                else if (message.message?.imageMessage) {
                    messageText = message.message.imageMessage.caption || '[Image]';
                    messageType = 'image';
                    metadata = {
                        mimetype: message.message.imageMessage.mimetype,
                        fileLength: message.message.imageMessage.fileLength
                    };
                }
                else if (message.message?.documentMessage) {
                    messageText = message.message.documentMessage.title || '[Document]';
                    messageType = 'document';
                    metadata = {
                        fileName: message.message.documentMessage.fileName,
                        mimetype: message.message.documentMessage.mimetype,
                        fileLength: message.message.documentMessage.fileLength
                    };
                }
                else if (message.message?.audioMessage) {
                    messageText = '[Audio]';
                    messageType = 'audio';
                    metadata = {
                        mimetype: message.message.audioMessage.mimetype,
                        seconds: message.message.audioMessage.seconds
                    };
                }
                await database_1.DatabaseService.saveChatHistory(sessionId, phoneNumber, messageText, messageType, 'incoming', metadata);
            }
        });
    }
    static async sendMessage(sessionId, jid, message, options = {}) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || !sessionData.isAuthenticated || !sessionData.socket) {
            throw new Error('Session not found or not authenticated');
        }
        const result = await sessionData.socket.sendMessage(jid, message, options);
        const phoneNumber = (0, utils_1.extractPhoneNumber)(jid);
        const messageText = message.text || JSON.stringify(message);
        await database_1.DatabaseService.saveChatHistory(sessionId, phoneNumber, messageText, 'text', 'outgoing');
        return result;
    }
    static async sendPoll(sessionId, jid, name, options, selectableCount = 1) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || !sessionData.isAuthenticated || !sessionData.socket) {
            throw new Error('Session not found or not authenticated');
        }
        const pollMessage = {
            poll: {
                name: name,
                values: options,
                selectableCount: selectableCount
            }
        };
        const result = await sessionData.socket.sendMessage(jid, pollMessage);
        const phoneNumber = (0, utils_1.extractPhoneNumber)(jid);
        const messageText = `Poll: ${name} - Options: ${options.join(', ')}`;
        await database_1.DatabaseService.saveChatHistory(sessionId, phoneNumber, messageText, 'poll', 'outgoing');
        return result;
    }
    static async getGroups(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || !sessionData.isAuthenticated || !sessionData.socket) {
            throw new Error('Session not found or not authenticated');
        }
        try {
            const chats = await sessionData.socket.groupFetchAllParticipating();
            const groups = Object.values(chats).map(group => ({
                jid: group.id,
                name: group.subject,
                description: group.desc || '',
                participantsCount: group.participants?.length || 0,
                isAdmin: group.participants?.some(p => p.id === sessionData.socket?.user?.id &&
                    (p.admin === 'admin' || p.admin === 'superadmin')) || false,
                createdAt: group.creation ? new Date(group.creation * 1000) : null,
                owner: group.owner || null
            }));
            return groups;
        }
        catch (error) {
            console.error('Error fetching groups:', error);
            throw new Error('Failed to fetch groups');
        }
    }
    static async deleteSession(sessionId) {
        const sessionData = this.sessions.get(sessionId);
        if (sessionData) {
            if (sessionData.socket) {
                try {
                    await sessionData.socket.logout();
                    await sessionData.socket.end(undefined);
                }
                catch (error) {
                    console.error(`Error ending session ${sessionId}:`, error);
                }
            }
            await database_1.DatabaseService.clearAuthData(sessionId);
            this.sessions.delete(sessionId);
            this.sessionQRs.delete(sessionId);
            this.reconnectAttempts.delete(sessionId);
            await database_1.DatabaseService.updateSessionStatus(sessionId, 'logged_out');
        }
    }
    static async waitForQR(sessionId, maxAttempts = 40) {
        let attempts = 0;
        return new Promise((resolve) => {
            const checkQR = () => {
                const session = this.sessions.get(sessionId);
                const qr = this.sessionQRs.get(sessionId);
                if (qr) {
                    console.log(`[${sessionId}] QR code found after ${attempts * 1000}ms`);
                    resolve(qr);
                }
                else if (session && session.isAuthenticated) {
                    console.log(`[${sessionId}] Session authenticated while waiting for QR`);
                    resolve('authenticated');
                }
                else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(checkQR, 1000);
                }
                else {
                    console.log(`[${sessionId}] QR wait timeout after ${maxAttempts * 1000}ms`);
                    resolve(null);
                }
            };
            checkQR();
        });
    }
}
exports.WhatsAppService = WhatsAppService;
WhatsAppService.sessions = new Map();
WhatsAppService.sessionQRs = new Map();
WhatsAppService.reconnectAttempts = new Map();
WhatsAppService.maxReconnectAttempts = 3;
WhatsAppService.fallbackWaWebVersion = [2, 3000, 1042951012];
//# sourceMappingURL=whatsapp.js.map