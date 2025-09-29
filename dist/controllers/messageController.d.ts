import { Request, Response } from 'express';
export declare class MessageController {
    static sendMessage: (req: Request, res: Response, next: import("express").NextFunction) => void;
    static sendBulkMessages: (req: Request, res: Response, next: import("express").NextFunction) => void;
    static getChatHistory: (req: Request, res: Response, next: import("express").NextFunction) => void;
    static getContacts: (req: Request, res: Response, next: import("express").NextFunction) => void;
    static sendPoll: (req: Request, res: Response, next: import("express").NextFunction) => void;
    static getGroups: (req: Request, res: Response, next: import("express").NextFunction) => void;
}
//# sourceMappingURL=messageController.d.ts.map