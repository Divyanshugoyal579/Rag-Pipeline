import { Document, Types } from 'mongoose';
import { Request } from 'express';

export interface IUser extends Document {
  username: string;
  email: string;
  password?: string;
  role: 'admin' | 'user';
  refreshTokens: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IDocument extends Document {
  filename: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  uploadedBy: Types.ObjectId;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessage {
  sender: 'user' | 'assistant';
  content: string;
  citations?: {
    chunkId: string;
    source: string;
    page?: number;
    score?: number;
    snippet: string;
  }[];
  timestamp: Date;
}

export interface IConversation extends Document {
  title: string;
  userId: Types.ObjectId;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: 'admin' | 'user';
  };
}
