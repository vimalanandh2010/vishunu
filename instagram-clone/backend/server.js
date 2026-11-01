import './config/env.js'; // Must be first — loads .env before any module reads process.env
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import xssClean from 'xss-clean';

import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import storyRoutes from './routes/storyRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { generalLimiter } from './middleware/rateLimitMiddleware.js';
import {
  enqueueMatchmaking,
  cancelMatchmaking,
  acceptStrangerIntroduction,
  sendRandomChatMessage,
  endRandomChatSession,
  nextStrangerSession,
  reportStrangerSession,
  blockStrangerSession,
  reconnectRandomSession,
  handleVideoSignal,
  handleSwitchToTextRequest,
  handleSwitchToTextResponse,
  handleRandomDisconnect,
} from './services/randomConnectService.js';

// Connect to MongoDB (vlove)
connectDB();

const app = express();

// Security & parsing middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xssClean());

// Rate limit all API routes
app.use('/api', generalLimiter);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'instagram-clone-api' });
});

// Serve locally-stored uploads (fallback when Cloudinary is not configured).
// SECURITY NOTE: These files are publicly accessible by URL without
// authentication, which mirrors the behaviour of Cloudinary URLs.
// Accepted risk: media on this platform is intended to be viewable by followers
// and (for public profiles) anyone. If private-account media must be
// access-controlled, move to signed Cloudinary URLs or a gated /api route.
app.use('/uploads', express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads')));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);


// 404 + centralized error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: [process.env.CLIENT_URL || 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
  },
});

global.io = io;
// Map<userId, Set<socketId>> — tracks all active socket connections per user.
// Using a Set handles multiple browser tabs correctly: a second tab adds a
// second socketId rather than overwriting the first; disconnecting one tab
// removes only that socketId and leaves the others intact.
global.activeUsers = new Map();

/**
 * Emit an event to every active socket owned by userId.
 * Used by controllers instead of calling global.activeUsers.get() directly.
 */
global.emitToUser = (userId, event, payload) => {
  const sockets = global.activeUsers.get(String(userId));
  if (sockets && global.io) {
    sockets.forEach((sid) => global.io.to(sid).emit(event, payload));
  }
};

io.on('connection', (socket) => {
  // SECURITY NOTE: userId is supplied by the client as a query-string parameter
  // and is therefore untrusted. We use it only as a best-effort mapping for
  // real-time event delivery; all sensitive operations are still gated by the
  // HTTP auth middleware on REST routes. An attacker who forges a userId can
  // receive real-time events for that socket but cannot read/write any database
  // records without a valid JWT cookie on the REST layer.
  const userId = socket.handshake.query.userId;
  const validId = userId && typeof userId === 'string' && /^[a-f\d]{24}$/i.test(userId);

  if (validId) {
    if (!global.activeUsers.has(userId)) {
      global.activeUsers.set(userId, new Set());
      // Broadcast online status
      socket.broadcast.emit('user_status_change', { userId, isOnline: true });
    }
    global.activeUsers.get(userId).add(socket.id);
  }

  socket.on('error', (err) => {
    console.error('[Socket] socket error:', err.message);
  });

  socket.on('typing', ({ conversationId, receiverId }) => {
    if (receiverId) global.emitToUser(receiverId, 'user_typing', { conversationId, senderId: userId });
  });

  socket.on('stop_typing', ({ conversationId, receiverId }) => {
    if (receiverId) global.emitToUser(receiverId, 'user_stop_typing', { conversationId, senderId: userId });
  });

  // ── WebRTC Calling Signaling ─────────────────────────────────
  socket.on('call_user', ({ to, offer, callType, callerName, callerAvatar, conversationId }) => {
    if (to) {
      global.emitToUser(to, 'incoming_call', {
        from: userId,
        offer,
        callType, // 'audio' | 'video'
        callerName,
        callerAvatar,
        conversationId,
      });
    }
  });

  socket.on('call_answer', ({ to, answer }) => {
    if (to) {
      global.emitToUser(to, 'call_accepted', { from: userId, answer });
    }
  });

  socket.on('ice_candidate', ({ to, candidate }) => {
    if (to) {
      global.emitToUser(to, 'ice_candidate', { from: userId, candidate });
    }
  });

  socket.on('call_reject', ({ to, reason, conversationId, callType }) => {
    if (to) {
      global.emitToUser(to, 'call_rejected', { from: userId, reason, conversationId, callType });
    }
  });

  socket.on('call_end', ({ to, conversationId, duration, callType }) => {
    if (to) {
      global.emitToUser(to, 'call_ended', { from: userId, conversationId, duration, callType });
    }
  });

  // ── Random Connect / Matchmaking Handlers ──────────────────
  socket.on('start_random_matchmaking', ({ mode }) => {
    enqueueMatchmaking(io, socket, { mode, userId });
  });

  socket.on('cancel_random_matchmaking', () => {
    cancelMatchmaking(socket, userId);
  });

  socket.on('accept_stranger_introduction', ({ matchId }) => {
    acceptStrangerIntroduction(io, socket, { matchId });
  });

  socket.on('send_random_message', ({ sessionId, text }) => {
    sendRandomChatMessage(io, socket, { sessionId, text });
  });

  socket.on('end_random_chat', ({ sessionId, reason }) => {
    endRandomChatSession(io, socket, { sessionId, reason });
  });

  socket.on('next_random_stranger', ({ sessionId, mode }) => {
    nextStrangerSession(io, socket, { sessionId, userId, mode });
  });

  socket.on('report_random_stranger', ({ sessionId, reason, description }) => {
    reportStrangerSession(io, socket, { sessionId, reporterUserId: userId, reason, description });
  });

  socket.on('block_random_stranger', ({ sessionId }) => {
    blockStrangerSession(io, socket, { sessionId, blockerUserId: userId });
  });

  socket.on('reconnect_random_session', ({ sessionId }) => {
    reconnectRandomSession(io, socket, { sessionId, userId });
  });

  // ── Random Video Chat WebRTC Signaling ─────────────────────
  socket.on('random_video_signal', ({ sessionId, type, data }) => {
    handleVideoSignal(socket, { sessionId, type, data });
  });

  socket.on('request_switch_to_text', ({ sessionId }) => {
    handleSwitchToTextRequest(socket, { sessionId });
  });

  socket.on('respond_switch_to_text', ({ sessionId, accepted }) => {
    handleSwitchToTextResponse(io, socket, { sessionId, accepted });
  });

  socket.on('random_ping', (timestamp) => {
    socket.emit('random_pong', timestamp);
  });

  socket.on('disconnect', () => {
    handleRandomDisconnect(io, socket);
    if (validId) {
      const sockets = global.activeUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          global.activeUsers.delete(userId);
          const now = new Date();
          // Broadcast offline status
          socket.broadcast.emit('user_status_change', { userId, isOnline: false, lastSeen: now });
          // Update user lastSeen in database quietly
          import('./models/User.js').then(({ default: UserModel }) => {
            UserModel.findByIdAndUpdate(userId, { lastSeen: now }).catch(() => {});
          });
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(
    `Server running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`
  );
});
