import { icons, LOGO_IMG } from '../constants.js';
import { messageApi } from '../services/api.js';
import {
  emitCallUser,
  emitCallAnswer,
  emitIceCandidate,
  emitCallReject,
  emitCallEnd,
  onIncomingCall,
  onCallAccepted,
  onCallRejected,
  onCallEnded,
  onIceCandidate,
} from '../services/socket.js';
import { showToast } from '../utils/dom.js';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

let activePeerConnection = null;
let localStream = null;
let currentCall = null; // { to, from, callType, conversationId, role: 'caller'|'callee', duration: 0 }
let callTimerInterval = null;
let isMuted = false;
let isCameraOff = false;
let currentFacingMode = 'user'; // 'user' | 'environment'
let audioCtx = null;
let ringToneInterval = null;

/**
 * Synthesize a soft ringing sound using Web Audio API (no external asset needed)
 */
function startRingtone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = new AudioContext();

    function playBeep() {
      if (!audioCtx || audioCtx.state === 'closed') return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc.frequency.setValueAtTime(480, audioCtx.currentTime + 0.2); // chime tone
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1);
    }

    playBeep();
    ringToneInterval = setInterval(playBeep, 2500);
  } catch (e) {
    console.warn('[Call] Ringtone error:', e);
  }
}

function stopRingtone() {
  if (ringToneInterval) {
    clearInterval(ringToneInterval);
    ringToneInterval = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    try { audioCtx.close(); } catch {}
    audioCtx = null;
  }
}

function ensureCallContainer() {
  let el = document.getElementById('velove-call-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'velove-call-overlay';
    el.className = 'call-overlay-container hidden';
    document.body.appendChild(el);
  }
  return el;
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Initialize WebRTC call manager and register incoming call listeners.
 */
export function initCallManager(currentUser) {
  // Listen for incoming call
  onIncomingCall((data) => {
    handleIncomingCall(data, currentUser);
  });

  // Listen for call accepted
  onCallAccepted(async (data) => {
    if (!activePeerConnection || !currentCall) return;
    stopRingtone();
    try {
      await activePeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      startCallTimer();
      updateCallUIState('connected');
    } catch (err) {
      console.error('[Call] setRemoteDescription error:', err);
    }
  });

  // Listen for ICE candidates
  onIceCandidate(async (data) => {
    if (activePeerConnection && data.candidate) {
      try {
        await activePeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('[Call] addIceCandidate error:', err);
      }
    }
  });

  // Listen for call rejection
  onCallRejected((data) => {
    stopRingtone();
    showToast(data.reason || 'Call was declined', 'info');
    // Log missed / rejected call
    if (currentCall && currentCall.conversationId) {
      messageApi.sendMessage({
        conversationId: currentCall.conversationId,
        callDetails: {
          callType: currentCall.callType,
          status: 'rejected',
          duration: 0,
        },
      }).catch(() => {});
    }
    teardownCall();
  });

  // Listen for call end
  onCallEnded((data) => {
    stopRingtone();
    showToast('Call ended', 'info');
    teardownCall();
  });
}

/**
 * Handle an incoming call: Display Incoming Call Modal with Accept/Reject
 */
function handleIncomingCall(data, currentUser) {
  // If already in a call, busy reject
  if (currentCall) {
    emitCallReject({ to: data.from, reason: 'User is busy on another call', conversationId: data.conversationId, callType: data.callType });
    return;
  }

  currentCall = {
    role: 'callee',
    from: data.from,
    to: currentUser?._id || currentUser?.id,
    offer: data.offer,
    callType: data.callType || 'audio',
    callerName: data.callerName || 'Someone',
    callerAvatar: data.callerAvatar || LOGO_IMG,
    conversationId: data.conversationId,
    duration: 0,
  };

  startRingtone();
  renderIncomingCallModal();
}

function renderIncomingCallModal() {
  const container = ensureCallContainer();
  container.classList.remove('hidden');

  container.innerHTML = `
  <div class="call-modal-backdrop">
    <div class="call-incoming-card">
      <div class="call-avatar-ring pulse">
        <img src="${currentCall.callerAvatar}" alt="" class="call-avatar" onerror="this.src='${LOGO_IMG}'" />
      </div>
      <h3 class="call-user-title">${currentCall.callerName}</h3>
      <p class="call-type-subtitle">Incoming ${currentCall.callType === 'video' ? 'Video' : 'Audio'} Call…</p>

      <div class="call-actions-row">
        <button id="call-btn-reject" class="call-circle-btn danger" title="Decline">
          ${icons.close}
        </button>
        <button id="call-btn-accept" class="call-circle-btn success" title="Accept">
          ${currentCall.callType === 'video' ? icons.video : icons.phone}
        </button>
      </div>
    </div>
  </div>`;

  document.getElementById('call-btn-reject')?.addEventListener('click', () => {
    stopRingtone();
    emitCallReject({
      to: currentCall.from,
      reason: 'Call declined',
      conversationId: currentCall.conversationId,
      callType: currentCall.callType,
    });
    // Log missed call
    if (currentCall.conversationId) {
      messageApi.sendMessage({
        conversationId: currentCall.conversationId,
        callDetails: {
          callType: currentCall.callType,
          status: 'missed',
          duration: 0,
        },
      }).catch(() => {});
    }
    teardownCall();
  });

  document.getElementById('call-btn-accept')?.addEventListener('click', async () => {
    stopRingtone();
    await answerCall();
  });
}

/**
 * Answer an incoming call: acquire media, create answer, send to caller.
 */
async function answerCall() {
  try {
    const isVideo = currentCall.callType === 'video';
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { facingMode: currentFacingMode } : false,
    });

    activePeerConnection = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach((track) => {
      activePeerConnection.addTrack(track, localStream);
    });

    activePeerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('call-remote-video');
      const remoteAudio = document.getElementById('call-remote-audio');
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
      if (remoteAudio && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      }
    };

    activePeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        emitIceCandidate({ to: currentCall.from, candidate: event.candidate });
      }
    };

    await activePeerConnection.setRemoteDescription(new RTCSessionDescription(currentCall.offer));
    const answer = await activePeerConnection.createAnswer();
    await activePeerConnection.setLocalDescription(answer);

    emitCallAnswer({ to: currentCall.from, answer });

    renderActiveCallScreen();
    startCallTimer();
  } catch (err) {
    console.error('[Call] Failed to answer call:', err);
    showToast('Could not access microphone/camera', 'error');
    emitCallReject({ to: currentCall.from, reason: 'Media permissions denied' });
    teardownCall();
  }
}

