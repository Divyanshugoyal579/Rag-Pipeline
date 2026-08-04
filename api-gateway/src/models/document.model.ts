import { Schema, model } from 'mongoose';
import { IDocument } from '../types';

const documentSchema = new Schema<IDocument>(
  {
    filename: {
      type: String,
      required: true,
      unique: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const DocumentModel = model<IDocument>('Document', documentSchema);
export default DocumentModel;
