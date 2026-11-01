import { io } from 'socket.io-client';
import { getSessionUser } from '../state/session.js';

let socket = null;

const listeners = new Set();
const messageListeners = new Set();
const convOrderListeners = new Set();
const readReceiptListeners = new Set();
const typingListeners = new Set();
const stopTypingListeners = new Set();
const messageEditedListeners = new Set();
const messageDeletedListeners = new Set();
const messageReactionListeners = new Set();
const convSettingsListeners = new Set();
const userStatusListeners = new Set();

// Calling listeners
const incomingCallListeners = new Set();
const callAcceptedListeners = new Set();
const callRejectedListeners = new Set();
const callEndedListeners = new Set();
const iceCandidateListeners = new Set();

// Random Connect / Matchmaking listeners
const matchFoundListeners = new Set();
const chatReadyListeners = new Set();
const introTimeoutListeners = new Set();
const strangerDisconnectListeners = new Set();
const strangerWaitingListeners = new Set();
const randomMessageListeners = new Set();
const randomChatEndedListeners = new Set();
const randomConnStateListeners = new Set();
const strangerReconnectListeners = new Set();
const reconnectResultListeners = new Set();
const reportSubmittedListeners = new Set();
const randomChatErrorListeners = new Set();
const randomPongListeners = new Set();

// Random Video Chat WebRTC listeners
const randomVideoSignalListeners = new Set();
const switchToTextRequestListeners = new Set();
const switchToTextDeclinedListeners = new Set();
const modeSwitchedToTextListeners = new Set();

/**
 * Connect to Socket.io server with current user context.
 */
export function initSocket() {
  const user = getSessionUser();
  if (!user) return null;

  const userId = user._id || user.id;

  if (socket && socket.connected) {
    return socket;
  }

  socket = io({
    query: { userId },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    // console.log('[Socket] Connected as', userId);
  });

  socket.on('new_notification', (notification) => {
    listeners.forEach((fn) => {
      try { fn(notification); } catch (e) { console.error('[Socket] notif err:', e); }
    });
  });

  socket.on('receive_message', (message) => {
    messageListeners.forEach((fn) => {
      try { fn(message); } catch (e) { console.error('[Socket] receive_message err:', e); }
    });
  });

  socket.on('update_conversation_order', (data) => {
    convOrderListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] conv_order err:', e); }
    });
  });

  socket.on('messages_read', (data) => {
    readReceiptListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] read_receipt err:', e); }
    });
  });

  socket.on('user_typing', (data) => {
    typingListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] user_typing err:', e); }
    });
  });

  socket.on('user_stop_typing', (data) => {
    stopTypingListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] user_stop_typing err:', e); }
    });
  });

  socket.on('message_edited', (data) => {
    messageEditedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] message_edited err:', e); }
    });
  });

  socket.on('message_deleted', (data) => {
    messageDeletedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] message_deleted err:', e); }
    });
  });

  socket.on('message_reaction', (data) => {
    messageReactionListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] message_reaction err:', e); }
    });
  });

  socket.on('conversation_settings_updated', (data) => {
    convSettingsListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] conv_settings err:', e); }
    });
  });

  socket.on('user_status_change', (data) => {
    userStatusListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] user_status err:', e); }
    });
  });

  // Call events
  socket.on('incoming_call', (data) => {
    incomingCallListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] incoming_call err:', e); }
    });
  });

  socket.on('call_accepted', (data) => {
    callAcceptedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] call_accepted err:', e); }
    });
  });

  socket.on('call_rejected', (data) => {
    callRejectedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] call_rejected err:', e); }
    });
  });

  socket.on('call_ended', (data) => {
    callEndedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] call_ended err:', e); }
    });
  });

  socket.on('ice_candidate', (data) => {
    iceCandidateListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] ice_candidate err:', e); }
    });
  });

  // Random Connect events
  socket.on('random_match_found', (data) => {
    matchFoundListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] match_found err:', e); }
    });
  });

  socket.on('random_chat_ready', (data) => {
    chatReadyListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] chat_ready err:', e); }
    });
  });

  socket.on('stranger_intro_timeout', (data) => {
    introTimeoutListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] intro_timeout err:', e); }
    });
  });

  socket.on('stranger_disconnected', (data) => {
    strangerDisconnectListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] stranger_disconnect err:', e); }
    });
  });

  socket.on('stranger_waiting_confirmation', (data) => {
    strangerWaitingListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] stranger_waiting err:', e); }
    });
  });

  socket.on('random_message_received', (data) => {
    randomMessageListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] random_message err:', e); }
    });
  });

  socket.on('random_chat_ended', (data) => {
    randomChatEndedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] random_chat_ended err:', e); }
    });
  });

  socket.on('stranger_connection_state', (data) => {
    randomConnStateListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] conn_state err:', e); }
    });
  });

  socket.on('stranger_reconnected', () => {
    strangerReconnectListeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error('[Socket] stranger_reconnected err:', e); }
    });
  });

  socket.on('random_reconnect_result', (data) => {
    reconnectResultListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] reconnect_result err:', e); }
    });
  });

  socket.on('random_report_submitted', (data) => {
    reportSubmittedListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] report_submitted err:', e); }
    });
  });

  socket.on('random_chat_error', (data) => {
    randomChatErrorListeners.forEach((fn) => {
      try { fn(data); } catch (e) { console.error('[Socket] random_chat_error err:', e); }
    });
  });

  socket.on('random_pong', (timestamp) => {
    randomPongListeners.forEach((fn) => {
      try { fn(timestamp); } catch (e) { console.error('[Socket] random_pong err:', e); }
    });
  });

  socket.on('random_video_signal', (payload) => {
    randomVideoSignalListeners.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[Socket] video_signal err:', e); }
    });
  });

  socket.on('switch_to_text_requested', (payload) => {
    switchToTextRequestListeners.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[Socket] switch_text_req err:', e); }
    });
  });

  socket.on('switch_to_text_declined', (payload) => {
    switchToTextDeclinedListeners.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[Socket] switch_text_dec err:', e); }
    });
  });

  socket.on('mode_switched_to_text', (payload) => {
    modeSwitchedToTextListeners.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[Socket] mode_switched err:', e); }
    });
  });

  return socket;
}

