import { 
  DisconnectReason, 
  makeWASocket,
  WASocket
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import fs from 'fs';
import P from 'pino';
import { 
  SessionData, 
  ConnectionOptions, 
  MessageType, 
  MessageDirection 
} from '@/types';
import { extractPhoneNumber } from '@/utils';
import { useDatabaseAuthState } from '@/utils/databaseAuth';
import { DatabaseService } from './database';

// Logger
const logger = P({ level: 'silent' });

/**
 * WhatsApp Service Class
 * Handles WhatsApp connections, messaging, and session management
 */
export class WhatsAppService {
  private static sessions = new Map<string, SessionData>();
  private static sessionQRs = new Map<string, string>();

  /**
   * Get all active sessions
   * @returns Map of active sessions
   */
  static getSessions(): Map<string, SessionData> {
    return this.sessions;
  }

  /**
   * Get session QR codes
   * @returns Map of session QR codes
   */
  static getSessionQRs(): Map<string, string> {
    return this.sessionQRs;
  }

  /**
   * Create WhatsApp connection for a session
   * @param sessionId - Unique session identifier
   * @param options - Connection options
   * @returns Session data
   */
  static async createConnection(
    sessionId: string, 
    options: ConnectionOptions = {}
  ): Promise<SessionData> {
    try {
      // Check if session already exists and is authenticated
      if (this.sessions.has(sessionId)) {
        const existingSession = this.sessions.get(sessionId)!;
        if (existingSession.isAuthenticated) {
          console.log(`Session ${sessionId} already authenticated, skipping creation`);
          return existingSession;
        }
        
        // Clean up existing session before recreating
        console.log(`Cleaning up existing session ${sessionId} before recreating`);
        if (existingSession.socket) {
          try {
            await existingSession.socket.end(undefined);
          } catch (error) {
            console.error('Error ending existing socket:', error);
          }
        }
        this.sessions.delete(sessionId);
        this.sessionQRs.delete(sessionId);
      }
      
      // Clean up any existing auth folder (legacy cleanup)
      const authDir = `auth_info_${sessionId}`;
      if (fs.existsSync(authDir)) {
        console.log(`Removing legacy auth directory: ${authDir}`);
        fs.rmSync(authDir, { recursive: true, force: true });
      }
      
      // Use database auth state instead of file system
      const { state, saveCreds, clearAuth } = await useDatabaseAuthState(sessionId);
      
      await DatabaseService.createSessionRecord(sessionId);
      
      // Enhanced socket configuration
      const socket = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: true,
        browser: ['Chrome (Linux)', 'Chrome', '120.0.6099.109'],
        version: [2, 3000, 1025190524],
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        getMessage: async (key) => {
          return {
            conversation: 'Hello'
          }
        },
        patchMessageBeforeSending: (message) => {
          return message;
        },
        appStateMacVerification: {
          patch: true,
          snapshot: true
        },
        ...options
      });

      const sessionData: SessionData = {
        socket,
        isAuthenticated: false,
        authDir: `db_auth_${sessionId}`, // Just for reference, not used for actual storage
        status: 'connecting',
        startTime: Date.now()
      };

      this.sessions.set(sessionId, sessionData);

      // Set up event handlers
      this.setupEventHandlers(sessionId, socket, sessionData, saveCreds, clearAuth);

      return sessionData;
    } catch (error) {
      console.error(`[${sessionId}] Error creating WhatsApp connection:`, error);
      
      // Clean up on error
      this.sessions.delete(sessionId);
      this.sessionQRs.delete(sessionId);
      
      throw error;
    }
  }

  /**
   * Setup event handlers for WhatsApp socket
   * @param sessionId - Session identifier
   * @param socket - WhatsApp socket
   * @param sessionData - Session data
   * @param saveCreds - Save credentials function
   * @param clearAuth - Clear auth function
   */
  private static setupEventHandlers(
    sessionId: string,
    socket: WASocket,
    sessionData: SessionData,
    saveCreds: () => Promise<void>,
    clearAuth: () => Promise<void>
  ): void {
    // Track reconnection attempts
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

    // Enhanced event handler for connection updates
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
          const qrImage = await qrcode.toDataURL(qr, {
            margin: 2,
            width: 256,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          });
          this.sessionQRs.set(sessionId, qrImage);
          await DatabaseService.updateSessionStatus(sessionId, 'waiting_qr_scan');
          console.log(`[${sessionId}] QR Code generated and stored`);
        } catch (qrError) {
          console.error(`[${sessionId}] Error generating QR code:`, qrError);
        }
      }
      
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`[${sessionId}] Connection closed:`, {
          statusCode,
          reason: Object.keys(DisconnectReason).find(key => (DisconnectReason as any)[key] === statusCode),
          shouldReconnect,
          error: lastDisconnect?.error?.message
        });
        
        await DatabaseService.updateSessionStatus(sessionId, 'disconnected');
        sessionData.isAuthenticated = false;
        this.sessionQRs.delete(sessionId);
        
        if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`[${sessionId}] Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts} in 5 seconds...`);
          setTimeout(() => {
            console.log(`[${sessionId}] Reconnecting...`);
            this.createConnection(sessionId, {}).catch(error => {
              console.error(`[${sessionId}] Reconnection failed:`, error);
            });
          }, 5000);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          console.log(`[${sessionId}] Max reconnection attempts reached, stopping reconnection`);
          this.sessions.delete(sessionId);
          this.sessionQRs.delete(sessionId);
        } else {
          console.log(`[${sessionId}] Session logged out, cleaning up...`);
          this.sessions.delete(sessionId);
          this.sessionQRs.delete(sessionId);
          // Clear auth data from database on logout
          await clearAuth();
        }
      } else if (connection === 'connecting') {
        console.log(`[${sessionId}] Connecting to WhatsApp...`);
        await DatabaseService.updateSessionStatus(sessionId, 'connecting');
      } else if (connection === 'open') {
        console.log(`[${sessionId}] WhatsApp connection opened successfully`);
        sessionData.isAuthenticated = true;
        reconnectAttempts = 0; // Reset reconnection attempts on successful connection
        this.sessionQRs.delete(sessionId);
        await DatabaseService.updateSessionStatus(sessionId, 'connected');
        
        // Get and log connection info
        try {
          const info = socket.user;
          console.log(`[${sessionId}] Authenticated as:`, {
            id: info?.id,
            name: info?.name,
            isOnline
          });
        } catch (error) {
          console.log(`[${sessionId}] Could not get user info:`, (error as Error).message);
        }
      }
    });

    // Enhanced event handler for credentials update
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        console.log(`[${sessionId}] Credentials updated and saved to database`);
      } catch (error) {
        console.error(`[${sessionId}] Error saving credentials:`, error);
      }
    });

    // Event handler for incoming messages
    socket.ev.on('messages.upsert', async (messageUpdate) => {
      const { messages } = messageUpdate;
      
      for (const message of messages) {
        if (message.key.fromMe) continue;
        
        const phoneNumber = message.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '');
        if (!phoneNumber) continue;
        
        let messageText = '';
        let messageType: MessageType = 'unknown';
        let metadata = {};
        
        if (message.message?.conversation) {
          messageText = message.message.conversation;
          messageType = 'text';
        } else if (message.message?.extendedTextMessage?.text) {
          messageText = message.message.extendedTextMessage.text;
          messageType = 'text';
        } else if (message.message?.imageMessage) {
          messageText = message.message.imageMessage.caption || '[Image]';
          messageType = 'image';
          metadata = {
            mimetype: message.message.imageMessage.mimetype,
            fileLength: message.message.imageMessage.fileLength
          };
        } else if (message.message?.documentMessage) {
          messageText = message.message.documentMessage.title || '[Document]';
          messageType = 'document';
          metadata = {
            fileName: message.message.documentMessage.fileName,
            mimetype: message.message.documentMessage.mimetype,
            fileLength: message.message.documentMessage.fileLength
          };
        } else if (message.message?.audioMessage) {
          messageText = '[Audio]';
          messageType = 'audio';
          metadata = {
            mimetype: message.message.audioMessage.mimetype,
            seconds: message.message.audioMessage.seconds
          };
        }
        
        await DatabaseService.saveChatHistory(
          sessionId, 
          phoneNumber, 
          messageText, 
          messageType, 
          'incoming', 
          metadata
        );
      }
    });
  }

  /**
   * Send message through WhatsApp
   * @param sessionId - Session identifier
   * @param jid - Target JID
   * @param message - Message content
   * @param options - Message options
   * @returns Message result
   */
  static async sendMessage(
    sessionId: string,
    jid: string,
    message: any,
    options: any = {}
  ) {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated || !sessionData.socket) {
      throw new Error('Session not found or not authenticated');
    }

    const result = await sessionData.socket.sendMessage(jid, message, options);
    
    // Save to database
    const phoneNumber = extractPhoneNumber(jid);
    const messageText = message.text || JSON.stringify(message);
    await DatabaseService.saveChatHistory(
      sessionId, 
      phoneNumber, 
      messageText, 
      'text', 
      'outgoing'
    );
    
    return result;
  }

  /**
   * Send poll message to group
   * @param sessionId - Session identifier
   * @param jid - Group JID
   * @param name - Poll question/name
   * @param options - Poll options array
   * @param selectableCount - Number of options user can select
   * @returns Message result
   */
  static async sendPoll(
    sessionId: string,
    jid: string,
    name: string,
    options: string[],
    selectableCount: number = 1
  ) {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated || !sessionData.socket) {
      throw new Error('Session not found or not authenticated');
    }

    // Create poll message
    const pollMessage = {
      poll: {
        name: name,
        values: options,
        selectableCount: selectableCount
      }
    };

    const result = await sessionData.socket.sendMessage(jid, pollMessage);
    
    // Save to database
    const phoneNumber = extractPhoneNumber(jid);
    const messageText = `Poll: ${name} - Options: ${options.join(', ')}`;
    await DatabaseService.saveChatHistory(
      sessionId, 
      phoneNumber, 
      messageText, 
      'poll', 
      'outgoing'
    );
    
    return result;
  }

  /**
   * Get list of groups that the bot is a member of
   * @param sessionId - Session identifier
   * @returns Array of group information
   */
  static async getGroups(sessionId: string) {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData || !sessionData.isAuthenticated || !sessionData.socket) {
      throw new Error('Session not found or not authenticated');
    }

    try {
      // Get all chats
      const chats = await sessionData.socket.groupFetchAllParticipating();
      
      // Format group information
      const groups = Object.values(chats).map(group => ({
        jid: group.id,
        name: group.subject,
        description: group.desc || '',
        participantsCount: group.participants?.length || 0,
        isAdmin: group.participants?.some(p => 
          p.id === sessionData.socket?.user?.id && 
          (p.admin === 'admin' || p.admin === 'superadmin')
        ) || false,
        createdAt: group.creation ? new Date(group.creation * 1000) : null,
        owner: group.owner || null
      }));

      return groups;
    } catch (error) {
      console.error('Error fetching groups:', error);
      throw new Error('Failed to fetch groups');
    }
  }

  /**
   * Delete session and cleanup
   * @param sessionId - Session identifier
   */
  static async deleteSession(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId);
    if (sessionData) {
      if (sessionData.socket) {
        try {
          await sessionData.socket.logout();
          await sessionData.socket.end(undefined);
        } catch (error) {
          console.error(`Error ending session ${sessionId}:`, error);
        }
      }
      
      // Clear auth data from database
      await DatabaseService.clearAuthData(sessionId);
      
      this.sessions.delete(sessionId);
      this.sessionQRs.delete(sessionId);
      
      await DatabaseService.updateSessionStatus(sessionId, 'logged_out');
    }
  }

  /**
   * Wait for QR code generation
   * @param sessionId - Session identifier
   * @param maxAttempts - Maximum attempts to wait
   * @returns QR code or authentication status
   */
  static async waitForQR(
    sessionId: string, 
    maxAttempts: number = 40
  ): Promise<string | 'authenticated' | null> {
    let attempts = 0;
    
    return new Promise((resolve) => {
      const checkQR = () => {
        const session = this.sessions.get(sessionId);
        const qr = this.sessionQRs.get(sessionId);
        
        if (qr) {
          console.log(`[${sessionId}] QR code found after ${attempts * 1000}ms`);
          resolve(qr);
        } else if (session && session.isAuthenticated) {
          console.log(`[${sessionId}] Session authenticated while waiting for QR`);
          resolve('authenticated');
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkQR, 1000);
        } else {
          console.log(`[${sessionId}] QR wait timeout after ${maxAttempts * 1000}ms`);
          resolve(null);
        }
      };
      checkQR();
    });
  }
} 