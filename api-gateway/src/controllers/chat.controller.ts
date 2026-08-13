import { Response, NextFunction } from 'express';
import axios from 'axios';
import { Conversation } from '../models/chat.model';
import { AuthenticatedRequest, IMessage } from '../types';
import { config } from '../config';
import logger from '../services/logger';

export const startConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { title } = req.body;
    const conversation = new Conversation({
      title: title || 'New Chat',
      userId: req.user.id,
      messages: [],
    });

    await conversation.save();
    logger.info(`Conversation started: ${conversation._id}`);

    res.status(201).json(conversation);
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const listConversations = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversations = await Conversation.find({ userId: req.user.id })
      .select('title createdAt updatedAt')
      .sort({ updatedAt: -1 });

    res.status(200).json(conversations);
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const getConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.status(200).json(conversation);
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const deleteConversation = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    logger.info(`Conversation deleted: ${req.params.id}`);
    res.status(200).json({ message: 'Conversation deleted successfully' });
    return;
  } catch (error) {
    next(error);
    return;
  }
};

export const chatStream = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { conversationId, query, filters } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId: req.user.id,
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Save user message to database
    const userMessage: IMessage = {
      sender: 'user',
      content: query,
      timestamp: new Date(),
    };
    conversation.messages.push(userMessage);
    await conversation.save();

    // Prepare headers for SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Build chat history for context to pass to the AI Service
    const history = conversation.messages.slice(0, -1).map((msg) => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    let responseData = '';
    let citations: any[] = [];

    logger.info(`Proxying chat query to FastAPI AI Service for conversation ${conversationId}`);

    const aiServiceResponse = await axios({
      method: 'POST',
      url: `${config.aiServiceUrl}/query`,
      data: {
        query,
        history,
        filters: filters || {},
      },
      responseType: 'stream',
    });

    // Pipe response chunks from AI service to Express client
    aiServiceResponse.data.on('data', (chunk: Buffer) => {
      // Forward the raw SSE chunk to the client
      res.write(chunk);

      // Accumulate assistant text from lines for MongoDB save
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const dataStr = line.substring(6).trim();
            if (dataStr === '[DONE]') continue;
            
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              responseData += parsed.text;
            }
            if (parsed.citations) {
              citations = parsed.citations;
            }
          } catch (e) {
            // Ignored, may be a partial JSON line or custom SSE frame
          }
        }
      }
    });

    aiServiceResponse.data.on('end', async () => {
      try {
        // Save assistant response once stream completes
        const assistantMessage: IMessage = {
          sender: 'assistant',
          content: responseData,
          citations: citations.map((c: any) => ({
            chunkId: c.chunk_id,
            source: c.source,
            page: c.page_number,
            score: c.score,
            snippet: c.content,
          })),
          timestamp: new Date(),
        };

        conversation.messages.push(assistantMessage);
        await conversation.save();

        logger.info(`Successfully stored conversation response for session: ${conversationId}`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err: any) {
        logger.error(`Error saving final response to conversation: ${err.message}`);
        res.end();
      }
    });

    aiServiceResponse.data.on('error', (err: Error) => {
      logger.error(`Error in stream from AI service: ${err.message}`);
      res.status(500).write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
      res.end();
    });

  } catch (error: any) {
    logger.error(`Chat Stream controller failure: ${error.message}`);
    next(error);
    return;
  }
};