export function getSocket() {
  return socket || initSocket();
}

export function onNewNotification(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function onReceiveMessage(callback) {
  messageListeners.add(callback);
  return () => messageListeners.delete(callback);
}

export function onUpdateConversationOrder(callback) {
  convOrderListeners.add(callback);
  return () => convOrderListeners.delete(callback);
}

export function onMessagesRead(callback) {
  readReceiptListeners.add(callback);
  return () => readReceiptListeners.delete(callback);
}

export function onUserTyping(callback) {
  typingListeners.add(callback);
  return () => typingListeners.delete(callback);
}

export function onUserStopTyping(callback) {
  stopTypingListeners.add(callback);
  return () => stopTypingListeners.delete(callback);
}

export function onMessageEdited(callback) {
  messageEditedListeners.add(callback);
  return () => messageEditedListeners.delete(callback);
}

export function onMessageDeleted(callback) {
  messageDeletedListeners.add(callback);
  return () => messageDeletedListeners.delete(callback);
}

export function onMessageReaction(callback) {
  messageReactionListeners.add(callback);
  return () => messageReactionListeners.delete(callback);
}

export function onConversationSettingsUpdated(callback) {
  convSettingsListeners.add(callback);
  return () => convSettingsListeners.delete(callback);
}

export function onUserStatusChange(callback) {
  userStatusListeners.add(callback);
  return () => userStatusListeners.delete(callback);
}

export function emitTyping(conversationId, receiverId) {
  if (socket && socket.connected) {
    socket.emit('typing', { conversationId, receiverId });
  }
}

export function emitStopTyping(conversationId, receiverId) {
  if (socket && socket.connected) {
    socket.emit('stop_typing', { conversationId, receiverId });
  }
}

// ── Calling helpers ──────────────────────────────────────────
export function onIncomingCall(callback) {
  incomingCallListeners.add(callback);
  return () => incomingCallListeners.delete(callback);
}

export function onCallAccepted(callback) {
  callAcceptedListeners.add(callback);
  return () => callAcceptedListeners.delete(callback);
}

export function onCallRejected(callback) {
  callRejectedListeners.add(callback);
  return () => callRejectedListeners.delete(callback);
}

export function onCallEnded(callback) {
  callEndedListeners.add(callback);
  return () => callEndedListeners.delete(callback);
}

export function onIceCandidate(callback) {
  iceCandidateListeners.add(callback);
  return () => iceCandidateListeners.delete(callback);
}

export function emitCallUser(payload) {
  if (socket && socket.connected) socket.emit('call_user', payload);
}

export function emitCallAnswer(payload) {
  if (socket && socket.connected) socket.emit('call_answer', payload);
}

export function emitIceCandidate(payload) {
  if (socket && socket.connected) socket.emit('ice_candidate', payload);
}

export function emitCallReject(payload) {
  if (socket && socket.connected) socket.emit('call_reject', payload);
}

export function emitCallEnd(payload) {
  if (socket && socket.connected) socket.emit('call_end', payload);
}

// ── Random Connect / Matchmaking Emitters & Listeners ─────────────
export function onRandomMatchFound(callback) {
  matchFoundListeners.add(callback);
  return () => matchFoundListeners.delete(callback);
}

export function onRandomChatReady(callback) {
  chatReadyListeners.add(callback);
  return () => chatReadyListeners.delete(callback);
}

export function onStrangerIntroTimeout(callback) {
  introTimeoutListeners.add(callback);
  return () => introTimeoutListeners.delete(callback);
}

export function onStrangerDisconnected(callback) {
  strangerDisconnectListeners.add(callback);
  return () => strangerDisconnectListeners.delete(callback);
}

export function onStrangerWaitingConfirmation(callback) {
  strangerWaitingListeners.add(callback);
  return () => strangerWaitingListeners.delete(callback);
}

export function emitStartMatchmaking(mode) {
  if (socket && socket.connected) {
    socket.emit('start_random_matchmaking', { mode });
  }
}

export function emitCancelMatchmaking() {
  if (socket && socket.connected) {
    socket.emit('cancel_random_matchmaking');
  }
}

export function emitAcceptStrangerIntro(matchId) {
  if (socket && socket.connected) {
    socket.emit('accept_stranger_introduction', { matchId });
  }
}

export function onRandomMessageReceived(callback) {
  randomMessageListeners.add(callback);
  return () => randomMessageListeners.delete(callback);
}

export function onRandomChatEnded(callback) {
  randomChatEndedListeners.add(callback);
  return () => randomChatEndedListeners.delete(callback);
}

export function onStrangerConnectionState(callback) {
  randomConnStateListeners.add(callback);
  return () => randomConnStateListeners.delete(callback);
}

export function onStrangerReconnected(callback) {
  strangerReconnectListeners.add(callback);
  return () => strangerReconnectListeners.delete(callback);
}

export function onRandomReconnectResult(callback) {
  reconnectResultListeners.add(callback);
  return () => reconnectResultListeners.delete(callback);
}

export function onRandomReportSubmitted(callback) {
  reportSubmittedListeners.add(callback);
  return () => reportSubmittedListeners.delete(callback);
}

export function onRandomChatError(callback) {
  randomChatErrorListeners.add(callback);
  return () => randomChatErrorListeners.delete(callback);
}

export function onRandomPong(callback) {
  randomPongListeners.add(callback);
  return () => randomPongListeners.delete(callback);
}

export function emitSendRandomMessage({ sessionId, text }) {
  if (socket && socket.connected) {
    socket.emit('send_random_message', { sessionId, text });
  }
}

export function emitEndRandomChat({ sessionId, reason }) {
  if (socket && socket.connected) {
    socket.emit('end_random_chat', { sessionId, reason });
  }
}

export function emitNextStranger({ sessionId, mode = 'text' }) {
  if (socket && socket.connected) {
    socket.emit('next_random_stranger', { sessionId, mode });
  }
}

export function emitReportStranger({ sessionId, reason, description }) {
  if (socket && socket.connected) {
    socket.emit('report_random_stranger', { sessionId, reason, description });
  }
}

export function emitBlockStranger({ sessionId }) {
  if (socket && socket.connected) {
    socket.emit('block_random_stranger', { sessionId });
  }
}

export function emitReconnectRandomSession({ sessionId }) {
  if (socket && socket.connected) {
    socket.emit('reconnect_random_session', { sessionId });
  }
}

export function onRandomVideoSignal(callback) {
  randomVideoSignalListeners.add(callback);
  return () => randomVideoSignalListeners.delete(callback);
}

export function onSwitchToTextRequested(callback) {
  switchToTextRequestListeners.add(callback);
  return () => switchToTextRequestListeners.delete(callback);
}

export function onSwitchToTextDeclined(callback) {
  switchToTextDeclinedListeners.add(callback);
  return () => switchToTextDeclinedListeners.delete(callback);
}

export function onModeSwitchedToText(callback) {
  modeSwitchedToTextListeners.add(callback);
  return () => modeSwitchedToTextListeners.delete(callback);
}

export function emitRandomVideoSignal({ sessionId, type, data }) {
  if (socket && socket.connected) {
    socket.emit('random_video_signal', { sessionId, type, data });
  }
}

export function emitRequestSwitchToText({ sessionId }) {
  if (socket && socket.connected) {
    socket.emit('request_switch_to_text', { sessionId });
  }
}

export function emitRespondSwitchToText({ sessionId, accepted }) {
  if (socket && socket.connected) {
    socket.emit('respond_switch_to_text', { sessionId, accepted });
  }
}

export function emitRandomPing(timestamp) {
  if (socket && socket.connected) {
    socket.emit('random_ping', timestamp);
  }
}

/**
 * Disconnect socket cleanly on logout.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
