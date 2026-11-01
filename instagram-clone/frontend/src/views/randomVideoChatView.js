import { LOGO_IMG, icons } from '../constants.js';
import { getSessionUser } from '../state/session.js';
import { escapeHtml, showToast, showModal } from '../utils/dom.js';
import {
  initSocket,
  emitEndRandomChat,
  emitNextStranger,
  emitReportStranger,
  emitBlockStranger,
  emitReconnectRandomSession,
  emitRandomPing,
  emitRandomVideoSignal,
  emitRequestSwitchToText,
  emitRespondSwitchToText,
  onRandomChatEnded,
  onStrangerConnectionState,
  onStrangerReconnected,
  onRandomReconnectResult,
  onRandomReportSubmitted,
  onRandomChatError,
  onRandomPong,
  onRandomVideoSignal,
  onSwitchToTextRequested,
  onSwitchToTextDeclined,
  onModeSwitchedToText,
} from '../services/socket.js';
import { toggleTheme } from '../state/theme.js';

// STUN configuration (Google STUN servers)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Anonymous avatar SVG
const anonymousAvatarSVG = `
<svg class="rc-video-anon-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="50" cy="50" r="48" fill="#06110C" stroke="#1F2E23" stroke-width="2.5" />
  <circle cx="50" cy="36" r="16" fill="#8A8580" />
  <path d="M22 82C22 66 34 58 50 58C66 58 78 66 78 82" fill="#8A8580" />
  <circle cx="50" cy="50" r="48" stroke="rgba(163, 28, 27, 0.4)" stroke-width="1.5" />
</svg>`;

// Custom SVGs for video chat controls
const micOffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const videoOffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21l-5.64-3.76M23 7l-7 4.67V5a2 2 0 0 0-2-2H4.6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3.33L23 21z"></path></svg>`;
const flipCameraIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8v3l-3-3m0 0l3 3m-3-3l3 3M4 14c0 4.418 3.582 8 8 8s8-3.582 8-8v-3l3 3m0 0l-3-3m3 3l-3-3"/></svg>`;
const textChatIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;

