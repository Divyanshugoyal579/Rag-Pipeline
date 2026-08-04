import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  UploadCloud,
  FileText,
  Trash2,
  PieChart,
  User as UserIcon,
  LogOut,
  Send,
  Plus,
  ChevronRight,
  BookOpen,
  CheckCircle,
  AlertCircle,
  FileCode,
  Shield,
  Search,
  Filter
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar
} from 'recharts';
import { api, streamChatQuery, Citation } from './services/api';

// --- AUTH GUARDS ---
interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
}

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('accessToken');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('accessToken');
  const userJson = localStorage.getItem('user');
  const user: User | null = userJson ? JSON.parse(userJson) : null;
  
  if (!token || user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

// --- APP ROOT ---
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

// --- DASHBOARD LAYOUT & NAVIGATION ---
function DashboardLayout() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'chat' | 'admin' | 'upload'>('chat');

  useEffect(() => {
    const userJson = localStorage.getItem('user');
    if (userJson) setCurrentUser(JSON.parse(userJson));
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      setConversations(res.data);
      if (res.data.length > 0 && !currentChatId) {
        setCurrentChatId(res.data[0]._id);
      }
    } catch (err) {
      console.error('Failed to load chats', err);
    }
  };

  const handleCreateChat = async () => {
    try {
      const res = await api.post('/chat/conversation', { title: 'New Analysis' });
      setConversations([res.data, ...conversations]);
      setCurrentChatId(res.data._id);
      setView('chat');
    } catch (err) {
      console.error('Failed to start chat', err);
    }
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/chat/conversation/${id}`);
      const filtered = conversations.filter((c) => c._id !== id);
      setConversations(filtered);
      if (currentChatId === id) {
        setCurrentChatId(filtered.length > 0 ? filtered[0]._id : null);
      }
    } catch (err) {
      console.error('Failed to delete chat', err);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('refreshToken');
      await api.post('/auth/logout', { token });
    } catch (e) {
      // ignore
    }
    localStorage.clear();
    navigate('/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-oled-black">
      {/* Sidebar - Double Bezel Look */}
      <div className="w-80 border-r border-oled-border flex flex-col justify-between bg-[#080808]/90 backdrop-blur-xl z-20">
        <div>
          {/* Header - Brand */}
          <div className="p-6 border-b border-oled-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-purple flex items-center justify-center shadow-lg shadow-brand-purple/20">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg tracking-wide bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                SOVEREIGN
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-brand-emerald/30 bg-brand-emerald/10 text-brand-emerald font-medium uppercase tracking-wider">
              Hybrid RAG
            </span>
          </div>

          {/* New Chat Button */}
          <div className="p-4">
            <button
              onClick={handleCreateChat}
              className="group w-full py-3 px-4 rounded-xl border border-oled-border bg-white/5 hover:bg-brand-purple hover:border-brand-purple text-sm text-gray-300 hover:text-white font-medium flex items-center justify-between transition-spring-custom duration-500 active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span>New Conversation</span>
              </div>
              <ChevronRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Chat List */}
          <div className="px-3 overflow-y-auto max-h-[50vh]">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest px-3 block mb-2">
              Recent Queries
            </span>
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv._id}
                  onClick={() => {
                    setCurrentChatId(conv._id);
                    setView('chat');
                  }}
                  className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    currentChatId === conv._id && view === 'chat'
                      ? 'bg-white/10 text-white border border-white/5'
                      : 'hover:bg-white/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <MessageSquare className="w-4 h-4 flex-shrink-0 text-brand-purple" />
                    <span className="text-xs font-medium truncate">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteChat(conv._id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User Info / Navigation Controls */}
        <div className="p-4 border-t border-oled-border bg-[#050505] space-y-3">
          <div className="space-y-1">
            <button
              onClick={() => setView('chat')}
              className={`w-full py-2 px-3 rounded-lg text-left text-xs font-medium flex items-center gap-3 transition-colors ${
                view === 'chat' ? 'bg-brand-purple/20 text-brand-purple' : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>AI Chat Assistant</span>
            </button>
            <button
              onClick={() => setView('upload')}
              className={`w-full py-2 px-3 rounded-lg text-left text-xs font-medium flex items-center gap-3 transition-colors ${
                view === 'upload' ? 'bg-brand-purple/20 text-brand-purple' : 'text-gray-400 hover:bg-white/5'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>Document Upload</span>
            </button>
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setView('admin')}
                className={`w-full py-2 px-3 rounded-lg text-left text-xs font-medium flex items-center gap-3 transition-colors ${
                  view === 'admin' ? 'bg-brand-purple/20 text-brand-purple' : 'text-gray-400 hover:bg-white/5'
                }`}
              >
                <PieChart className="w-4 h-4" />
                <span>Admin Analytics</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-oled-border bg-white/5">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple text-xs font-bold uppercase border border-brand-purple/30">
                {currentUser?.username.substring(0, 2)}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-semibold text-gray-200 truncate">{currentUser?.username}</div>
                <div className="text-[9px] text-gray-500 truncate uppercase tracking-widest">
                  {currentUser?.role} Mode
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Container - Dynamic Views */}
      <div className="flex-1 flex flex-col relative min-h-screen bg-oled-black">
        <AnimatePresence mode="wait">
          {view === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col"
            >
              <ChatWorkspace chatId={currentChatId} key={currentChatId} />
            </motion.div>
          )}

          {view === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 overflow-y-auto"
            >
              <UploadPanel />
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 overflow-y-auto"
            >
              <AdminDashboard />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- CHAT WORKSPACE COMPONENT ---
function ChatWorkspace({ chatId }: { chatId: string | null }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatId) fetchMessages();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/chat/conversation/${chatId}`);
      setMessages(res.data.messages);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !chatId || loading) return;

    const userQuery = input;
    setInput('');
    setLoading(true);
    setStreamingText('');
    setStreamingCitations([]);

    // Optimistically insert user query in local state
    setMessages((prev) => [...prev, { sender: 'user', content: userQuery, timestamp: new Date() }]);

    // Trigger Stream
    await streamChatQuery({
      conversationId: chatId,
      query: userQuery,
      onToken: (token) => {
        setStreamingText((prev) => prev + token);
      },
      onCitations: (citations) => {
        setStreamingCitations(citations);
      },
      onError: (err) => {
        console.error(err);
        setLoading(false);
      },
      onDone: () => {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            content: streamingText,
            citations: streamingCitations,
            timestamp: new Date(),
          },
        ]);
        setStreamingText('');
        setStreamingCitations([]);
        setLoading(false);
      },
    });
  };

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <MessageSquare className="w-12 h-12 text-gray-600 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-gray-300">No Conversation Selected</h2>
        <p className="text-xs text-gray-500 max-w-sm mt-2">
          Click "New Conversation" in the sidebar to begin querying your Hybrid RAG documents.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Messaging Area */}
      <div className="flex-1 flex flex-col justify-between h-full bg-[#050505]">
        {/* Messages Header */}
        <div className="px-8 py-4 border-b border-oled-border flex items-center justify-between bg-[#080808]/60 backdrop-blur-md">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">System Gateway Terminal</h2>
            <div className="text-[10px] text-brand-emerald flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-emerald animate-ping"></span>
              <span>Vector Database & BM25 Ready</span>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.map((msg, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              key={idx}
              className={`flex gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple text-xs font-bold border border-brand-purple/30 flex-shrink-0">
                  AI
                </div>
              )}
              <div
                className={`max-w-[70%] p-4 rounded-2xl ${
                  msg.sender === 'user'
                    ? 'bg-brand-purple text-white rounded-tr-none'
                    : 'bg-white/5 border border-oled-border text-gray-200 rounded-tl-none'
                }`}
              >
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                {/* Inline Citations Viewer */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                    {msg.citations.map((cite: any, cidx: number) => (
                      <button
                        key={cidx}
                        onClick={() => setActiveCitation(cite)}
                        className="py-1 px-2.5 rounded-full bg-white/5 hover:bg-brand-purple/20 border border-white/5 text-[10px] text-gray-400 hover:text-brand-purple flex items-center gap-1.5 transition-colors"
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>Source [{cidx + 1}]: {cite.source.substring(0, 15)}...</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {/* Streaming Assistant Response */}
          {loading && streamingText && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple text-xs font-bold border border-brand-purple/30">
                AI
              </div>
              <div className="max-w-[70%] p-4 rounded-2xl bg-white/5 border border-oled-border text-gray-200 rounded-tl-none">
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{streamingText}</p>
              </div>
            </div>
          )}

          {/* Loader Skeleton */}
          {loading && !streamingText && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center border border-brand-purple/30 animate-spin">
                ..
              </div>
              <div className="w-[50%] p-4 rounded-2xl bg-white/5 border border-oled-border space-y-2">
                <div className="h-3 bg-white/10 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-white/10 rounded w-[80%] animate-pulse"></div>
                <div className="h-3 bg-white/10 rounded w-[60%] animate-pulse"></div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar - Double Bezel Layout */}
        <div className="p-8 border-t border-oled-border bg-[#080808]/60 backdrop-blur-md">
          <form onSubmit={handleSend} className="outer-shell">
            <div className="inner-core flex items-center px-4 py-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Sovereign terminal (e.g. summarize document X, compare data segments)..."
                className="flex-1 bg-transparent border-none outline-none text-xs text-gray-200 placeholder-gray-600 py-2"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-8 h-8 rounded-lg bg-brand-purple disabled:bg-white/5 text-white disabled:text-gray-600 flex items-center justify-center transition-colors shadow-lg shadow-brand-purple/20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sliding Citation Drawer (Right Side) */}
      <AnimatePresence>
        {activeCitation && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-96 border-l border-oled-border bg-[#080808] p-6 flex flex-col justify-between h-full z-10"
          >
            <div>
              <div className="flex items-center justify-between border-b border-oled-border pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-purple" />
                  <h3 className="font-semibold text-sm text-gray-200">Citation Inspector</h3>
                </div>
                <button
                  onClick={() => setActiveCitation(null)}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2.5 py-1 rounded-md hover:bg-white/5 transition-colors border border-oled-border"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                    Metadata Source
                  </label>
                  <div className="p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-300 font-medium truncate">
                    {activeCitation.source}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                      Page Segment
                    </label>
                    <div className="p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-300 font-medium">
                      Page {activeCitation.page_number || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                      Relevance Match
                    </label>
                    <div className="p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-brand-emerald font-medium">
                      {activeCitation.score ? `${Math.round(activeCitation.score * 100)}%` : 'N/A'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                    Retrieved Text Snippet
                  </label>
                  <div className="p-4 rounded-xl bg-black border border-oled-border text-xs leading-relaxed text-gray-300 font-mono overflow-y-auto max-h-[40vh] whitespace-pre-wrap">
                    {activeCitation.snippet}
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-gray-600 text-center border-t border-oled-border pt-4">
              Unique ID: {activeCitation.chunkId}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- DOCUMENT UPLOAD PANEL COMPONENT ---
function UploadPanel() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [ingestedCount, setIngestedCount] = useState(0);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processUpload(e.target.files[0]);
    }
  };

  const processUpload = async (file: File) => {
    setUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setUploadStatus('success');
      setIngestedCount((prev) => prev + 1);
    } catch (err: any) {
      setUploadStatus('error');
      setErrorMessage(err.response?.data?.error || 'Ingestion request failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-12 space-y-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Ingestion Engine Panel</h2>
        <p className="text-xs text-gray-500 mt-1.5">
          Ingest unstructured PDF, Word DOCX, Markdown, or TXT documentation. Files are chunked and indexed semantically.
        </p>
      </div>

      {/* Double Bezel Upload Zone */}
      <div className="outer-shell">
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`inner-core p-12 text-center border-2 border-dashed ${
            dragActive ? 'border-brand-purple bg-brand-purple/5' : 'border-oled-border'
          } rounded-xl relative flex flex-col items-center justify-center cursor-pointer transition-all duration-300`}
        >
          <input
            type="file"
            onChange={handleFileInput}
            accept=".pdf,.docx,.md,.txt"
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          <UploadCloud className="w-12 h-12 text-brand-purple mb-4" />
          <h3 className="text-sm font-semibold text-gray-200">Drag & Drop document files here</h3>
          <p className="text-[10px] text-gray-600 mt-1">Supports PDF, DOCX, Markdown, TXT up to 50MB</p>
        </div>
      </div>

      {/* Processing States */}
      <AnimatePresence>
        {uploading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-oled-border bg-white/5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-brand-purple border-t-transparent animate-spin"></div>
              <span className="text-xs text-gray-300">Pushing file chunks to pgvector + Elasticsearch...</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-brand-purple/20 text-brand-purple animate-pulse">
              Processing
            </span>
          </motion.div>
        )}

        {uploadStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-brand-emerald/20 bg-brand-emerald/5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-brand-emerald" />
              <span className="text-xs text-gray-300">File uploaded and queued for background semantic indexing.</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-brand-emerald/20 text-brand-emerald font-medium">
              Success
            </span>
          </motion.div>
        )}

        {uploadStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-xs text-gray-300">Failed to ingest: {errorMessage}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-500 font-medium">
              Error
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- ADMIN & ANALYTICS DASHBOARD ---
function AdminDashboard() {
  const [stats, setStats] = useState<any>({ total: 0, completed: 0, failed: 0, processing: 0 });
  const [documents, setDocuments] = useState<any[]>([]);

  // Simulated query trends data for analytics demo
  const queryTrends = [
    { name: '10:00', queries: 24, latency: 120 },
    { name: '11:00', queries: 35, latency: 98 },
    { name: '12:00', queries: 48, latency: 110 },
    { name: '13:00', queries: 60, latency: 140 },
    { name: '14:00', queries: 55, latency: 105 },
    { name: '15:00', queries: 72, latency: 95 },
  ];

  const distributionData = [
    { name: 'Semantic', value: 85 },
    { name: 'BM25 Exact', value: 15 },
  ];

  useEffect(() => {
    fetchStats();
    fetchDocuments();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get('/documents/stats');
      setStats(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await api.get('/documents');
      setDocuments(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await api.delete(`/documents/${id}`);
      setDocuments(documents.filter((d) => d._id !== id));
      fetchStats();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-12 space-y-12">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">System Admin & Performance Dashboard</h2>
        <p className="text-xs text-gray-500 mt-1.5">
          Real-time metrics, document ingestion queues, search index volumes, and retrieval performance trends.
        </p>
      </div>

      {/* KPI Stats Cards - Double Bezel Look */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="outer-shell">
          <div className="inner-core p-6">
            <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Total Documents</span>
            <div className="text-2xl font-bold text-gray-200 mt-2">{stats.total}</div>
          </div>
        </div>

        <div className="outer-shell">
          <div className="inner-core p-6">
            <span className="text-[10px] text-brand-emerald uppercase font-semibold tracking-wider">Completed Indexes</span>
            <div className="text-2xl font-bold text-brand-emerald mt-2">{stats.completed}</div>
          </div>
        </div>

        <div className="outer-shell">
          <div className="inner-core p-6">
            <span className="text-[10px] text-brand-purple uppercase font-semibold tracking-wider">In Process</span>
            <div className="text-2xl font-bold text-brand-purple mt-2">{stats.processing}</div>
          </div>
        </div>

        <div className="outer-shell">
          <div className="inner-core p-6">
            <span className="text-[10px] text-red-500 uppercase font-semibold tracking-wider">Failed Parsings</span>
            <div className="text-2xl font-bold text-red-500 mt-2">{stats.failed}</div>
          </div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="outer-shell">
          <div className="inner-core p-6 space-y-4">
            <h3 className="text-xs font-semibold text-gray-300">API Gateway Query Flow Rate (1h resolution)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={queryTrends}>
                  <defs>
                    <linearGradient id="queryGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#334155" fontSize={10} />
                  <YAxis stroke="#334155" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 10 }} />
                  <Area type="monotone" dataKey="queries" stroke="#6366f1" fillOpacity={1} fill="url(#queryGlow)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="outer-shell">
          <div className="inner-core p-6 space-y-4">
            <h3 className="text-xs font-semibold text-gray-300">Retrieval Latency Trend (ms)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={queryTrends}>
                  <XAxis dataKey="name" stroke="#334155" fontSize={10} />
                  <YAxis stroke="#334155" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 10 }} />
                  <Bar dataKey="latency" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Documents Index Inventory */}
      <div className="outer-shell">
        <div className="inner-core p-6">
          <h3 className="text-xs font-semibold text-gray-300 mb-6">Document Index Ingestion Log</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-oled-border text-gray-500 font-semibold uppercase tracking-wider">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Size</th>
                  <th className="pb-3">Ingestion Status</th>
                  <th className="pb-3">Uploaded Date</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-oled-border">
                {documents.map((doc) => (
                  <tr key={doc._id} className="text-gray-300 hover:bg-white/5 transition-colors">
                    <td className="py-3.5 flex items-center gap-3">
                      <FileCode className="w-4 h-4 text-brand-purple" />
                      <span className="font-medium truncate max-w-xs">{doc.originalName}</span>
                    </td>
                    <td className="py-3.5">{(doc.fileSize / (1024 * 1024)).toFixed(2)} MB</td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          doc.status === 'completed'
                            ? 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20'
                            : doc.status === 'failed'
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                            : 'bg-brand-purple/10 text-brand-purple border border-brand-purple/20'
                        }`}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td className="py-3.5">{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td className="py-3.5 text-right">
                      <button
                        onClick={() => handleDeleteDoc(doc._id)}
                        className="p-1 hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- LOGIN COMPONENT ---
function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', { email, password });
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#050505] p-6 relative">
      <div className="absolute top-10 left-10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-purple flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm tracking-wide text-gray-200">SOVEREIGN</span>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md outer-shell"
      >
        <div className="inner-core p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-white">Log in to Sovereign</h2>
            <p className="text-xs text-gray-500">Access your secure enterprise document assistant.</p>
          </div>

          {error && (
            <div className="p-3 text-xs rounded bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-200 placeholder-gray-600 focus:border-brand-purple outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-200 placeholder-gray-600 focus:border-brand-purple outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-brand-purple hover:bg-brand-purple/90 disabled:bg-white/5 text-xs text-white disabled:text-gray-500 font-semibold transition-colors duration-300 shadow-lg shadow-brand-purple/20"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center">
            <span className="text-xs text-gray-600">Don't have an account? </span>
            <button onClick={() => navigate('/register')} className="text-xs text-brand-purple hover:underline">
              Create one
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// --- REGISTER COMPONENT ---
function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/register', { username, email, password, role });
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#050505] p-6 relative">
      <div className="absolute top-10 left-10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-purple flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm tracking-wide text-gray-200">SOVEREIGN</span>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md outer-shell"
      >
        <div className="inner-core p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-white">Create an Account</h2>
            <p className="text-xs text-gray-500">Register for the Sovereign enterprise hybrid search console.</p>
          </div>

          {error && (
            <div className="p-3 text-xs rounded bg-red-500/10 border border-red-500/20 text-red-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                className="w-full p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-200 placeholder-gray-600 focus:border-brand-purple outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-200 placeholder-gray-600 focus:border-brand-purple outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-200 placeholder-gray-600 focus:border-brand-purple outline-none transition-colors"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold block mb-1">
                Default Access Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
                className="w-full p-3 rounded-lg bg-white/5 border border-oled-border text-xs text-gray-300 focus:border-brand-purple outline-none transition-colors"
              >
                <option value="user">User Mode (Upload & Query)</option>
                <option value="admin">Admin Mode (Full Controls + Analytics)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-brand-purple hover:bg-brand-purple/90 disabled:bg-white/5 text-xs text-white disabled:text-gray-500 font-semibold transition-colors duration-300 shadow-lg shadow-brand-purple/20"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          <div className="text-center">
            <span className="text-xs text-gray-600">Already have an account? </span>
            <button onClick={() => navigate('/login')} className="text-xs text-brand-purple hover:underline">
              Log in
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
