import { LOGO_IMG, icons } from '../constants.js';
import { getSessionUser } from '../state/session.js';
import { escapeHtml, showToast } from '../utils/dom.js';
import { toggleTheme } from '../state/theme.js';
import {
  initSocket,
  emitStartMatchmaking,
  emitCancelMatchmaking,
  emitAcceptStrangerIntro,
  onRandomMatchFound,
  onRandomChatReady,
  onStrangerIntroTimeout,
  onStrangerDisconnected,
  onStrangerWaitingConfirmation,
} from '../services/socket.js';

// ── SVG Icons local to this view ─────────────────────────────────────────────
const iconChat = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
const iconVideo = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
const iconShield = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const iconLock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const iconTrash2 = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
const iconFlag = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
const iconCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const iconShuffle = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`;

// Rotating connection / radar icon for matchmaking state
const iconConnecting = `<svg class="rc-rotate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;

// Common abstract connection illustration SVG
const connectionIllustrationSVG = `
<svg class="rc-abstract-illustration" viewBox="0 0 240 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="rc-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#A31C1B" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#A31C1B" stop-opacity="0" />
    </radialGradient>
  </defs>
  <!-- Background Glow Aura -->
  <circle cx="120" cy="70" r="60" fill="url(#rc-glow)" />
  
  <!-- Outer Orbit Rings -->
  <circle class="rc-orbit-ring ring-outer" cx="120" cy="70" r="52" stroke="#1F2E23" stroke-width="1.2" stroke-dasharray="4 5" />
  <circle class="rc-orbit-ring ring-inner" cx="120" cy="70" r="34" stroke="rgba(163, 28, 27, 0.4)" stroke-width="1.5" stroke-dasharray="6 6" />

  <!-- Dynamic Connection Wave Link -->
  <path class="rc-wave-path" d="M 50 70 Q 85 45, 120 70 T 190 70" stroke="#A31C1B" stroke-width="2.5" stroke-linecap="round" fill="none" />
  
  <!-- Left Connection Node (User) -->
  <g class="rc-node-left">
    <circle cx="50" cy="70" r="14" fill="#06110C" stroke="#1F2E23" stroke-width="2" />
    <circle cx="50" cy="70" r="6" fill="#F0EDE8" />
  </g>

  <!-- Right Connection Node (Stranger / Match) -->
  <g class="rc-node-right">
    <circle cx="190" cy="70" r="14" fill="#06110C" stroke="#A31C1B" stroke-width="2" />
    <circle cx="190" cy="70" r="6" fill="#A31C1B" />
  </g>

  <!-- Central Pulse Intersection Node -->
  <g class="rc-center-pulse">
    <circle cx="120" cy="70" r="16" fill="rgba(163, 28, 27, 0.15)" />
    <circle cx="120" cy="70" r="8" fill="#06110C" stroke="#A31C1B" stroke-width="2" />
    <circle cx="120" cy="70" r="3" fill="#F0EDE8" />
  </g>
</svg>`;

// Anonymous stranger silhouette avatar SVG
const anonymousAvatarSVG = `
<svg class="rc-anon-avatar-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="50" cy="50" r="48" fill="#06110C" stroke="#1F2E23" stroke-width="2.5" />
  <circle cx="50" cy="36" r="16" fill="#8A8580" />
  <path d="M22 82C22 66 34 58 50 58C66 58 78 66 78 82" fill="#8A8580" />
  <circle cx="50" cy="50" r="48" stroke="rgba(163, 28, 27, 0.4)" stroke-width="1.5" />
</svg>`;

/**
 * Renders the Random Connect selection screen.
 * Shows Text Chat and Video Chat mode cards.
 */
