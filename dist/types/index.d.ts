import { WASocket } from '@whiskeysockets/baileys';
import { Request } from 'express';
export interface SessionData {
    socket: WASocket | null;
    isAuthenticated: boolean;
    authDir: string;
    status: SessionStatus;
    startTime: number;
}
export type SessionStatus = 'CONNECTING' | 'CONNECTED' | 'AUTHENTICATED' | 'DISCONNECTED' | 'CLOSING' | 'connecting' | 'waiting_qr_scan' | 'disconnected' | 'logged_out';
export interface ApiResponse<T = any> {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
}
export interface AuthenticatedRequest extends Request {
    apiKey?: string;
}
export interface SendMessageRequest {
    jid: string;
    type: 'number' | 'jid';
    message: any;
    options?: any;
}
export interface BulkMessageRequest extends SendMessageRequest {
    delay?: number;
}
export interface PollRequest {
    jid: string;
    type: 'number' | 'jid';
    name: string;
    options: string[];
    selectableCount?: number;
}
export interface ChatHistoryMessage {
    id: number;
    sessionId: string;
    phoneNumber: string;
    message: string;
    messageType: MessageType;
    direction: MessageDirection;
    metadata: any;
    timestamp: Date;
}
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'poll' | 'unknown';
export type MessageDirection = 'incoming' | 'outgoing';
export interface WhatsAppSession {
    id: number;
    sessionId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface PaginationQuery {
    page?: string;
    limit?: string;
    cursor?: string;
}
export interface ChatHistoryQuery extends PaginationQuery {
    search?: string;
}
export interface ContactQuery extends PaginationQuery {
    search?: string;
}
export interface SessionListResponse {
    id: string;
    status: SessionStatus;
}
export interface SessionStatusResponse {
    status: SessionStatus;
    qr?: string;
}
export interface QRResponse {
    success: boolean;
    qr?: string;
    message: string;
    sessionId: string;
    status: SessionStatus;
}
export interface ChatHistoryResponse {
    data: ChatHistoryMessage[];
    cursor: number | null;
    total?: number;
}
export interface SessionHistoryResponse {
    data: WhatsAppSession[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface ConnectionOptions {
    [key: string]: any;
}
export interface SessionCreateRequest {
    sessionId: string;
    [key: string]: any;
}
export interface ErrorResponse {
    success: false;
    message: string;
    error?: string;
    debug?: any;
}
export interface EnvConfig {
    PORT: number;
    API_KEYS: string[];
    DATABASE_URL?: string;
    NODE_ENV?: string;
}
//# sourceMappingURL=index.d.ts.map