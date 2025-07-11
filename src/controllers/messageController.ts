import { Request, Response } from 'express';
import { 
  SendMessageRequest, 
  BulkMessageRequest,
  ChatHistoryQuery 
} from '@/types';
import { WhatsAppService, DatabaseService } from '@/services';
import { formatPhoneNumber, extractPhoneNumber, sleep } from '@/utils';
import { asyncHandler } from '@/middleware';

/**
 * Message Controller
 * Handles all message-related API endpoints
 */
export class MessageController {
  /**
   * POST /:sessionId/messages/send - Send single message
   */
  static sendMessage = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { jid, type, message, options = {} }: SendMessageRequest = req.body;
    
    const sessions = WhatsAppService.getSessions();
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
        targetJid = formatPhoneNumber(jid);
      }
      
      const result = await WhatsAppService.sendMessage(
        sessionId, 
        targetJid, 
        message, 
        options
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: (error as Error).message
      });
    }
  });

  /**
   * POST /:sessionId/messages/send/bulk - Send bulk messages
   */
  static sendBulkMessages = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const messages: BulkMessageRequest[] = req.body;
    
    const sessions = WhatsAppService.getSessions();
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
            await sleep(delay);
          }
          
          let targetJid = jid;
          if (type === 'number') {
            targetJid = formatPhoneNumber(jid);
          }
          
          const result = await WhatsAppService.sendMessage(
            sessionId, 
            targetJid, 
            message, 
            options
          );
          
          results.push({ index: i, result });
        } catch (error) {
          errors.push({ 
            index: i, 
            error: (error as Error).message 
          });
        }
      }
      
      res.json({ 
        success: true,
        results, 
        errors 
      });
    } catch (error) {
      console.error('Error sending bulk messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send bulk messages',
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /:sessionId/chats/:jid? - Get chat history
   */
  static getChatHistory = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, jid } = req.params;
    const { page = '1', limit = '25', cursor }: ChatHistoryQuery = req.query;
    
    try {
      let phoneNumber: string | undefined;
      
      if (jid) {
        phoneNumber = extractPhoneNumber(jid);
      }
      
      const result = await DatabaseService.getChatHistory(
        sessionId,
        phoneNumber,
        parseInt(page),
        parseInt(limit),
        cursor ? parseInt(cursor) : undefined
      );
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error fetching chat history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch chat history',
        error: (error as Error).message
      });
    }
  });

  /**
   * GET /:sessionId/contacts - Get contact list
   */
  static getContacts = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { limit = '25', cursor, search } = req.query;
    
    const sessions = WhatsAppService.getSessions();
    const sessionData = sessions.get(sessionId);
    
    if (!sessionData || !sessionData.isAuthenticated) {
      return res.status(400).json({
        success: false,
        message: 'Session not found or not authenticated'
      });
    }
    
    try {
      // For now, return empty array as contact implementation depends on Baileys store
      // This can be expanded later when implementing contact management
      res.json({
        success: true,
        data: [],
        cursor: null,
        message: 'Contact list feature not yet implemented'
      });
    } catch (error) {
      console.error('Error fetching contacts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch contacts',
        error: (error as Error).message
      });
    }
  });
} 