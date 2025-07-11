import { SessionData, ConnectionOptions } from '@/types';
export declare class WhatsAppService {
    private static sessions;
    private static sessionQRs;
    static getSessions(): Map<string, SessionData>;
    static getSessionQRs(): Map<string, string>;
    static createConnection(sessionId: string, options?: ConnectionOptions): Promise<SessionData>;
    private static setupEventHandlers;
    static sendMessage(sessionId: string, jid: string, message: any, options?: any): Promise<import("@whiskeysockets/baileys").proto.WebMessageInfo | undefined>;
    static deleteSession(sessionId: string): Promise<void>;
    static waitForQR(sessionId: string, maxAttempts?: number): Promise<string | 'authenticated' | null>;
}
//# sourceMappingURL=whatsapp.d.ts.map