export function renderRandomVideoChat(container, params = {}) {
  const user = getSessionUser();
  if (!user) {
    params.onNavigate?.('home');
    return;
  }

  initSocket();

  let activeSessionId = params.sessionId || params.matchId;
  let strangerName = params.strangerTempName || 'Stranger';
  let myName = params.myTempName || 'You';

  if (!activeSessionId) {
    const saved = JSON.parse(sessionStorage.getItem('velove_active_rc_session') || '{}');
    if (saved.sessionId) {
      activeSessionId = saved.sessionId;
      strangerName = saved.strangerTempName || strangerName;
      myName = saved.myTempName || myName;
    }
  }

  if (activeSessionId) {
    sessionStorage.setItem('velove_active_rc_session', JSON.stringify({
      sessionId: activeSessionId,
      strangerTempName: strangerName,
      myTempName: myName,
      mode: 'video',
      timestamp: Date.now(),
    }));
  }

  // WebRTC & Media State
  let peerConnection = null;
  let localStream = new MediaStream();
  let localAudioTrack = null;
  let localVideoTrack = null;
  let remoteStream = new MediaStream();

  let isMicOn = false;     // Default OFF
  let isCamOn = false;     // Default OFF
  let currentFacingMode = 'user'; // 'user' | 'environment'
  let remoteVideoActive = false;
  let remoteAudioActive = false;

  let makingOffer = false;
  let ignoreOffer = false;
  // Deterministic polite peer: ensures no offer collisions
  const isPolite = (myName || '').localeCompare(strangerName || '') > 0;

  let pingInterval = null;
  let isSessionTerminated = false;
  const unsubs = [];

  container.innerHTML = `
  <div class="rc-video-chat-layout">
    <!-- Header -->
    <header class="rc-video-header">
      <div class="rc-video-header-user">
        <div class="rc-video-avatar-wrap">
          ${anonymousAvatarSVG}
          <span class="rc-video-status-dot online" id="rc-v-status-dot"></span>
        </div>
        <div class="rc-video-user-meta">
          <div class="rc-video-name-row">
            <strong class="rc-video-stranger-name" id="rc-v-stranger-name">${escapeHtml(strangerName)}</strong>
            <span class="rc-video-mode-badge">Video Chat</span>
          </div>
          <div class="rc-video-status-row">
            <span class="rc-video-status-label" id="rc-v-status-label">Connected</span>
            <span class="rc-video-dot-sep">•</span>
            <span class="rc-video-quality-label quality-good" id="rc-v-quality">Good connection</span>
          </div>
        </div>
      </div>

      <div class="rc-video-header-actions">
        <button id="rc-v-theme-btn" class="rc-video-icon-btn" title="Toggle theme" aria-label="Toggle theme">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>

        <button id="rc-v-switch-text-btn" class="rc-video-btn secondary" title="Switch to Text Chat">
          ${textChatIcon}
          <span>Switch to Text</span>
        </button>

        <button id="rc-v-next-btn" class="rc-video-btn secondary" title="Next Stranger">
          ${icons.randomConnect}
          <span>Next</span>
        </button>

        <button id="rc-v-more-btn" class="rc-video-icon-btn" title="Safety options" aria-label="More options">
          ${icons.moreH}
        </button>

        <button id="rc-v-end-btn" class="rc-video-btn danger" title="End Call">
          <span>End Chat</span>
        </button>
      </div>
    </header>

    <!-- Disconnected Warning Banner -->
    <div id="rc-v-disconn-banner" class="rc-video-disconn-banner hidden">
      <div class="rc-v-spinner"></div>
      <span id="rc-v-disconn-msg">Stranger disconnected. Reconnecting...</span>
    </div>

    <!-- Main Video Stage (Desktop side-by-side / Mobile vertical stack) -->
    <main class="rc-video-stage">
      <!-- Stranger Video Card (Left on Desktop, Top on Mobile) -->
      <section class="rc-video-card remote" id="rc-v-remote-card">
        <!-- Live Video Element -->
        <video id="rc-remote-video" class="rc-video-element" autoplay playsinline></video>
        <!-- Audio Element for remote sound -->
        <audio id="rc-remote-audio" autoplay></audio>
        <!-- Frozen Snapshot Canvas (Used when Stranger turns camera off) -->
        <canvas id="rc-remote-canvas" class="rc-video-frozen-canvas hidden"></canvas>

        <!-- Placeholder when Camera is OFF -->
        <div class="rc-video-placeholder" id="rc-remote-placeholder">
          <div class="rc-video-placeholder-avatar">
            ${anonymousAvatarSVG}
          </div>
          <div class="rc-video-placeholder-badge">
            ${videoOffIcon}
            <span id="rc-remote-placeholder-text">Stranger's Camera is Off</span>
          </div>
        </div>

        <!-- Overlays -->
        <div class="rc-video-card-badge bottom-left">
          <span class="rc-video-badge-name">${escapeHtml(strangerName)}</span>
        </div>
        <div class="rc-video-card-badge top-right" id="rc-remote-status-badge">
          <span class="rc-video-audio-indicator" id="rc-remote-audio-indicator" title="Audio status">
            ${icons.mic}
          </span>
        </div>
      </section>

      <!-- Self Video Card (Right on Desktop, Bottom on Mobile) -->
      <section class="rc-video-card local" id="rc-v-local-card">
        <!-- Live Video Element -->
        <video id="rc-local-video" class="rc-video-element" autoplay playsinline muted></video>
        <!-- Frozen Snapshot Canvas (Used when Camera is turned off) -->
        <canvas id="rc-local-canvas" class="rc-video-frozen-canvas hidden"></canvas>

        <!-- Placeholder when Camera is OFF (Default State) -->
        <div class="rc-video-placeholder" id="rc-local-placeholder">
          <div class="rc-video-placeholder-avatar pulse">
            ${anonymousAvatarSVG}
          </div>
          <div class="rc-video-placeholder-badge">
            ${videoOffIcon}
            <span>Camera is Off</span>
          </div>
          <p class="rc-video-placeholder-sub">Click the camera button below to turn on video</p>
        </div>

        <!-- Overlays -->
        <div class="rc-video-card-badge bottom-left">
          <span class="rc-video-badge-name">You (${escapeHtml(myName)})</span>
        </div>
        <div class="rc-video-card-badge top-right">
          <span class="rc-video-audio-indicator" id="rc-local-audio-indicator" title="Microphone muted">
            ${micOffIcon}
          </span>
        </div>
      </section>
    </main>

    <!-- Bottom Floating Control Bar -->
    <footer class="rc-video-controls-bar">
      <!-- Microphone Toggle -->
      <button id="rc-ctrl-mic" class="rc-ctrl-btn muted" title="Turn on microphone" aria-label="Microphone">
        <span class="rc-ctrl-icon" id="rc-ctrl-mic-icon">${micOffIcon}</span>
        <span class="rc-ctrl-label" id="rc-ctrl-mic-label">Mic Off</span>
      </button>

      <!-- Camera Toggle -->
      <button id="rc-ctrl-cam" class="rc-ctrl-btn muted" title="Turn on camera" aria-label="Camera">
        <span class="rc-ctrl-icon" id="rc-ctrl-cam-icon">${videoOffIcon}</span>
        <span class="rc-ctrl-label" id="rc-ctrl-cam-label">Cam Off</span>
      </button>

      <!-- Switch Camera (Flip facing mode) -->
      <button id="rc-ctrl-flip" class="rc-ctrl-btn secondary" title="Flip camera" aria-label="Flip camera">
        <span class="rc-ctrl-icon">${flipCameraIcon}</span>
        <span class="rc-ctrl-label">Flip</span>
      </button>

      <!-- Switch to Text Chat -->
      <button id="rc-ctrl-text" class="rc-ctrl-btn secondary" title="Switch to Text Chat" aria-label="Switch to Text">
        <span class="rc-ctrl-icon">${textChatIcon}</span>
        <span class="rc-ctrl-label">Text Chat</span>
      </button>

      <!-- Next Stranger -->
      <button id="rc-ctrl-next" class="rc-ctrl-btn secondary" title="Next Stranger" aria-label="Next stranger">
        <span class="rc-ctrl-icon">${icons.randomConnect}</span>
        <span class="rc-ctrl-label">Next</span>
      </button>

      <!-- End Chat -->
      <button id="rc-ctrl-end" class="rc-ctrl-btn danger" title="End Chat" aria-label="End Chat">
        <span class="rc-ctrl-icon">${icons.x}</span>
        <span class="rc-ctrl-label">End</span>
      </button>
    </footer>

    <!-- More / Safety Popover Menu -->
    <div id="rc-v-more-menu" class="rc-video-more-menu hidden">
      <button id="rc-v-menu-report" class="rc-menu-item">
        ${icons.moreH}
        <span>Report Stranger</span>
      </button>
      <button id="rc-v-menu-block" class="rc-menu-item danger">
        ${icons.x}
        <span>Block & Leave</span>
      </button>
    </div>

    <!-- Switch to Text Chat Request Modal -->
    <div id="rc-v-switch-modal" class="rc-modal-overlay hidden">
      <div class="rc-confirm-card modal-card">
        <div class="rc-confirm-header">
          <span class="rc-confirm-mode-icon text">${textChatIcon}</span>
          <h3 class="rc-confirm-title">Switch to Text Chat?</h3>
        </div>
        <p class="rc-confirm-desc" id="rc-v-switch-desc">
          ${escapeHtml(strangerName)} wants to switch this call to Text Chat.
          Video and audio will be closed while keeping your session.
        </p>
        <div class="rc-confirm-actions">
          <button id="rc-v-switch-decline-btn" class="rc-btn-secondary">Decline</button>
          <button id="rc-v-switch-accept-btn" class="rc-btn-match">
            ${icons.check || ''}
            <span>Accept & Switch</span>
          </button>
        </div>
      </div>
    </div>
  </div>`;

  // DOM Elements
  const localVideoEl = document.getElementById('rc-local-video');
  const remoteVideoEl = document.getElementById('rc-remote-video');
  const remoteAudioEl = document.getElementById('rc-remote-audio');
  const localCanvas = document.getElementById('rc-local-canvas');
  const remoteCanvas = document.getElementById('rc-remote-canvas');
  const localPlaceholder = document.getElementById('rc-local-placeholder');
  const remotePlaceholder = document.getElementById('rc-remote-placeholder');

  const ctrlMicBtn = document.getElementById('rc-ctrl-mic');
  const ctrlMicIcon = document.getElementById('rc-ctrl-mic-icon');
  const ctrlMicLabel = document.getElementById('rc-ctrl-mic-label');
  const localAudioInd = document.getElementById('rc-local-audio-indicator');

  const ctrlCamBtn = document.getElementById('rc-ctrl-cam');
  const ctrlCamIcon = document.getElementById('rc-ctrl-cam-icon');
  const ctrlCamLabel = document.getElementById('rc-ctrl-cam-label');

  const ctrlFlipBtn = document.getElementById('rc-ctrl-flip');
  const ctrlTextBtn = document.getElementById('rc-ctrl-text');
  const headerSwitchBtn = document.getElementById('rc-v-switch-text-btn');
  const ctrlNextBtn = document.getElementById('rc-ctrl-next');
  const headerNextBtn = document.getElementById('rc-v-next-btn');
  const ctrlEndBtn = document.getElementById('rc-ctrl-end');
  const headerEndBtn = document.getElementById('rc-v-end-btn');

  const qualityBadge = document.getElementById('rc-v-quality');
  const statusDot = document.getElementById('rc-v-status-dot');
  const statusLabel = document.getElementById('rc-v-status-label');
  const disconnBanner = document.getElementById('rc-v-disconn-banner');
  const disconnMsg = document.getElementById('rc-v-disconn-msg');

  const moreBtn = document.getElementById('rc-v-more-btn');
  const moreMenu = document.getElementById('rc-v-more-menu');
  const menuReport = document.getElementById('rc-v-menu-report');
  const menuBlock = document.getElementById('rc-v-menu-block');

  const switchModal = document.getElementById('rc-v-switch-modal');
  const switchAcceptBtn = document.getElementById('rc-v-switch-accept-btn');
  const switchDeclineBtn = document.getElementById('rc-v-switch-decline-btn');

  // ── Theme toggle ──────────────────────────────────────────────────────────
  const videoThemeBtn = document.getElementById('rc-v-theme-btn');
  const syncVideoThemeIcon = () => {
    if (!videoThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    videoThemeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncVideoThemeIcon();
  videoThemeBtn?.addEventListener('click', () => { toggleTheme(); syncVideoThemeIcon(); });

  // ─────────────────────────────────────────────────────────────
  // WebRTC Peer Connection Initialization
  // ─────────────────────────────────────────────────────────────
  function setupPeerConnection() {
    try {
      peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // Attach existing local tracks to peer connection
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Handle remote incoming tracks
      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStream = event.streams[0];
        } else {
          remoteStream.addTrack(event.track);
        }

        if (event.track.kind === 'video') {
          remoteVideoEl.srcObject = remoteStream;
          remoteVideoActive = true;
          updateRemoteVideoUI(true);

          event.track.onmute = () => updateRemoteVideoUI(false);
          event.track.onunmute = () => updateRemoteVideoUI(true);
        }

        if (event.track.kind === 'audio') {
          remoteAudioEl.srcObject = remoteStream;
          remoteAudioActive = true;
        }
      };

      // ICE Candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && activeSessionId && !isSessionTerminated) {
          emitRandomVideoSignal({
            sessionId: activeSessionId,
            type: 'ice',
            data: event.candidate,
          });
        }
      };

      // Negotiation Needed (Perfect Negotiation Pattern)
      peerConnection.onnegotiationneeded = async () => {
        try {
          makingOffer = true;
          await peerConnection.setLocalDescription();
          if (activeSessionId && !isSessionTerminated) {
            emitRandomVideoSignal({
              sessionId: activeSessionId,
              type: 'offer',
              data: peerConnection.localDescription,
            });
          }
        } catch (err) {
          console.error('[WebRTC] Negotiation offer error:', err);
        } finally {
          makingOffer = false;
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === 'connected') {
          if (statusDot) statusDot.className = 'rc-video-status-dot online';
          if (statusLabel) statusLabel.textContent = 'Connected';
          if (disconnBanner) disconnBanner.classList.add('hidden');
        } else if (state === 'disconnected') {
          if (statusDot) statusDot.className = 'rc-video-status-dot offline';
          if (statusLabel) statusLabel.textContent = 'Reconnecting...';
          if (disconnBanner) {
            disconnMsg.textContent = 'Reconnecting video stream...';
            disconnBanner.classList.remove('hidden');
          }
        } else if (state === 'failed') {
          console.warn('[WebRTC] Connection failed. Restarting ICE...');
          try {
            peerConnection.restartIce();
          } catch (e) {
            console.error('[WebRTC] restartIce error:', e);
          }
        }
      };
    } catch (err) {
      console.error('[WebRTC] Init error:', err);
    }
  }

  setupPeerConnection();

  // ─────────────────────────────────────────────────────────────
  // Frozen Frame Capture Helpers
  // ─────────────────────────────────────────────────────────────
  function captureFrozenSnapshot(videoEl, canvasEl) {
    if (!videoEl || !canvasEl) return;
    try {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        const ctx = canvasEl.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        canvasEl.classList.remove('hidden');
      }
    } catch (err) {
      console.warn('[Snapshot] Frame capture skipped:', err);
    }
  }

  function updateLocalVideoUI(isOn) {
    if (isOn) {
      localPlaceholder.classList.add('hidden');
      localCanvas.classList.add('hidden');
      localVideoEl.classList.remove('hidden');
      ctrlCamBtn.classList.remove('muted');
      ctrlCamBtn.classList.add('active');
      ctrlCamIcon.innerHTML = icons.video;
      ctrlCamLabel.textContent = 'Cam On';
    } else {
      captureFrozenSnapshot(localVideoEl, localCanvas);
      localPlaceholder.classList.remove('hidden');
      ctrlCamBtn.classList.remove('active');
      ctrlCamBtn.classList.add('muted');
      ctrlCamIcon.innerHTML = videoOffIcon;
      ctrlCamLabel.textContent = 'Cam Off';
    }
  }

  function updateRemoteVideoUI(isOn) {
    if (isOn) {
      remotePlaceholder.classList.add('hidden');
      remoteCanvas.classList.add('hidden');
      remoteVideoEl.classList.remove('hidden');
    } else {
      captureFrozenSnapshot(remoteVideoEl, remoteCanvas);
      remotePlaceholder.classList.remove('hidden');
    }
  }

  function updateLocalMicUI(isOn) {
    if (isOn) {
      ctrlMicBtn.classList.remove('muted');
      ctrlMicBtn.classList.add('active');
      ctrlMicIcon.innerHTML = icons.mic;
      ctrlMicLabel.textContent = 'Mic On';
      localAudioInd.innerHTML = icons.mic;
      localAudioInd.classList.remove('muted');
    } else {
      ctrlMicBtn.classList.remove('active');
      ctrlMicBtn.classList.add('muted');
      ctrlMicIcon.innerHTML = micOffIcon;
      ctrlMicLabel.textContent = 'Mic Off';
      localAudioInd.innerHTML = micOffIcon;
      localAudioInd.classList.add('muted');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Camera Toggle
  // ─────────────────────────────────────────────────────────────
  async function toggleCamera() {
    if (isCamOn) {
      // Turn Camera OFF
      if (localVideoTrack) {
        localVideoTrack.enabled = false;
        localVideoTrack.stop();
        localStream.removeTrack(localVideoTrack);
        if (peerConnection) {
          const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) peerConnection.removeTrack(sender);
        }
        localVideoTrack = null;
      }
      isCamOn = false;
      updateLocalVideoUI(false);
      emitRandomVideoSignal({
        sessionId: activeSessionId,
        type: 'track_state',
        data: { videoEnabled: false, audioEnabled: isMicOn },
      });
    } else {
      // Turn Camera ON
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error('No video track available');

        localVideoTrack = track;
        localStream.addTrack(track);
        localVideoEl.srcObject = localStream;

        if (peerConnection) {
          const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(track);
          } else {
            peerConnection.addTrack(track, localStream);
          }
        }

        isCamOn = true;
        updateLocalVideoUI(true);
        emitRandomVideoSignal({
          sessionId: activeSessionId,
          type: 'track_state',
          data: { videoEnabled: true, audioEnabled: isMicOn },
        });
      } catch (err) {
        console.error('[Camera] Access failed:', err);
        showToast('Camera access denied. You can continue in audio-only mode.', 'error');
        updateLocalVideoUI(false);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Microphone Toggle
  // ─────────────────────────────────────────────────────────────
  async function toggleMicrophone() {
    if (isMicOn) {
      // Turn Microphone OFF
      if (localAudioTrack) {
        localAudioTrack.enabled = false;
      }
      isMicOn = false;
      updateLocalMicUI(false);
      emitRandomVideoSignal({
        sessionId: activeSessionId,
        type: 'track_state',
        data: { videoEnabled: isCamOn, audioEnabled: false },
      });
    } else {
      // Turn Microphone ON
      try {
        if (!localAudioTrack) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          const track = stream.getAudioTracks()[0];
          if (!track) throw new Error('No audio track available');

          localAudioTrack = track;
          localStream.addTrack(track);

          if (peerConnection) {
            const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === 'audio');
            if (sender) {
              await sender.replaceTrack(track);
            } else {
              peerConnection.addTrack(track, localStream);
            }
          }
        } else {
          localAudioTrack.enabled = true;
        }

        isMicOn = true;
        updateLocalMicUI(true);
        emitRandomVideoSignal({
          sessionId: activeSessionId,
          type: 'track_state',
          data: { videoEnabled: isCamOn, audioEnabled: true },
        });
      } catch (err) {
        console.error('[Microphone] Access failed:', err);
        showToast('Microphone access denied. You can switch to text chat.', 'error');
        updateLocalMicUI(false);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Flip Camera (Front / Rear)
  // ─────────────────────────────────────────────────────────────
  async function flipCamera() {
    if (!isCamOn || !localVideoTrack) {
      showToast('Turn camera on first to switch lens', 'info');
      return;
    }
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

    try {
      localVideoTrack.stop();
      localStream.removeTrack(localVideoTrack);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { exact: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      }).catch(async () => {
        // Fallback if exact facing mode not supported on desktop
        return await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode },
        });
      });

      const newTrack = stream.getVideoTracks()[0];
      localVideoTrack = newTrack;
      localStream.addTrack(newTrack);
      localVideoEl.srcObject = localStream;

      if (peerConnection) {
        const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
      }

      showToast(`Camera switched to ${currentFacingMode === 'user' ? 'front' : 'rear'}`, 'info');
    } catch (err) {
      console.warn('[Camera] Flip failed:', err);
      showToast('Could not flip camera', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Switch to Text Chat Request & Response
  // ─────────────────────────────────────────────────────────────
  function requestSwitchToText() {
    if (!activeSessionId || isSessionTerminated) return;
    emitRequestSwitchToText({ sessionId: activeSessionId });
    showToast('Sent request to switch to Text Chat...', 'info');
    if (ctrlTextBtn) ctrlTextBtn.disabled = true;
    if (headerSwitchBtn) headerSwitchBtn.disabled = true;
  }

  function handleIncomingSwitchRequest() {
    if (switchModal) switchModal.classList.remove('hidden');
  }

  function acceptSwitchToText() {
    if (switchModal) switchModal.classList.add('hidden');
    emitRespondSwitchToText({ sessionId: activeSessionId, accepted: true });
    cleanupMedia();
    params.onNavigate?.('randomTextChat', {
      sessionId: activeSessionId,
      strangerTempName: strangerName,
      myTempName: myName,
    });
  }

  function declineSwitchToText() {
    if (switchModal) switchModal.classList.add('hidden');
    emitRespondSwitchToText({ sessionId: activeSessionId, accepted: false });
    showToast('Declined switch to Text Chat', 'info');
  }

  // ─────────────────────────────────────────────────────────────
  // Adaptive Quality & Ping
  // ─────────────────────────────────────────────────────────────
  function adaptVideoBitrate(latencyMs) {
    if (!peerConnection) return;
    const senders = peerConnection.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
    if (!videoSender || !videoSender.getParameters) return;

    try {
      const params = videoSender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      if (latencyMs > 350) {
        // Poor connection: reduce bitrate and framerate
        params.encodings[0].maxBitrate = 150000; // 150 kbps
        params.encodings[0].maxFramerate = 15;
      } else if (latencyMs > 150) {
        // Fair connection
        params.encodings[0].maxBitrate = 400000; // 400 kbps
        params.encodings[0].maxFramerate = 24;
      } else {
        // Good connection
        params.encodings[0].maxBitrate = 800000; // 800 kbps
        params.encodings[0].maxFramerate = 30;
      }

      videoSender.setParameters(params).catch(() => {});
    } catch (e) {
      // Ignore if browser restricts setParameters
    }
  }

  function updateQualityUI(rtt) {
    if (!qualityBadge) return;
    if (rtt < 150) {
      qualityBadge.className = 'rc-video-quality-label quality-good';
      qualityBadge.textContent = 'Good connection';
    } else if (rtt < 350) {
      qualityBadge.className = 'rc-video-quality-label quality-fair';
      qualityBadge.textContent = 'Fair connection';
    } else {
      qualityBadge.className = 'rc-video-quality-label quality-poor';
      qualityBadge.textContent = 'Poor connection';
    }
    adaptVideoBitrate(rtt);
  }

  pingInterval = setInterval(() => {
    if (!isSessionTerminated) {
      emitRandomPing(Date.now());
    }
  }, 3000);

  // ─────────────────────────────────────────────────────────────
  // Cleanup & Teardown
  // ─────────────────────────────────────────────────────────────
  function cleanupMedia() {
    if (localAudioTrack) {
      localAudioTrack.enabled = false;
      localAudioTrack.stop();
      localAudioTrack = null;
    }
    if (localVideoTrack) {
      localVideoTrack.enabled = false;
      localVideoTrack.stop();
      localVideoTrack = null;
    }
    localStream.getTracks().forEach((t) => t.stop());
    remoteStream.getTracks().forEach((t) => t.stop());

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function terminateSession(reason = 'Ended call') {
    if (isSessionTerminated) return;
    isSessionTerminated = true;
    cleanupMedia();
    unsubs.forEach((fn) => {
      try { fn(); } catch (e) {}
    });
    sessionStorage.removeItem('velove_active_rc_session');
  }

  function handleEndChat() {
    if (activeSessionId) {
      emitEndRandomChat({ sessionId: activeSessionId, reason: 'Call ended by user' });
    }
    terminateSession();
    showToast('Video chat ended', 'info');
    params.onNavigate?.('random-connect');
  }

  function handleNextStranger() {
    if (activeSessionId) {
      emitNextStranger({ sessionId: activeSessionId, mode: 'video' });
    }
    terminateSession();
    params.onNavigate?.('random-connect', { autoMatchMode: 'video' });
  }

  // ─────────────────────────────────────────────────────────────
  // Report & Block Safety Modal
  // ─────────────────────────────────────────────────────────────
  function openReportModal() {
    moreMenu?.classList.add('hidden');
    const modalContent = `
      <div class="rc-report-modal">
        <h3 class="rc-report-title">Report ${escapeHtml(strangerName)}</h3>
        <p class="rc-report-sub">Your report is completely anonymous. Choose a reason:</p>
        <div class="rc-report-options">
          <label class="rc-report-radio">
            <input type="radio" name="rc_report_reason" value="harassment" checked />
            <span>Harassment or bullying</span>
          </label>
          <label class="rc-report-radio">
            <input type="radio" name="rc_report_reason" value="inappropriate_content" />
            <span>Inappropriate or NSFW content</span>
          </label>
          <label class="rc-report-radio">
            <input type="radio" name="rc_report_reason" value="spam" />
            <span>Spam or scam</span>
          </label>
          <label class="rc-report-radio">
            <input type="radio" name="rc_report_reason" value="fake_identity" />
            <span>Fake identity or underage</span>
          </label>
          <label class="rc-report-radio">
            <input type="radio" name="rc_report_reason" value="other" />
            <span>Other reason</span>
          </label>
        </div>
        <textarea id="rc-report-desc" class="rc-report-desc" placeholder="Provide extra context (optional)..." maxlength="300"></textarea>
        <div class="rc-report-actions">
          <button id="rc-report-cancel" class="rc-chat-btn secondary">Cancel</button>
          <button id="rc-report-submit" class="rc-chat-btn danger">Submit Report & Block</button>
        </div>
      </div>
    `;

    const close = showModal(modalContent);
    const cancelBtn = document.getElementById('rc-report-cancel');
    const submitBtn = document.getElementById('rc-report-submit');

    cancelBtn?.addEventListener('click', close);
    submitBtn?.addEventListener('click', () => {
      const selected = document.querySelector('input[name="rc_report_reason"]:checked')?.value || 'other';
      const desc = document.getElementById('rc-report-desc')?.value || '';

      if (activeSessionId) {
        emitReportStranger({ sessionId: activeSessionId, reason: selected, description: desc });
        emitBlockStranger({ sessionId: activeSessionId });
      }

      close();
      terminateSession();
      showToast('Stranger reported and blocked.', 'success');
      params.onNavigate?.('random-connect');
    });
  }

  function handleBlockStranger() {
    moreMenu?.classList.add('hidden');
    if (confirm(`Block ${strangerName}? You will be immediately disconnected and will not be matched again.`)) {
      if (activeSessionId) {
        emitBlockStranger({ sessionId: activeSessionId });
      }
      terminateSession();
      showToast('Stranger blocked.', 'info');
      params.onNavigate?.('random-connect');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Event Listeners Binding
  // ─────────────────────────────────────────────────────────────
  ctrlMicBtn?.addEventListener('click', toggleMicrophone);
  ctrlCamBtn?.addEventListener('click', toggleCamera);
  ctrlFlipBtn?.addEventListener('click', flipCamera);
  ctrlTextBtn?.addEventListener('click', requestSwitchToText);
  headerSwitchBtn?.addEventListener('click', requestSwitchToText);
  ctrlNextBtn?.addEventListener('click', handleNextStranger);
  headerNextBtn?.addEventListener('click', handleNextStranger);
  ctrlEndBtn?.addEventListener('click', handleEndChat);
  headerEndBtn?.addEventListener('click', handleEndChat);

  switchAcceptBtn?.addEventListener('click', acceptSwitchToText);
  switchDeclineBtn?.addEventListener('click', declineSwitchToText);

  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (moreMenu && !moreMenu.contains(e.target) && e.target !== moreBtn) {
      moreMenu.classList.add('hidden');
    }
  });

  menuReport?.addEventListener('click', openReportModal);
  menuBlock?.addEventListener('click', handleBlockStranger);

  // ─────────────────────────────────────────────────────────────
  // Socket Signaling & Events Subscriptions
  // ─────────────────────────────────────────────────────────────
  unsubs.push(
    onRandomVideoSignal(async (payload) => {
      if (!peerConnection || isSessionTerminated) return;
      const { type, data } = payload || {};

      try {
        if (type === 'offer') {
          const offerCollision = makingOffer || peerConnection.signalingState !== 'stable';
          ignoreOffer = !isPolite && offerCollision;
          if (ignoreOffer) return;

          await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
          await peerConnection.setLocalDescription();
          emitRandomVideoSignal({
            sessionId: activeSessionId,
            type: 'answer',
            data: peerConnection.localDescription,
          });
        } else if (type === 'answer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        } else if (type === 'ice') {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
          } catch (err) {
            if (!ignoreOffer) console.warn('[WebRTC] Error adding ICE candidate:', err);
          }
        } else if (type === 'track_state') {
          if (typeof data.videoEnabled === 'boolean') {
            updateRemoteVideoUI(data.videoEnabled);
          }
          if (typeof data.audioEnabled === 'boolean') {
            const ind = document.getElementById('rc-remote-audio-indicator');
            if (ind) {
              ind.innerHTML = data.audioEnabled ? icons.mic : micOffIcon;
              if (data.audioEnabled) ind.classList.remove('muted');
              else ind.classList.add('muted');
            }
          }
        }
      } catch (err) {
        console.error('[WebRTC] Signaling handle error:', err);
      }
    })
  );

  unsubs.push(
    onSwitchToTextRequested(() => {
      handleIncomingSwitchRequest();
    })
  );

  unsubs.push(
    onSwitchToTextDeclined(() => {
      showToast('Stranger declined to switch to Text Chat', 'info');
      if (ctrlTextBtn) ctrlTextBtn.disabled = false;
      if (headerSwitchBtn) headerSwitchBtn.disabled = false;
    })
  );

  unsubs.push(
    onModeSwitchedToText(() => {
      showToast('Switching to Text Chat...', 'success');
      cleanupMedia();
      params.onNavigate?.('randomTextChat', {
        sessionId: activeSessionId,
        strangerTempName: strangerName,
        myTempName: myName,
      });
    })
  );

  unsubs.push(
    onRandomPong((timestamp) => {
      const rtt = Date.now() - timestamp;
      updateQualityUI(rtt);
    })
  );

  unsubs.push(
    onStrangerConnectionState((data) => {
      if (disconnBanner && disconnMsg) {
        disconnMsg.textContent = data.message || 'Stranger video disconnected...';
        disconnBanner.classList.remove('hidden');
      }
      if (statusDot) statusDot.className = 'rc-video-status-dot offline';
      if (statusLabel) statusLabel.textContent = 'Reconnecting...';
    })
  );

  unsubs.push(
    onStrangerReconnected(() => {
      if (disconnBanner) disconnBanner.classList.add('hidden');
      if (statusDot) statusDot.className = 'rc-video-status-dot online';
      if (statusLabel) statusLabel.textContent = 'Connected';
      showToast('Stranger reconnected!', 'success');
    })
  );

  unsubs.push(
    onRandomChatEnded((data) => {
      showToast(data.reason || 'Stranger has left the video chat.', 'info');
      terminateSession();
      params.onNavigate?.('random-connect');
    })
  );

  unsubs.push(
    onRandomChatError((err) => {
      showToast(err.message || 'Video chat error', 'error');
    })
  );

  unsubs.push(
    onRandomReconnectResult((res) => {
      if (!res.success) {
        showToast('Previous video chat session expired.', 'info');
        terminateSession();
        params.onNavigate?.('random-connect');
      }
    })
  );

  // Attempt reconnect if session already exists
  if (activeSessionId) {
    emitReconnectRandomSession({ sessionId: activeSessionId });
  }

  // Window unload listener
  const unloadHandler = () => {
    if (activeSessionId && !isSessionTerminated) {
      emitEndRandomChat({ sessionId: activeSessionId, reason: 'User navigated away' });
      terminateSession();
    }
  };
  window.addEventListener('beforeunload', unloadHandler, { once: true });
}

