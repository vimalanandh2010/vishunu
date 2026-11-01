/**
 * Enhanced Random Connect & Anonymous Real-Time Text Chat Session Service
 * 
 * Securely manages:
 * - In-memory matchmaking queue separated by mode ('text' | 'video')
 * - Real-time anonymous text chat sessions (zero permanent DB storage)
 * - Anti-rematch exclusion rules and user block relationships
 * - Real-time ping/pong connection quality
 * - Moderation reports (with 14-day restriction tracking)
 * - Safe session termination and disconnection handling
 */

// Queues by mode: 'text' | 'video'
// Array of { socketId, userId, mode, queuedAt, exclusions: Set<userId> }
const waitingQueues = {
  text: [],
  video: [],
};

// Map of active chat sessions: sessionId -> SessionObject
const activeSessions = new Map();

// Map of user exclusions: userId -> Set<excludedUserId> (e.g. from "Next Stranger" or blocks)
const userExclusions = new Map();

// Map of user blocks: userId -> Set<blockedUserId>
const userBlocks = new Map();

// Map of user report logs: userId (reported) -> Array<{ reporterId, reason, description, timestamp }>
const reportStore = new Map();

// Map of user restrictions: userId -> restrictionExpiresTimestamp
const userRestrictions = new Map();

// Helper to generate a random 4-digit temporary username
function generateTempUsername() {
  const randNum = Math.floor(1000 + Math.random() * 9000);
  return `Stranger_${randNum}`;
}

export function getUserExclusions(userId) {
  if (!userExclusions.has(userId)) {
    userExclusions.set(userId, new Set());
  }
  return userExclusions.get(userId);
}

export function addExclusion(userId, otherUserId) {
  if (!userId || !otherUserId) return;
  getUserExclusions(userId).add(otherUserId);
  getUserExclusions(otherUserId).add(userId);
}

export function addBlock(userId, blockedUserId) {
  if (!userId || !blockedUserId) return;
  if (!userBlocks.has(userId)) userBlocks.set(userId, new Set());
  userBlocks.get(userId).add(blockedUserId);
  addExclusion(userId, blockedUserId);
}

export function isBlockedOrExcluded(u1, u2) {
  if (u1 === u2) return true;
  if (userBlocks.has(u1) && userBlocks.get(u1).has(u2)) return true;
  if (userBlocks.has(u2) && userBlocks.get(u2).has(u1)) return true;
  if (userExclusions.has(u1) && userExclusions.get(u1).has(u2)) return true;
  return false;
}

export function checkUserRestriction(userId) {
  if (!userId) return false;
  const expires = userRestrictions.get(userId);
  if (expires) {
    if (Date.now() < expires) {
      return true; // Still restricted
    }
    userRestrictions.delete(userId); // Expired
  }
  return false;
}

/**
 * Remove user from waiting matchmaking queues
 */
export function removeUserFromQueue(socketId, userId) {
  for (const mode of ['text', 'video']) {
    waitingQueues[mode] = waitingQueues[mode].filter(
      (entry) => entry.socketId !== socketId && (!userId || entry.userId !== userId)
    );
  }
}

/**
 * Handle user requesting matchmaking with exclusion support
 */
