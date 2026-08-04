import { Schema, model } from 'mongoose';
import { IConversation } from '../types';

const citationSchema = new Schema({
  chunkId: { type: String, required: true },
  source: { type: String, required: true },
  page: { type: Number },
  score: { type: Number },
  snippet: { type: String, required: true },
});

const messageSchema = new Schema({
  sender: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  citations: [citationSchema],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const conversationSchema = new Schema<IConversation>(
  {
    title: {
      type: String,
      required: true,
      default: 'New Chat',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messages: [messageSchema],
  },
  {
    timestamps: true,
  }
);

export const Conversation = model<IConversation>('Conversation', conversationSchema);
export default Conversation;