/**
 * Initiate an outgoing call.
 */
export async function startOutgoingCall({ targetUser, callType = 'audio', conversationId, currentUser }) {
  if (currentCall) {
    showToast('Already on a call', 'info');
    return;
  }

  const targetId = targetUser._id || targetUser.id;

  currentCall = {
    role: 'caller',
    to: targetId,
    from: currentUser?._id || currentUser?.id,
    callType,
    targetName: targetUser.username || targetUser.fullName || 'User',
    targetAvatar: targetUser.avatar || LOGO_IMG,
    conversationId,
    duration: 0,
  };

  try {
    const isVideo = callType === 'video';
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { facingMode: currentFacingMode } : false,
    });

    activePeerConnection = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach((track) => {
      activePeerConnection.addTrack(track, localStream);
    });

    activePeerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById('call-remote-video');
      const remoteAudio = document.getElementById('call-remote-audio');
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      }
      if (remoteAudio && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
      }
    };

    activePeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        emitIceCandidate({ to: targetId, candidate: event.candidate });
      }
    };

    const offer = await activePeerConnection.createOffer();
    await activePeerConnection.setLocalDescription(offer);

    emitCallUser({
      to: targetId,
      offer,
      callType,
      callerName: currentUser?.fullName || currentUser?.username || 'Velove User',
      callerAvatar: currentUser?.avatar || LOGO_IMG,
      conversationId,
    });

    startRingtone();
    renderOutgoingCallScreen();
  } catch (err) {
    console.error('[Call] Outgoing call initiation error:', err);
    showToast('Camera or microphone access denied', 'error');
    teardownCall();
  }
}

function renderOutgoingCallScreen() {
  const container = ensureCallContainer();
  container.classList.remove('hidden');

  container.innerHTML = `
  <div class="call-modal-backdrop">
    <div class="call-incoming-card">
      <div class="call-avatar-ring pulse">
        <img src="${currentCall.targetAvatar}" alt="" class="call-avatar" onerror="this.src='${LOGO_IMG}'" />
      </div>
      <h3 class="call-user-title">${currentCall.targetName}</h3>
      <p class="call-type-subtitle" id="call-status-label">Calling…</p>

      <div class="call-actions-row">
        <button id="call-btn-cancel-outgoing" class="call-circle-btn danger" title="End Call">
          ${icons.phoneOff || icons.close}
        </button>
      </div>
    </div>
  </div>`;

  document.getElementById('call-btn-cancel-outgoing')?.addEventListener('click', () => {
    endActiveCall();
  });
}