export function renderRandomConnect(container, { onNavigate, autoMatchMode } = {}) {
  const currentUser = getSessionUser();

  // ── Build sidebar (reused pattern from all views) ─────────────────────────
  function sidebarHTML() {
    return `
    <aside class="vd-sidebar" role="navigation" aria-label="Main navigation">
      <a class="vd-logo-row" href="#/" aria-label="VELOVE home">
        <img src="${LOGO_IMG}" class="vd-logo-img" alt="VELOVE logo" loading="lazy" />
        <span class="vd-logo-text">VELOVE</span>
      </a>
      <nav class="vd-nav" role="list">
        <button class="vd-nav-item" data-route="home">${icons.home}<span>Home</span></button>
        <button class="vd-nav-item" data-route="messages">${icons.message}<span>Messages</span></button>
        <button class="vd-nav-item active" data-route="random-connect">${icons.randomConnect}<span>Random Connect</span></button>
        <button class="vd-nav-item" data-route="explore">${icons.explore}<span>Explore</span></button>
        <button class="vd-nav-item" data-route="notifs">${icons.bell}<span>Notifications</span></button>
        <button class="vd-nav-item vd-create" data-route="create">${icons.plus}<span>Create Post</span></button>
        <button class="vd-nav-item" data-route="saved">${icons.saved}<span>Saved Posts</span></button>
        <button class="vd-nav-item" data-route="settings" style="margin-top:auto;">${icons.settings}<span>Settings</span></button>
      </nav>
      <button id="rc-sidebar-user" class="vd-sidebar-user">
        <img class="vd-sidebar-avatar" src="${currentUser?.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
        <div class="vd-sidebar-user-info">
          <span class="vd-sidebar-user-name">${escapeHtml(currentUser?.fullName || currentUser?.username || 'You')}</span>
          <span class="vd-sidebar-user-handle">@${escapeHtml(currentUser?.username || '')}</span>
        </div>
      </button>
    </aside>`;
  }

  // ── Main page HTML ────────────────────────────────────────────────────────
  container.innerHTML = `
  <div class="vd-layout rc-layout">
    ${sidebarHTML()}

    <main class="vd-main rc-main" id="rc-main">
      <!-- Top header bar for Random Connect -->
      <header class="rc-header">
        <div class="rc-header-left">
          <span class="rc-header-icon">${icons.randomConnect}</span>
          <span class="rc-header-title">Random Connect</span>
        </div>
        <div class="rc-header-right">
          <button id="rc-theme-toggle" class="rc-header-btn" title="Toggle theme" aria-label="Toggle theme">
            ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
          </button>
          <button id="rc-header-settings" class="rc-header-btn" title="Settings" aria-label="Settings">
            ${icons.settings}
            <span>Settings</span>
          </button>
        </div>
      </header>

      <!-- Selection Screen -->
      <div class="rc-screen" id="rc-selection-screen">

        <!-- Hero -->
        <div class="rc-hero">
          <div class="rc-hero-icon-wrap">
            ${iconShuffle}
          </div>
          <h1 class="rc-hero-title">Meet Someone New</h1>
          <p class="rc-hero-subtitle">Chat. Connect. Make a new friend.</p>
        </div>

        <!-- Mode Cards -->
        <div class="rc-cards-row">

          <!-- Text Chat Card -->
          <div class="rc-card" id="rc-card-text" data-mode="text" role="button" tabindex="0" aria-label="Select Text Chat mode">
            <div class="rc-card-icon-wrap text-mode">
              ${iconChat}
            </div>
            <h2 class="rc-card-title">Text Chat</h2>
            <p class="rc-card-desc">Start a random chat with someone worldwide!</p>
            <ul class="rc-features-list">
              <li>${iconCheck}<span>Real-time messaging</span></li>
              <li>${iconCheck}<span>Reactions and replies</span></li>
              <li>${iconCheck}<span>No camera required</span></li>
            </ul>
            <button class="rc-start-btn text-btn" id="rc-start-text">
              ${iconChat} Start Text Chat
            </button>
          </div>

          <!-- Video Chat Card -->
          <div class="rc-card rc-card-video" id="rc-card-video" data-mode="video" role="button" tabindex="0" aria-label="Select Video Chat mode">
            <div class="rc-card-icon-wrap video-mode">
              ${iconVideo}
            </div>
            <h2 class="rc-card-title">Video Chat</h2>
            <p class="rc-card-desc">Talk face-to-face with a stranger!</p>
            <ul class="rc-features-list">
              <li>${iconCheck}<span>Video and audio communication</span></li>
              <li>${iconCheck}<span>Camera and microphone controls</span></li>
              <li>${iconCheck}<span>Audio-only fallback</span></li>
            </ul>
            <button class="rc-start-btn video-btn" id="rc-start-video">
              ${iconVideo} Start Video Chat
            </button>
          </div>

        </div><!-- /.rc-cards-row -->

        <!-- Privacy Section -->
        <div class="rc-privacy-bar">
          <div class="rc-privacy-item">
            ${iconShield}
            <span>Your Privacy, Our Priority</span>
          </div>
          <div class="rc-privacy-item">
            <span class="rc-age-badge">18+</span>
            <span>18+ Only</span>
          </div>
          <div class="rc-privacy-item">
            ${iconTrash2}
            <span>No Chat History</span>
          </div>
          <div class="rc-privacy-item">
            ${iconFlag}
            <span>Report &amp; Block for Safety</span>
          </div>
        </div>

      </div><!-- /#rc-selection-screen -->

      <!-- Confirmation Screen (hidden initially) -->
      <div class="rc-screen rc-confirm-screen hidden" id="rc-confirm-screen">
        <div class="rc-confirm-card">
          <!-- Back navigation header row inside card -->
          <div class="rc-confirm-top-bar">
            <button class="rc-back-nav-btn" id="rc-top-back-btn" title="Back to mode selection" aria-label="Back">
              ${icons.arrowLeft} <span>Back</span>
            </button>
            <span class="rc-mode-tag" id="rc-mode-tag">Text Mode</span>
          </div>

          <!-- Common Abstract Connection Illustration -->
          <div class="rc-illustration-wrap">
            ${connectionIllustrationSVG}
          </div>

          <!-- Selected Mode Icon & Badge -->
          <div class="rc-confirm-icon" id="rc-confirm-icon"></div>

          <!-- Dynamic Title & Description -->
          <h2 class="rc-confirm-title" id="rc-confirm-title">Ready for Text Chat?</h2>
          <p class="rc-confirm-sub" id="rc-confirm-sub">You'll be matched with a random stranger worldwide for a live text chat.</p>

          <!-- Matchmaking Status Banner (Visible while matching) -->
          <div class="rc-match-status-box hidden" id="rc-match-status-box" aria-live="polite">
            <div class="rc-match-status-spinner">
              ${iconConnecting}
            </div>
            <div class="rc-match-status-text">
              <strong id="rc-match-status-msg">Finding someone for you...</strong>
              <span id="rc-match-status-timer">0:60</span>
            </div>
            <button class="rc-cancel-match-btn" id="rc-cancel-match-btn" title="Cancel matchmaking">Cancel</button>
          </div>

          <!-- Safety / Anonymity assurance points -->
          <div class="rc-confirm-info-list" id="rc-confirm-info-list">
            <div class="rc-confirm-info-item">
              ${iconLock}
              <span>100% Anonymous — your real identity &amp; handle are completely hidden</span>
            </div>
            <div class="rc-confirm-info-item">
              ${iconShield}
              <span>End-to-end protected instant session</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="rc-confirm-actions">
            <button class="rc-confirm-match-btn" id="rc-match-btn">
              ${iconShuffle} <span>Start Matching</span>
            </button>
            <div class="rc-confirm-secondary-row">
              <button class="rc-confirm-change-mode-btn" id="rc-change-mode-btn">
                Change Mode
              </button>
              <button class="rc-confirm-back-btn" id="rc-back-btn">
                Back
              </button>
            </div>
          </div>
        </div>
      </div><!-- /#rc-confirm-screen -->

      <!-- Stranger Introduction Screen (hidden initially) -->
      <div class="rc-screen rc-intro-screen hidden" id="rc-intro-screen">
        <div class="rc-intro-card">
          <!-- Anonymous Avatar with Animated Glowing Connection Ring -->
          <div class="rc-intro-avatar-container">
            <div class="rc-intro-glow-ring ring-3"></div>
            <div class="rc-intro-glow-ring ring-2"></div>
            <div class="rc-intro-glow-ring ring-1"></div>
            <div class="rc-intro-avatar-wrap">
              ${anonymousAvatarSVG}
            </div>
            <span class="rc-intro-online-indicator" title="Connected"></span>
          </div>

          <!-- Stranger Temporary Name -->
          <h2 class="rc-intro-name" id="rc-intro-username">Stranger_4821</h2>

          <!-- Connected with you! banner -->
          <div class="rc-intro-connected-badge">
            <span class="rc-intro-sparkle">✨</span>
            <span class="rc-intro-connected-text">Connected with you!</span>
          </div>

          <!-- Dynamic Mode info & 30-second Countdown bar -->
          <div class="rc-intro-timer-wrap" id="rc-intro-timer-wrap">
            <div class="rc-intro-timer-meta">
              <span class="rc-intro-mode-desc" id="rc-intro-mode-desc">Live text chat request</span>
              <span class="rc-intro-time-left" id="rc-intro-time-left">0:30</span>
            </div>
            <div class="rc-intro-timer-progress">
              <div class="rc-intro-timer-bar" id="rc-intro-timer-bar"></div>
            </div>
          </div>

          <!-- Timeout Notice (Shown only if 30s expires without response) -->
          <div class="rc-intro-timeout-notice hidden" id="rc-intro-timeout-notice">
            <p class="rc-intro-timeout-msg">The stranger didn't respond. Find someone else?</p>
            <button class="rc-find-new-stranger-btn" id="rc-find-new-btn">
              ${iconShuffle} <span>Find New Stranger</span>
            </button>
          </div>

          <!-- Active Actions (Shown during 30s) -->
          <div class="rc-intro-actions" id="rc-intro-actions">
            <button class="rc-start-chatting-btn" id="rc-start-chatting-btn">
              <span>Start Chatting</span>
            </button>
            <p class="rc-intro-status-feedback hidden" id="rc-intro-status-feedback">
              Waiting for stranger to confirm...
            </p>
          </div>
        </div>
      </div><!-- /#rc-intro-screen -->

    </main>
  </div>`;

  // ── Wire sidebar navigation ───────────────────────────────────────────────
  container.querySelectorAll('.vd-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route === 'random-connect') return;
      onNavigate?.(route);
    });
  });
  document.getElementById('rc-sidebar-user')?.addEventListener('click', () => {
    onNavigate?.('profile', { username: currentUser?.username });
  });

  document.getElementById('rc-header-settings')?.addEventListener('click', () => {
    onNavigate?.('settings');
  });

  // ── Theme toggle ──────────────────────────────────────────────────────────
  const rcThemeBtn = document.getElementById('rc-theme-toggle');
  const syncRcThemeIcon = () => {
    if (!rcThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    rcThemeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncRcThemeIcon();
  rcThemeBtn?.addEventListener('click', () => { toggleTheme(); syncRcThemeIcon(); });

  // ── Mode selection & Matchmaking state ────────────────────────────────────
  let selectedMode = 'text'; // 'text' | 'video'
  let isMatching = false;
  let matchInterval = null;
  let matchTimeoutId = null;
  let matchElapsedSeconds = 0;
  const MATCHMAKING_TIMEOUT_SEC = 60;

  // Active match data
  let currentMatchId = null;
  let currentStrangerTempName = null;
  let currentMyTempName = null;
  let isIntroActive = false;
  let introCountdownInterval = null;
  let introRemainingSeconds = 30;
  let hasUserConfirmedChat = false;

  // Socket cleanup list
  const unsubs = [];

  function cleanupAllTimers() {
    clearInterval(matchInterval);
    clearTimeout(matchTimeoutId);
    clearInterval(introCountdownInterval);
    matchInterval = null;
    matchTimeoutId = null;
    introCountdownInterval = null;
  }

  function stopMatchmaking(reasonText = null) {
    if (isMatching) {
      emitCancelMatchmaking();
    }
    isMatching = false;
    clearInterval(matchInterval);
    clearTimeout(matchTimeoutId);
    matchInterval = null;
    matchTimeoutId = null;
    matchElapsedSeconds = 0;

    const matchBtn = document.getElementById('rc-match-btn');
    const statusBox = document.getElementById('rc-match-status-box');
    const statusMsg = document.getElementById('rc-match-status-msg');
    const infoList = document.getElementById('rc-confirm-info-list');
    const changeModeBtn = document.getElementById('rc-change-mode-btn');
    const backBtn = document.getElementById('rc-back-btn');
    const topBackBtn = document.getElementById('rc-top-back-btn');

    if (matchBtn) {
      matchBtn.disabled = false;
      matchBtn.innerHTML = `${iconShuffle} <span>Start Matching</span>`;
    }
    if (changeModeBtn) changeModeBtn.disabled = false;
    if (backBtn) backBtn.disabled = false;
    if (topBackBtn) topBackBtn.disabled = false;

    if (reasonText) {
      if (statusBox) statusBox.classList.remove('hidden');
      if (statusMsg) {
        statusMsg.textContent = reasonText;
        statusMsg.style.color = '#A31C1B';
      }
      const timerEl = document.getElementById('rc-match-status-timer');
      if (timerEl) timerEl.textContent = 'Timed out';
    } else {
      if (statusBox) statusBox.classList.add('hidden');
      if (infoList) infoList.classList.remove('hidden');
    }
  }

  function startMatchmaking() {
    if (isMatching) return; // Prevent duplicate requests
    isMatching = true;
    matchElapsedSeconds = 0;

    // Ensure socket is live
    initSocket();
    emitStartMatchmaking(selectedMode);

    const matchBtn = document.getElementById('rc-match-btn');
    const statusBox = document.getElementById('rc-match-status-box');
    const statusMsg = document.getElementById('rc-match-status-msg');
    const timerEl = document.getElementById('rc-match-status-timer');
    const infoList = document.getElementById('rc-confirm-info-list');
    const changeModeBtn = document.getElementById('rc-change-mode-btn');
    const backBtn = document.getElementById('rc-back-btn');
    const topBackBtn = document.getElementById('rc-top-back-btn');

    if (matchBtn) {
      matchBtn.disabled = true;
      matchBtn.innerHTML = `${iconConnecting} <span>Finding someone for you...</span>`;
    }
    if (changeModeBtn) changeModeBtn.disabled = true;
    if (backBtn) backBtn.disabled = true;
    if (topBackBtn) topBackBtn.disabled = true;

    if (infoList) infoList.classList.add('hidden');
    if (statusBox) statusBox.classList.remove('hidden');
    if (statusMsg) {
      statusMsg.textContent = 'Finding someone for you...';
      statusMsg.style.color = '';
    }
    if (timerEl) timerEl.textContent = '0:60';

    // 1-second interval to update remaining time
    matchInterval = setInterval(() => {
      matchElapsedSeconds += 1;
      const remaining = Math.max(0, MATCHMAKING_TIMEOUT_SEC - matchElapsedSeconds);
      const min = Math.floor(remaining / 60);
      const sec = String(remaining % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${min}:${sec}`;

      if (remaining <= 0) {
        stopMatchmaking('No match found within 60 seconds. Please try again!');
      }
    }, 1000);

    // Hard safety timeout at 60 seconds
    matchTimeoutId = setTimeout(() => {
      stopMatchmaking('No match found within 60 seconds. Please try again!');
    }, MATCHMAKING_TIMEOUT_SEC * 1000);
  }

  // ── Show Stranger Introduction Screen ────────────────────────────────────
  function showStrangerIntroduction({ matchId, strangerTempName, myTempName, mode, timeoutSec = 30 }) {
    cleanupAllTimers();
    isMatching = false;
    isIntroActive = true;
    currentMatchId = matchId;
    currentStrangerTempName = strangerTempName;
    currentMyTempName = myTempName;
    selectedMode = mode || selectedMode;
    hasUserConfirmedChat = false;

    // Hide selection & confirm screens
    document.getElementById('rc-selection-screen')?.classList.add('hidden');
    document.getElementById('rc-confirm-screen')?.classList.add('hidden');

    const introScreen = document.getElementById('rc-intro-screen');
    const usernameEl = document.getElementById('rc-intro-username');
    const modeDescEl = document.getElementById('rc-intro-mode-desc');
    const timeLeftEl = document.getElementById('rc-intro-time-left');
    const timerBarEl = document.getElementById('rc-intro-timer-bar');
    const actionsBox = document.getElementById('rc-intro-actions');
    const timeoutBox = document.getElementById('rc-intro-timeout-notice');
    const startChatBtn = document.getElementById('rc-start-chatting-btn');
    const feedbackMsg = document.getElementById('rc-intro-status-feedback');
    const timerWrap = document.getElementById('rc-intro-timer-wrap');

    if (usernameEl) usernameEl.textContent = strangerTempName || 'Stranger_4821';
    if (modeDescEl) {
      modeDescEl.textContent = selectedMode === 'video' ? 'Live video chat request' : 'Live text chat request';
    }

    if (actionsBox) actionsBox.classList.remove('hidden');
    if (timeoutBox) timeoutBox.classList.add('hidden');
    if (timerWrap) timerWrap.classList.remove('hidden');
    if (feedbackMsg) feedbackMsg.classList.add('hidden');

    if (startChatBtn) {
      startChatBtn.disabled = false;
      startChatBtn.innerHTML = `<span>Start Chatting</span>`;
    }

    // Reset 30s countdown bar
    introRemainingSeconds = timeoutSec;
    if (timeLeftEl) timeLeftEl.textContent = `0:${String(introRemainingSeconds).padStart(2, '0')}`;
    if (timerBarEl) {
      timerBarEl.style.transition = 'none';
      timerBarEl.style.width = '100%';
      requestAnimationFrame(() => {
        timerBarEl.style.transition = 'width 1s linear';
      });
    }

    if (introScreen) {
      introScreen.classList.remove('hidden');
      introScreen.style.animation = 'none';
      requestAnimationFrame(() => {
        introScreen.style.animation = '';
      });
    }

    // Start 30-second response countdown
    introCountdownInterval = setInterval(() => {
      introRemainingSeconds -= 1;
      if (timeLeftEl) {
        timeLeftEl.textContent = `0:${String(Math.max(0, introRemainingSeconds)).padStart(2, '0')}`;
      }
      if (timerBarEl) {
        const pct = Math.max(0, (introRemainingSeconds / 30) * 100);
        timerBarEl.style.width = `${pct}%`;
      }

      if (introRemainingSeconds <= 0) {
        handleIntroTimeoutUI();
      }
    }, 1000);
  }

  function handleIntroTimeoutUI(msg = "The stranger didn't respond. Find someone else?") {
    clearInterval(introCountdownInterval);
    introCountdownInterval = null;
    isIntroActive = false;

    const actionsBox = document.getElementById('rc-intro-actions');
    const timeoutBox = document.getElementById('rc-intro-timeout-notice');
    const timerWrap = document.getElementById('rc-intro-timer-wrap');
    const timeoutMsgEl = timeoutBox?.querySelector('.rc-intro-timeout-msg');

    if (actionsBox) actionsBox.classList.add('hidden');
    if (timerWrap) timerWrap.classList.add('hidden');
    if (timeoutBox) timeoutBox.classList.remove('hidden');
    if (timeoutMsgEl) timeoutMsgEl.textContent = msg;
  }

  function onConfirmChatClicked() {
    if (hasUserConfirmedChat) return; // Prevent duplicate clicks
    if (!currentMatchId) {
      showToast('No active match session.', 'error');
      return;
    }

    hasUserConfirmedChat = true;
    const btn = document.getElementById('rc-start-chatting-btn');
    const feedback = document.getElementById('rc-intro-status-feedback');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="rc-spinner"></span> <span>Connecting...</span>`;
    }
    if (feedback) {
      feedback.classList.remove('hidden');
      feedback.textContent = 'Ready! Waiting for stranger to confirm...';
    }

    emitAcceptStrangerIntro(currentMatchId);
  }

  // ── Show Confirmation Screen ──────────────────────────────────────────────
  function showConfirm(mode) {
    selectedMode = mode;
    const isVideo = mode === 'video';

    // Cancel any active matchmaking / intro if transitioning
    stopMatchmaking();
    cleanupAllTimers();
    document.getElementById('rc-intro-screen')?.classList.add('hidden');

    const iconEl = document.getElementById('rc-confirm-icon');
    const titleEl = document.getElementById('rc-confirm-title');
    const subEl = document.getElementById('rc-confirm-sub');
    const tagEl = document.getElementById('rc-mode-tag');

    if (iconEl) {
      iconEl.innerHTML = isVideo ? iconVideo : iconChat;
      iconEl.className = `rc-confirm-icon ${isVideo ? 'video-mode' : 'text-mode'}`;
    }
    if (titleEl) {
      titleEl.textContent = isVideo ? 'Ready for Video Chat?' : 'Ready for Text Chat?';
    }
    if (subEl) {
      subEl.textContent = isVideo
        ? 'Talk face-to-face with a stranger! Camera & microphone will activate once matched.'
        : 'Start a live text conversation with someone worldwide. No camera required.';
    }
    if (tagEl) {
      tagEl.textContent = isVideo ? 'Video Mode' : 'Text Mode';
      tagEl.className = `rc-mode-tag ${isVideo ? 'video-mode' : 'text-mode'}`;
    }

    document.getElementById('rc-selection-screen')?.classList.add('hidden');
    const confirmScreen = document.getElementById('rc-confirm-screen');
    if (confirmScreen) {
      confirmScreen.classList.remove('hidden');
      confirmScreen.style.animation = 'none';
      requestAnimationFrame(() => {
        confirmScreen.style.animation = '';
      });
    }
  }

  function showSelection() {
    stopMatchmaking();
    cleanupAllTimers();
    document.getElementById('rc-intro-screen')?.classList.add('hidden');
    document.getElementById('rc-confirm-screen')?.classList.add('hidden');
    document.getElementById('rc-selection-screen')?.classList.remove('hidden');

    // Highlight the preserved selected mode card
    document.getElementById('rc-card-text')?.classList.toggle('active-mode', selectedMode === 'text');
    document.getElementById('rc-card-video')?.classList.toggle('active-mode', selectedMode === 'video');
  }

  // ── Wire Socket Listeners for Real Matchmaking & Intro ───────────────────
  unsubs.push(
    onRandomMatchFound((data) => {
      // Transition from matchmaking to Stranger Introduction Screen
      showStrangerIntroduction(data);
    })
  );

  unsubs.push(
    onStrangerWaitingConfirmation(() => {
      const feedback = document.getElementById('rc-intro-status-feedback');
      if (feedback && !hasUserConfirmedChat) {
        feedback.classList.remove('hidden');
        feedback.textContent = 'Stranger is ready and waiting for you!';
        feedback.style.color = '#ff9d9d';
      }
    })
  );

  unsubs.push(
    onRandomChatReady((data) => {
      cleanupAllTimers();
      isIntroActive = false;
      const targetRoute = data.mode === 'video' ? 'randomVideoChat' : 'randomTextChat';
      showToast('Both connected! Starting session...', 'success');
      // Navigate to the appropriate chat interface when implemented
      onNavigate?.(targetRoute, {
        matchId: data.matchId,
        mode: data.mode,
        strangerTempName: currentStrangerTempName,
        myTempName: currentMyTempName,
      });
    })
  );

  unsubs.push(
    onStrangerIntroTimeout((data) => {
      handleIntroTimeoutUI(data.message || "The stranger didn't respond. Find someone else?");
    })
  );

  unsubs.push(
    onStrangerDisconnected((data) => {
      if (isIntroActive) {
        handleIntroTimeoutUI(data.message || 'The stranger disconnected. Find someone else?');
      }
    })
  );

  // ── Card clicks from selection screen ────────────────────────────────────
  document.getElementById('rc-start-text')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirm('text');
  });
  document.getElementById('rc-start-video')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showConfirm('video');
  });

  // Keyboard accessibility on cards
  ['rc-card-text', 'rc-card-video'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const mode = e.currentTarget.dataset.mode;
        showConfirm(mode);
      }
    });
  });

  // Confirmation screen buttons:
  // 1. Primary "Start Matching"
  document.getElementById('rc-match-btn')?.addEventListener('click', () => {
    startMatchmaking();
  });

  // Cancel button while matching
  document.getElementById('rc-cancel-match-btn')?.addEventListener('click', () => {
    stopMatchmaking();
  });

  // 2. Secondary "Change Mode" button
  document.getElementById('rc-change-mode-btn')?.addEventListener('click', showSelection);

  // 3. "Back" button inside confirmation card
  document.getElementById('rc-back-btn')?.addEventListener('click', showSelection);

  // 4. "Back" navigation top-row button
  document.getElementById('rc-top-back-btn')?.addEventListener('click', showSelection);

  // ── Stranger Introduction Screen buttons: ────────────────────────────────
  // "Start Chatting" button
  document.getElementById('rc-start-chatting-btn')?.addEventListener('click', () => {
    onConfirmChatClicked();
  });

  // "Find New Stranger" button after timeout or disconnect
  document.getElementById('rc-find-new-btn')?.addEventListener('click', () => {
    // Return to confirmation screen and start fresh matchmaking
    showConfirm(selectedMode);
    startMatchmaking();
  });

  // If autoMatchMode is requested (e.g. from "Next Stranger" action)
  if (autoMatchMode) {
    showConfirm(autoMatchMode);
    startMatchmaking();
  }
}