export function enqueueMatchmaking(io, socket, { mode = 'text', userId }) {
  const validMode = mode === 'video' ? 'video' : 'text';

  // Check 14-day restriction
  if (checkUserRestriction(userId)) {
    socket.emit('match_error', {
      message: 'Your account is temporarily restricted from Random Connect due to community reports.',
    });
    return;
  }

  // 1. Remove if already queued
  removeUserFromQueue(socket.id, userId);

  // 2. Search queue for an eligible partner (not self, not blocked, not excluded)
  const queue = waitingQueues[validMode];
  let matchedIndex = -1;

  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    const candidateSocket = io.sockets.sockets.get(candidate.socketId);

    // Validate socket connection and eligibility
    if (candidateSocket && candidateSocket.connected) {
      if (!isBlockedOrExcluded(userId, candidate.userId)) {
        matchedIndex = i;
        break;
      }
    }
  }

  if (matchedIndex !== -1) {
    const candidate = queue.splice(matchedIndex, 1)[0];
    const candidateSocket = io.sockets.sockets.get(candidate.socketId);

    if (candidateSocket && candidateSocket.connected) {
      const matchId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const user1TempName = generateTempUsername();
      let user2TempName = generateTempUsername();
      while (user2TempName === user1TempName) {
        user2TempName = generateTempUsername();
      }

      // 30-second introduction timer
      const timeoutTimer = setTimeout(() => {
        handleIntroductionTimeout(io, matchId);
      }, 30 * 1000);

      const session = {
        sessionId: matchId,
        matchId,
        mode: validMode,
        status: 'matched', // 'matched' | 'confirmed' | 'active' | 'terminated'
        createdAt: new Date(),
        updatedAt: new Date(),
        timeoutTimer,
        disconnectTimer: null,
        users: [
          {
            socketId: candidate.socketId,
            userId: candidate.userId,
            tempName: user1TempName,
            ready: false,
            connected: true,
          },
          {
            socketId: socket.id,
            userId,
            tempName: user2TempName,
            ready: false,
            connected: true,
          },
        ],
        messages: [], // Kept in memory only for active session
      };

      activeSessions.set(matchId, session);

      // Sockets join room
      candidateSocket.join(matchId);
      socket.join(matchId);

      // Notify both participants
      candidateSocket.emit('random_match_found', {
        matchId,
        sessionId: matchId,
        mode: validMode,
        strangerTempName: user2TempName,
        myTempName: user1TempName,
        timeoutSec: 30,
      });

      socket.emit('random_match_found', {
        matchId,
        sessionId: matchId,
        mode: validMode,
        strangerTempName: user1TempName,
        myTempName: user2TempName,
        timeoutSec: 30,
      });

      return;
    }
  }

  // No eligible partner found yet -> add to queue
  queue.push({
    socketId: socket.id,
    userId,
    mode: validMode,
    queuedAt: Date.now(),
  });

  socket.emit('matchmaking_queued', { mode: validMode });
}

/**
 * User aborts matchmaking queue
 */
export function cancelMatchmaking(socket, userId) {
  removeUserFromQueue(socket.id, userId);
  socket.emit('matchmaking_cancelled');
}

/**
 * Handle user clicking "Start Chatting" during stranger intro
 */
export function acceptStrangerIntroduction(io, socket, { matchId }) {
  const session = activeSessions.get(matchId);
  if (!session || (session.status !== 'matched' && session.status !== 'confirmed')) {
    socket.emit('match_error', { message: 'This match is no longer active.' });
    return;
  }

  const userEntry = session.users.find((u) => u.socketId === socket.id);
  if (!userEntry) {
    socket.emit('match_error', { message: 'Not authorized for this session.' });
    return;
  }

  if (userEntry.ready) return;
  userEntry.ready = true;

  const allReady = session.users.every((u) => u.ready);
  if (allReady) {
    clearTimeout(session.timeoutTimer);
    session.status = 'active';
    session.updatedAt = new Date();

    // Broadcast chat ready to both users
    const u1 = session.users[0];
    const u2 = session.users[1];

    const s1 = io.sockets.sockets.get(u1.socketId);
    const s2 = io.sockets.sockets.get(u2.socketId);

    if (s1) {
      s1.emit('random_chat_ready', {
        sessionId: session.sessionId,
        matchId: session.sessionId,
        mode: session.mode,
        myTempName: u1.tempName,
        strangerTempName: u2.tempName,
      });
    }

    if (s2) {
      s2.emit('random_chat_ready', {
        sessionId: session.sessionId,
        matchId: session.sessionId,
        mode: session.mode,
        myTempName: u2.tempName,
        strangerTempName: u1.tempName,
      });
    }
  } else {
    socket.to(matchId).emit('stranger_waiting_confirmation', { matchId });
  }
}

/**
 * 30-Second Introduction Timeout
 */
function handleIntroductionTimeout(io, matchId) {
  const session = activeSessions.get(matchId);
  if (!session) return;

  if (session.status === 'matched') {
    session.status = 'terminated';
    clearTimeout(session.timeoutTimer);

    io.to(matchId).emit('stranger_intro_timeout', {
      matchId,
      message: "The stranger didn't respond. Find someone else?",
    });

    activeSessions.delete(matchId);
  }
}

