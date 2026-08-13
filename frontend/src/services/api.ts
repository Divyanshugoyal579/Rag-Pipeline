import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject Bearer Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor for Token Refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshTkn = localStorage.getItem('refreshToken');
        if (!refreshTkn) throw new Error('No refresh token available');

        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          token: refreshTkn,
        });

        const { accessToken, refreshToken } = res.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed: clear storage and redirect
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

// Interface representing citations returned from retrieval
export interface Citation {
  chunkId: string;
  source: string;
  page_number?: number;
  score?: number;
  snippet: string;
}

// SSE Chat streaming interface parameters
export interface StreamChatParams {
  conversationId: string;
  query: string;
  filters?: Record<string, any>;
  onToken: (token: string) => void;
  onCitations: (citations: Citation[]) => void;
  onError: (err: string) => void;
  onDone: () => void;
}

/**
 * Handle real-time chat streaming using browser fetch and stream reader.
 */
export const streamChatQuery = async ({
  conversationId,
  query,
  filters,
  onToken,
  onCitations,
  onError,
  onDone,
}: StreamChatParams) => {
  const token = localStorage.getItem('accessToken');
  
  try {
    const response = await fetch(`${API_BASE_URL}/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId,
        query,
        filters,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Readable stream not supported by response');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith('data: ')) {
          const dataStr = cleaned.slice(6).trim();
          if (dataStr === '[DONE]') {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              onToken(parsed.text);
            }
            if (parsed.citations) {
              onCitations(parsed.citations);
            }
            if (parsed.error) {
              onError(parsed.error);
            }
          } catch (e) {
            // Ignored, SSE packet could be fragmented
          }
        }
      }
    }
  } catch (error: any) {
    onError(error.message || 'Network stream error');
  }
};
