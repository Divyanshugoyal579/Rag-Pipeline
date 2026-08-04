import { Response, NextFunction } from 'express';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { AuthenticatedRequest } from '../types';
import { config } from '../config';
import logger from '../services/logger';

export const uploadDocument = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { originalname, path: filePath, mimetype } = req.file;

    // Generate a unique document ID
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const documentId = `doc-${uniqueSuffix}`;

    logger.info(`Proxying file upload to Spring Boot Document Service for doc: ${documentId}`);

    // Create form data to forward to Spring Boot
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath), {
      filename: originalname,
      contentType: mimetype,
    });
    formData.append('document_id', documentId);
    formData.append('uploaded_by', req.user.id);

    // Call Spring Boot service
    const springResponse = await axios.post(
      `${config.springServiceUrl}/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    // Clean up gateway's temporary upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.status(springResponse.status).json(springResponse.data);

  } catch (error: any) {
    // Make sure we clean up the file even if upload fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    logger.error(`Failed to forward upload to Spring Boot: ${error.message}`);
    next(error);
  }
};

export const listDocuments = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info(`Proxying listDocuments to Spring Boot Service`);
    const response = await axios.get(config.springServiceUrl, {
      params: {
        userId: req.user.id,
        role: req.user.role,
      },
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const docId = req.params.id;
    logger.info(`Proxying deleteDocument ${docId} to Spring Boot Service`);
    
    const response = await axios.delete(`${config.springServiceUrl}/${docId}`);
    return res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
};

export const getStats = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info(`Proxying getStats to Spring Boot Service`);
    const response = await axios.get(`${config.springServiceUrl}/stats`, {
      params: {
        userId: req.user.id,
        role: req.user.role,
      },
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    next(error);
  }
};