/**
 * Send real-time anonymous text message
 */
export function sendRandomChatMessage(io, socket, { sessionId, text }) {
  if (!text || typeof text !== 'string') return;
  const cleanText = text.trim();
  if (!cleanText) return;

  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'active') {
    socket.emit('random_chat_error', { message: 'Chat session is not active.' });
    return;
  }

  const sender = session.users.find((u) => u.socketId === socket.id);
  if (!sender) {
    socket.emit('random_chat_error', { message: 'Unauthorized message sender.' });
    return;
  }

  const msgPayload = {
    id: `rc_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sessionId,
    senderTempName: sender.tempName,
    text: cleanText,
    createdAt: new Date().toISOString(),
  };

  // Keep in temporary session memory only (never written to MongoDB)
  session.messages.push(msgPayload);
  session.updatedAt = new Date();

  // Broadcast to both users in room
  io.to(sessionId).emit('random_message_received', msgPayload);
}

/**
 * End Random Chat (Phase 5)
 */
export function endRandomChatSession(io, socket, { sessionId, reason = 'User ended chat' }) {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const caller = session.users.find((u) => u.socketId === socket.id);
  session.status = 'terminated';

  // Notify other participant
  socket.to(sessionId).emit('random_chat_ended', {
    sessionId,
    reason: caller ? 'Stranger has left the chat.' : reason,
  });

  // Clean up
  clearTimeout(session.timeoutTimer);
  clearTimeout(session.disconnectTimer);
  activeSessions.delete(sessionId);
}

/**
 * Next Stranger (Phase 6)
 */
export function nextStrangerSession(io, socket, { sessionId, userId, mode = 'text' }) {
  const session = activeSessions.get(sessionId);
  if (session) {
    const caller = session.users.find((u) => u.userId === userId);
    const other = session.users.find((u) => u.userId !== userId);

    // Add exclusion rule so previous stranger is not matched again immediately
    if (caller && other) {
      addExclusion(caller.userId, other.userId);
    }

    session.status = 'terminated';
    socket.to(sessionId).emit('random_chat_ended', {
      sessionId,
      reason: 'Stranger has moved to the next match.',
    });

    clearTimeout(session.timeoutTimer);
    clearTimeout(session.disconnectTimer);
    activeSessions.delete(sessionId);
  }

  // Start fresh matchmaking immediately for caller
  enqueueMatchmaking(io, socket, { mode, userId });
}

/**
 * Report Stranger (Phase 7)
 */
export function reportStrangerSession(io, socket, { sessionId, reporterUserId, reason, description }) {
  const session = activeSessions.get(sessionId);
  let reportedUserId = null;

  if (session) {
    const other = session.users.find((u) => u.userId !== reporterUserId);
    if (other) reportedUserId = other.userId;
  }

  if (reportedUserId) {
    // Add to exclusions & block
    addBlock(reporterUserId, reportedUserId);

    // Store report
    if (!reportStore.has(reportedUserId)) {
      reportStore.set(reportedUserId, []);
    }
    const reports = reportStore.get(reportedUserId);
    reports.push({
      reporterId: reporterUserId,
      reason: reason || 'Other',
      description: description || '',
      timestamp: Date.now(),
    });

    // If 3+ reports received within 7 days, trigger 14-day temporary restriction
    const recentReports = reports.filter((r) => Date.now() - r.timestamp < 7 * 24 * 60 * 60 * 1000);
    if (recentReports.length >= 3) {
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      userRestrictions.set(reportedUserId, Date.now() + fourteenDaysMs);
      console.log(`[Moderation] User ${reportedUserId} restricted for 14 days due to multiple reports.`);
    }

    // End session quietly for reported stranger
    endRandomChatSession(io, socket, { sessionId, reason: 'Session terminated following report.' });
  }

  socket.emit('random_report_submitted', {
    success: true,
    message: 'Report submitted securely. The user has been blocked from matching with you again.',
  });
}

/**
 * Block Stranger (Phase 7)
 */
export function blockStrangerSession(io, socket, { sessionId, blockerUserId }) {
  const session = activeSessions.get(sessionId);
  if (session) {
    const other = session.users.find((u) => u.userId !== blockerUserId);
    if (other) {
      addBlock(blockerUserId, other.userId);
    }
    endRandomChatSession(io, socket, { sessionId, reason: 'Stranger has left the chat.' });
  }
}

/**
 * Reconnect to an existing active session on page refresh
 */
export function reconnectRandomSession(io, socket, { sessionId, userId }) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status === 'terminated') {
    socket.emit('random_reconnect_result', { success: false, message: 'Session no longer active' });
    return;
  }

  const userEntry = session.users.find((u) => u.userId === userId);
  if (!userEntry) {
    socket.emit('random_reconnect_result', { success: false, message: 'Unauthorized session access' });
    return;
  }

  // Update socket ID
  userEntry.socketId = socket.id;
  userEntry.connected = true;
  socket.join(sessionId);

  // Clear disconnect grace timer if one was ticking
  if (session.disconnectTimer) {
    clearTimeout(session.disconnectTimer);
    session.disconnectTimer = null;
    socket.to(sessionId).emit('stranger_reconnected');
  }

  const otherUser = session.users.find((u) => u.userId !== userId);

  socket.emit('random_reconnect_result', {
    success: true,
    sessionId: session.sessionId,
    mode: session.mode,
    myTempName: userEntry.tempName,
    strangerTempName: otherUser ? otherUser.tempName : 'Stranger',
    messages: session.messages, // Restore in-memory conversation
  });
}

/**
 * WebRTC Signaling for Random Video Chat
 */
export function handleVideoSignal(socket, { sessionId, type, data }) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'active') return;

  const sender = session.users.find((u) => u.socketId === socket.id);
  if (!sender) return;

  // Forward signal to the other user in room
  socket.to(sessionId).emit('random_video_signal', {
    type, // 'offer' | 'answer' | 'ice' | 'track_state'
    data,
  });
}

/**
 * Handle request to switch from Video Chat to Text Chat
 */
export function handleSwitchToTextRequest(socket, { sessionId }) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'active') return;

  const sender = session.users.find((u) => u.socketId === socket.id);
  if (!sender) return;

  socket.to(sessionId).emit('switch_to_text_requested', {
    sessionId,
    requesterTempName: sender.tempName,
  });
}

/**
 * Handle response to switch to Text Chat
 */
export function handleSwitchToTextResponse(io, socket, { sessionId, accepted }) {
  const session = activeSessions.get(sessionId);
  if (!session || session.status !== 'active') return;

  if (accepted) {
    session.mode = 'text';
    session.updatedAt = new Date();

    io.to(sessionId).emit('mode_switched_to_text', {
      sessionId,
      message: 'Switched to Random Text Chat successfully.',
    });
  } else {
    socket.to(sessionId).emit('switch_to_text_declined', {
      sessionId,
      message: 'Stranger declined switching to Text Chat.',
    });
  }
}

/**
 * Handle disconnect with grace period
 */
export function handleRandomDisconnect(io, socket) {
  removeUserFromQueue(socket.id);

  for (const [sessionId, session] of activeSessions.entries()) {
    const userEntry = session.users.find((u) => u.socketId === socket.id);
    if (userEntry) {
      userEntry.connected = false;

      if (session.status === 'matched') {
        // Disconnected before intro completed
        clearTimeout(session.timeoutTimer);
        session.status = 'terminated';
        socket.to(sessionId).emit('stranger_disconnected', {
          matchId: sessionId,
          message: 'The stranger disconnected.',
        });
        activeSessions.delete(sessionId);
      } else if (session.status === 'active') {
        // Active chat: Give 15 seconds grace period for brief network blip/refresh
        socket.to(sessionId).emit('stranger_connection_state', {
          state: 'disconnected',
          message: 'Stranger disconnected. Waiting to see if they reconnect...',
        });

        session.disconnectTimer = setTimeout(() => {
          if (!userEntry.connected) {
            session.status = 'terminated';
            socket.to(sessionId).emit('random_chat_ended', {
              sessionId,
              reason: 'Stranger disconnected and did not return.',
            });
            activeSessions.delete(sessionId);
          }
        }, 15 * 1000);
      }
    }
  }
}