function renderActiveCallScreen() {
  const container = ensureCallContainer();
  container.classList.remove('hidden');

  const isVideo = currentCall.callType === 'video';
  const name = currentCall.role === 'caller' ? currentCall.targetName : currentCall.callerName;
  const avatar = currentCall.role === 'caller' ? currentCall.targetAvatar : currentCall.callerAvatar;

  container.innerHTML = `
  <div class="call-active-viewport ${isVideo ? 'video-mode' : 'audio-mode'}">
    <!-- Remote Stream -->
    ${isVideo
      ? `<video id="call-remote-video" class="call-remote-video" autoplay playsinline></video>`
      : `<div class="call-audio-stage">
          <div class="call-avatar-stage pulse">
            <img src="${avatar}" alt="" class="call-avatar large" onerror="this.src='${LOGO_IMG}'" />
          </div>
          <h2 class="call-stage-name">${name}</h2>
          <span class="call-stage-timer" id="call-timer-display">00:00</span>
          <audio id="call-remote-audio" autoplay></audio>
        </div>`
    }

    <!-- Local Stream PiP -->
    ${isVideo
      ? `<div class="call-local-pip">
          <video id="call-local-video" autoplay muted playsinline></video>
        </div>`
      : ''
    }

    <!-- Call Header info (for video) -->
    ${isVideo
      ? `<div class="call-top-bar">
          <div class="call-top-user">
            <img src="${avatar}" class="avatar xs" alt="" />
            <strong>${name}</strong>
          </div>
          <span class="call-timer-pill" id="call-timer-display">00:00</span>
        </div>`
      : ''
    }

    <!-- Controls Bar -->
    <div class="call-bottom-bar">
      <button id="call-ctrl-mute" class="call-ctrl-btn ${isMuted ? 'active-off' : ''}" title="${isMuted ? 'Unmute' : 'Mute'}">
        ${isMuted ? icons.micOff : icons.mic}
      </button>

      ${isVideo ? `
        <button id="call-ctrl-cam" class="call-ctrl-btn ${isCameraOff ? 'active-off' : ''}" title="${isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}">
          ${isCameraOff ? icons.videoOff : icons.video}
        </button>
        <button id="call-ctrl-flip" class="call-ctrl-btn" title="Flip Camera">
          ${icons.refresh || icons.rotate}
        </button>
      ` : ''}

      <button id="call-ctrl-end" class="call-ctrl-btn end-btn" title="End Call">
        ${icons.phoneOff || icons.close}
      </button>
    </div>
  </div>`;

  // Attach local video stream
  if (isVideo && localStream) {
    const localVideo = document.getElementById('call-local-video');
    if (localVideo) localVideo.srcObject = localStream;
  }

  // Wire controls
  document.getElementById('call-ctrl-mute')?.addEventListener('click', toggleMute);
  document.getElementById('call-ctrl-cam')?.addEventListener('click', toggleCamera);
  document.getElementById('call-ctrl-flip')?.addEventListener('click', flipCamera);
  document.getElementById('call-ctrl-end')?.addEventListener('click', endActiveCall);
}

function updateCallUIState(state) {
  if (state === 'connected') {
    renderActiveCallScreen();
  }
}

function startCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  let seconds = 0;
  callTimerInterval = setInterval(() => {
    seconds++;
    if (currentCall) currentCall.duration = seconds;
    const timerEl = document.getElementById('call-timer-display');
    if (timerEl) timerEl.textContent = formatDuration(seconds);
  }, 1000);
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => {
    t.enabled = !isMuted;
  });
  const btn = document.getElementById('call-ctrl-mute');
  if (btn) {
    btn.classList.toggle('active-off', isMuted);
    btn.innerHTML = isMuted ? icons.micOff : icons.mic;
  }
  showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

function toggleCamera() {
  if (!localStream) return;
  isCameraOff = !isCameraOff;
  localStream.getVideoTracks().forEach((t) => {
    t.enabled = !isCameraOff;
  });
  const btn = document.getElementById('call-ctrl-cam');
  if (btn) {
    btn.classList.toggle('active-off', isCameraOff);
    btn.innerHTML = isCameraOff ? icons.videoOff : icons.video;
  }
  showToast(isCameraOff ? 'Camera turned off' : 'Camera turned on', 'info');
}

async function flipCamera() {
  if (!localStream || currentCall.callType !== 'video') return;
  try {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
      localStream.removeTrack(videoTrack);
    }
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
    });
    const newTrack = newStream.getVideoTracks()[0];
    localStream.addTrack(newTrack);

    const sender = activePeerConnection?.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) sender.replaceTrack(newTrack);

    const localVideo = document.getElementById('call-local-video');
    if (localVideo) localVideo.srcObject = localStream;
    showToast(`Switched to ${currentFacingMode === 'user' ? 'Front' : 'Back'} Camera`, 'info');
  } catch (err) {
    console.warn('[Call] Camera flip error:', err);
  }
}

function endActiveCall() {
  stopRingtone();
  if (currentCall) {
    const targetId = currentCall.role === 'caller' ? currentCall.to : currentCall.from;
    emitCallEnd({
      to: targetId,
      conversationId: currentCall.conversationId,
      duration: currentCall.duration,
      callType: currentCall.callType,
    });

    // Persist call log in conversation history
    if (currentCall.conversationId) {
      messageApi.sendMessage({
        conversationId: currentCall.conversationId,
        callDetails: {
          callType: currentCall.callType,
          status: 'ended',
          duration: currentCall.duration,
        },
      }).catch(() => {});
    }
  }
  teardownCall();
}

function teardownCall() {
  stopRingtone();
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  if (activePeerConnection) {
    activePeerConnection.close();
    activePeerConnection = null;
  }
  isMuted = false;
  isCameraOff = false;
  currentCall = null;

  const container = document.getElementById('velove-call-overlay');
  if (container) {
    container.classList.add('hidden');
    container.innerHTML = '';
  }
}
