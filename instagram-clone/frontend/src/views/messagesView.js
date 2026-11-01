import { LOGO_IMG, icons } from '../constants.js';
import { messageApi, userApi } from '../services/api.js';
import { getSessionUser } from '../state/session.js';
import { toggleTheme } from '../state/theme.js';
import {
  onReceiveMessage,
  onUpdateConversationOrder,
  onMessagesRead,
  onUserTyping,
  onUserStopTyping,
  onMessageEdited,
  onMessageDeleted,
  onMessageReaction,
  onConversationSettingsUpdated,
  onUserStatusChange,
  emitTyping,
  emitStopTyping,
} from '../services/socket.js';
import { escapeHtml, mediaSrc, timeAgo, showToast, showModal } from '../utils/dom.js';
import { startOutgoingCall, initCallManager } from '../components/callModal.js';

let _msgViewCleanups = [];

function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export async function renderMessages(container, { initialConversationId = null, onNavigate, onGoBack } = {}) {
  // Tear down socket listeners from previous visits
  _msgViewCleanups.forEach((fn) => { try { fn(); } catch {} });
  _msgViewCleanups = [];

  const currentUser = getSessionUser();
  const currentUserId = currentUser?._id || currentUser?.id;

  // Initialize WebRTC calling listeners
  initCallManager(currentUser);

  // Request browser notification permission politely
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch {}
  }

  let conversations = [];
  let activeConvId = initialConversationId;
  let activeOtherUser = null;
  let activeWallpaper = 'default';
  let activeNickname = '';
  let conversationSearchQuery = '';
  let inChatSearchQuery = '';
  let isSearchingChat = false;
  let activeReplyTo = null; // { messageId, senderName, text, mediaUrl }
  let typingTimeout = null;

  // Audio recording state
  let mediaRecorder = null;
  let audioChunks = [];
  let recordedAudioBlob = null;
  let recordingInterval = null;
  let recordingSeconds = 0;

  // Staged attachment
  let stagedFile = null;

  // Camera capture stream
  let cameraStream = null;

  container.innerHTML = `
  <div class="vd-layout messages-full-layout">

    <!-- Fixed Left Sidebar: Existing VELOVE navigation -->
    <aside class="vd-sidebar" role="navigation" aria-label="Main navigation">
      <a class="vd-logo-row" href="#/" aria-label="VELOVE home">
        <img src="${LOGO_IMG}" class="vd-logo-img" alt="VELOVE logo" loading="lazy" />
        <span class="vd-logo-text">VELOVE</span>
      </a>

      <nav class="vd-nav" role="list">
        <button id="sbnav-home" class="vd-nav-item" data-route="home">
          ${icons.home}<span>Home</span>
        </button>
        <button id="sbnav-messages" class="vd-nav-item active" data-route="messages">
          ${icons.message}<span>Messages</span>
          <span class="vd-nav-badge" id="sb-msg-unread-badge" style="display:none">0</span>
        </button>
        <button id="sbnav-random" class="vd-nav-item" data-route="random-connect">
          ${icons.randomConnect}<span>Random Connect</span>
        </button>
        <button id="sbnav-notifs" class="vd-nav-item" data-route="notifs">
          ${icons.bell}<span>Notifications</span>
        </button>
        <button id="sbnav-create" class="vd-nav-item vd-create" data-route="create">
          ${icons.plus}<span>Create Post</span>
        </button>
        <button id="sbnav-saved" class="vd-nav-item" data-route="saved">
          ${icons.saved}<span>Saved Posts</span>
        </button>
        <button id="sbnav-settings" class="vd-nav-item" data-route="settings" style="margin-top:auto;">
          ${icons.settings}<span>Settings</span>
        </button>
      </nav>

      <button id="sbnav-user-footer" class="vd-sidebar-user">
        <img class="vd-sidebar-avatar" src="${currentUser?.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
        <div class="vd-sidebar-user-info">
          <span class="vd-sidebar-user-name">${escapeHtml(currentUser?.fullName || currentUser?.username || 'You')}</span>
          <span class="vd-sidebar-user-handle">@${escapeHtml(currentUser?.username || '')}</span>
        </div>
      </button>
    </aside>

    <!-- Main Messages Container (2 Columns: Conversation Panel + Chat Panel) -->
    <main class="vd-main msg-main-container">

      <!-- Conversation Panel (Middle column) -->
      <aside class="msg-conv-panel" id="msg-conv-panel">
        <div class="msg-conv-header">
          <div class="msg-search-box">
            <span class="msg-search-icon">${icons.search}</span>
            <input type="text" id="conv-search-input" class="msg-search-input" placeholder="Search chats…" autocomplete="off" />
          </div>
          <button id="msg-theme-toggle-btn" class="msg-icon-action-btn" title="Toggle theme" aria-label="Toggle theme">
            ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
          </button>
          <button id="msg-new-chat-btn" class="msg-icon-action-btn" title="New Chat">
            ${icons.edit || icons.plus}
          </button>
        </div>



        <!-- Conversations List -->
        <div class="msg-conv-list" id="msg-conv-list">
          <div class="msg-loading-spinner">Loading chats…</div>
        </div>
      </aside>

      <!-- Main Chat Panel (Right wide column) -->
      <section class="msg-chat-viewport ${activeConvId ? 'open' : ''}" id="msg-chat-viewport">

        <!-- Default Blank State -->
        <div class="msg-empty-placeholder ${activeConvId ? 'hidden' : ''}" id="msg-empty-placeholder">
          <div class="msg-empty-art">
            <span class="empty-bubble-icon">${icons.message}</span>
          </div>
          <h2 class="empty-title">Select a conversation to start messaging</h2>
          <p class="empty-sub">Send real-time messages, photos, voice notes, files, or make audio & video calls.</p>
          <button id="empty-start-chat-btn" class="vd-btn-primary">Start New Chat</button>
        </div>

        <!-- Active Chat Screen -->
        <div class="msg-active-screen ${activeConvId ? '' : 'hidden'}" id="msg-active-screen">

          <!-- Chat Header -->
          <header class="msg-chat-header" id="msg-chat-header">
            <button id="msg-mobile-back" class="nav-btn msg-mobile-back" title="Back to conversations">
              ${icons.arrowLeft}
            </button>

            <!-- Clickable user info navigates to separate Profile Info Page -->
            <div class="msg-header-user-clickable" id="msg-header-user-btn" role="button" tabindex="0" title="View profile info">
              <div class="msg-header-avatar-wrap">
                <img id="msg-hdr-avatar" class="avatar sm" src="${LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
                <span id="msg-hdr-online-dot" class="online-indicator-dot hidden"></span>
              </div>
              <div class="msg-header-meta">
                <strong id="msg-hdr-name" class="msg-hdr-name">User</strong>
                <span id="msg-hdr-status" class="msg-hdr-status">Offline</span>
              </div>
            </div>

            <!-- In-Chat Search Bar (Toggleable) -->
            <div class="msg-inchat-search-wrap hidden" id="msg-inchat-search-wrap">
              <input type="text" id="msg-inchat-search-input" placeholder="Search in chat…" />
              <button id="msg-inchat-search-close" class="inchat-search-close">✕</button>
            </div>

            <!-- Header Action Buttons -->
            <div class="msg-hdr-actions">
              <button id="msg-btn-search-toggle" class="msg-hdr-btn" title="Search in chat">
                ${icons.search}
              </button>
              <button id="msg-btn-audio-call" class="msg-hdr-btn" title="Audio Call">
                ${icons.phone}
              </button>
              <button id="msg-btn-video-call" class="msg-hdr-btn" title="Video Call">
                ${icons.video}
              </button>
              <div class="msg-more-menu-wrap">
                <button id="msg-btn-more-options" class="msg-hdr-btn" title="More options">
                  ${icons.moreH}
                </button>
                <div class="msg-dropdown-menu hidden" id="msg-dropdown-menu">
                  <button id="menu-opt-info" class="menu-item">${icons.user} View Profile Info</button>
                  <button id="menu-opt-theme" class="menu-item">🎨 Change Wallpaper</button>
                  <button id="menu-opt-mute" class="menu-item">🔔 Mute Notifications</button>
                  <button id="menu-opt-block" class="menu-item text-danger">🚫 Block User</button>
                  <button id="menu-opt-report" class="menu-item text-danger">⚠️ Report User</button>
                </div>
              </div>
            </div>
          </header>

          <!-- Chat Stream (Message Bubbles & Wallpaper container) -->
          <div class="msg-stream-container" id="msg-stream-container">
            <div class="msg-stream" id="msg-stream">
              <div class="msg-loading-spinner">Loading messages…</div>
            </div>

            <!-- Typing Indicator floating at bottom of stream -->
            <div class="msg-typing-banner hidden" id="msg-typing-banner">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span id="msg-typing-text">typing…</span>
            </div>
          </div>

          <!-- Staged Reply Banner -->
          <div class="msg-reply-banner hidden" id="msg-reply-banner">
            <div class="reply-banner-content">
              <span class="reply-to-label">Replying to <strong id="reply-to-user">User</strong></span>
              <span class="reply-to-snippet" id="reply-to-snippet">Text snippet</span>
            </div>
            <button id="reply-banner-cancel" class="reply-banner-close" title="Cancel reply">✕</button>
          </div>

          <!-- Staged Attachment Preview -->
          <div class="msg-attachment-preview hidden" id="msg-attachment-preview">
            <div class="attachment-preview-inner">
              <div id="attachment-preview-thumb"></div>
              <div class="attachment-meta">
                <span id="attachment-preview-name">file.jpg</span>
                <span id="attachment-preview-size">1.2 MB</span>
              </div>
            </div>
            <button id="attachment-preview-clear" class="attachment-preview-close" title="Remove attachment">✕</button>
          </div>

          <!-- Voice Recording Bar (replaces composer when recording) -->
          <div class="msg-voice-recorder-bar hidden" id="msg-voice-recorder-bar">
            <div class="voice-recording-indicator">
              <span class="recording-red-dot pulse"></span>
              <span id="voice-timer">00:00</span>
            </div>
            <div class="voice-waveform-sim">
              <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
            </div>
            <!-- Audio preview player if recording is stopped -->
            <audio id="voice-preview-player" class="hidden" controls></audio>

            <div class="voice-recorder-actions">
              <button id="voice-cancel-btn" class="voice-action-btn delete" title="Cancel recording">
                ${icons.trash}
              </button>
              <button id="voice-stop-btn" class="voice-action-btn stop" title="Stop & Preview">
                ⏹
              </button>
              <button id="voice-send-btn" class="voice-action-btn send" title="Send Voice Message">
                ${icons.send}
              </button>
            </div>
          </div>

          <!-- Main Composer Form -->
          <form class="msg-composer-bar" id="msg-composer-bar" autocomplete="off">
            <!-- Hidden inputs -->
            <input type="file" id="composer-file-input" style="display:none" />

            <!-- Emoji Popover (inside composer so position:absolute works correctly) -->
            <div class="msg-emoji-popover hidden" id="msg-emoji-popover">
              <div class="emoji-search-row">
                <input type="text" id="emoji-search-input" class="emoji-search-input" placeholder="Search emoji…" autocomplete="off" />
              </div>
              <div class="emoji-grid" id="emoji-grid">
                ${[
                  '😀','😃','😄','😁','😆','😅','😂','🤣','🥹','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🤭','🥱','😴','🤤','😷','🤒','🤕','🤢','🤮','🤧','🥴','😵','🤐','🤠','💩','👻','💀','👽','🤖','🎃','😺','😸','😹','😻','😼',
                  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨',
                  '🕊️','🦄','🐶','🐱','🐼','🦊','🌴','🏖️','🌊','☀️','⚡','🔥','✨','🚀','🚢','🎉','🎈','🎂','🥂','🍻','☕','🍕','🍔','🍟','🍣','🎮','🎧','📸','📱','💻','💡',
                  '👍','👎','👏','🙌','🤝','🙏','✌️','🤞','🤙','👊','✊','🤛','🤜','🖐️','✋','☝️','👆','👇','👈','👉'
                ].map(e => `<span class="emoji-item">${e}</span>`).join('')}
              </div>
            </div>

            <div class="composer-left-actions">
              <!-- Emoji Picker Button -->
              <button type="button" id="composer-emoji-btn" class="composer-icon-btn" title="Emoji">
                😊
              </button>
              <!-- Photo/Video Attachment Button -->
              <button type="button" id="composer-media-btn" class="composer-icon-btn" title="Photo/Video">
                ${icons.image}
              </button>
              <!-- Camera Capture Button -->
              <button type="button" id="composer-camera-btn" class="composer-icon-btn" title="Take Photo">
                ${icons.camera}
              </button>
              <!-- File Attachment Button -->
              <button type="button" id="composer-doc-btn" class="composer-icon-btn" title="Attach Document/File">
                📎
              </button>
              <!-- Voice Note Button -->
              <button type="button" id="composer-mic-btn" class="composer-icon-btn" title="Voice Message">
                🎙️
              </button>
            </div>

            <!-- Auto-growing Textarea -->
            <textarea
              id="composer-textarea"
              class="composer-input"
              rows="1"
              placeholder="Type a message…"
              maxlength="4000"
            ></textarea>

            <!-- Send Button -->
            <button type="submit" id="composer-send-btn" class="composer-send-circle-btn" title="Send">
              ${icons.send}
            </button>
          </form>

        </div><!-- /#msg-active-screen -->
      </section>
    </main>

  </div>

  <!-- Camera Viewfinder Modal -->
  <div class="camera-modal-backdrop hidden" id="camera-modal">
    <div class="camera-viewfinder-card">
      <div class="camera-header">
        <h4>Take Photo</h4>
        <button id="camera-close-btn" class="camera-close-btn">✕</button>
      </div>
      <div class="camera-preview-stage">
        <video id="camera-video" autoplay playsinline></video>
        <canvas id="camera-canvas" class="hidden"></canvas>
      </div>
      <div class="camera-actions-footer">
        <button id="camera-snap-btn" class="camera-snap-circle" title="Capture"></button>
        <button id="camera-retake-btn" class="link-btn hidden">Retake</button>
        <button id="camera-use-btn" class="vd-btn-primary hidden">Use Photo</button>
      </div>
    </div>
  </div>

  <!-- Forward Message Modal -->
  <div class="forward-modal-backdrop hidden" id="forward-modal">
    <div class="forward-card">
      <div class="forward-head">
        <h4>Forward to…</h4>
        <button id="forward-close-btn" class="forward-close">✕</button>
      </div>
      <div class="forward-conv-list" id="forward-conv-list"></div>
    </div>
  </div>

  <!-- Wallpaper Picker Modal -->
  <div class="wallpaper-modal-backdrop hidden" id="wallpaper-modal">
    <div class="wallpaper-modal-card">
      <div class="wallpaper-modal-head">
        <h4>Chat Wallpaper</h4>
        <button id="wp-modal-close" class="wp-modal-close-btn">✕</button>
      </div>
      <p class="wp-modal-sub">Choose a background theme for this conversation:</p>
      <div class="wp-modal-grid">
        <button class="wp-choice-btn" data-theme="default">
          <span class="wp-choice-preview default-dark"></span>
          <span>Default Dark</span>
        </button>
        <button class="wp-choice-btn" data-theme="sunset">
          <span class="wp-choice-preview sunset-beach"></span>
          <span>Sunset Beach 🌅</span>
        </button>
        <button class="wp-choice-btn" data-theme="emerald">
          <span class="wp-choice-preview dark-emerald"></span>
          <span>Dark Emerald 🌲</span>
        </button>
        <button class="wp-choice-btn" data-theme="nebula">
          <span class="wp-choice-preview crimson-nebula"></span>
          <span>Crimson Nebula 🌌</span>
        </button>
        <button class="wp-choice-btn" data-theme="midnight">
          <span class="wp-choice-preview midnight-city"></span>
          <span>Midnight 🌃</span>
        </button>
      </div>
      <div class="wp-custom-row">
        <label for="wp-inline-picker">Custom Color:</label>
        <input type="color" id="wp-inline-picker" value="#171717" />
        <button id="wp-apply-inline-color" class="vd-btn-primary" style="padding:6px 14px;font-size:12px;">Apply</button>
        <button id="wp-reset-inline" class="vd-btn-primary secondary" style="padding:6px 14px;font-size:12px;">Reset</button>
      </div>
    </div>
  </div>

  <!-- Image Lightbox -->
  <div class="img-lightbox-backdrop hidden" id="img-lightbox">
    <button class="img-lightbox-close" id="img-lightbox-close" title="Close">✕</button>
    <button class="img-lightbox-download" id="img-lightbox-download" title="Download">⬇</button>
    <div class="img-lightbox-inner">
      <img id="img-lightbox-img" src="" alt="Full size image" />
    </div>
  </div>`;

  // ── Sidebar Nav Handlers ─────────────────────────────────────
  container.querySelectorAll('.vd-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route === 'messages') return;
      onNavigate?.(route);
    });
  });

  document.getElementById('sbnav-user-footer')?.addEventListener('click', () => {
    onNavigate?.('profile', { username: currentUser?.username });
  });

  document.getElementById('msg-mobile-back')?.addEventListener('click', () => {
    activeConvId = null;
    document.getElementById('msg-chat-viewport')?.classList.remove('open');
    document.getElementById('msg-active-screen')?.classList.add('hidden');
    document.getElementById('msg-empty-placeholder')?.classList.remove('hidden');
    renderConversationList();
  });

  // ── Clickable Chat Header navigates to Separate Profile Info Page ─────────
  document.getElementById('msg-header-user-btn')?.addEventListener('click', () => {
    if (activeOtherUser?._id) {
      onNavigate?.('chatInfo', { targetUserId: activeOtherUser._id, conversationId: activeConvId });
    }
  });

  // ── More Options Dropdown ───────────────────────────────────
  const moreBtn = document.getElementById('msg-btn-more-options');
  const dropMenu = document.getElementById('msg-dropdown-menu');
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropMenu?.classList.toggle('hidden');
  });
  document.addEventListener('click', () => dropMenu?.classList.add('hidden'));

  document.getElementById('menu-opt-info')?.addEventListener('click', () => {
    if (activeOtherUser?._id) {
      onNavigate?.('chatInfo', { targetUserId: activeOtherUser._id, conversationId: activeConvId });
    }
  });

  document.getElementById('menu-opt-theme')?.addEventListener('click', () => {
    openWallpaperModal();
  });

  document.getElementById('menu-opt-mute')?.addEventListener('click', async () => {
    if (!activeConvId) return;
    try {
      await messageApi.updateSettings(activeConvId, { isMuted: true });
      showToast('Notifications muted for this chat', 'info');
    } catch {
      showToast('Could not mute chat', 'error');
    }
  });

  document.getElementById('menu-opt-block')?.addEventListener('click', () => {
    if (!activeOtherUser?._id) return;
    showModal({
      title: `Block @${activeOtherUser.username}?`,
      body: `<p>They will not be able to send you messages or calls on VELOVE.</p>`,
      confirmLabel: 'Block',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await userApi.toggleBlock(activeOtherUser._id);
          showToast('User blocked', 'success');
        } catch {
          showToast('Could not block user', 'error');
        }
      },
    });
  });

  document.getElementById('menu-opt-report')?.addEventListener('click', () => {
    if (!activeOtherUser?._id) return;
    showModal({
      title: `Report @${activeOtherUser.username}`,
      body: `<p>Report this conversation to VELOVE safety team for spam or harassment.</p>`,
      confirmLabel: 'Submit Report',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await userApi.reportUser(activeOtherUser._id, 'Chat harassment');
          showToast('Report submitted', 'success');
        } catch {
          showToast('Could not report user', 'error');
        }
      },
    });
  });

  // ── In-Chat Search ──────────────────────────────────────────
  const searchToggleBtn = document.getElementById('msg-btn-search-toggle');
  const inChatSearchWrap = document.getElementById('msg-inchat-search-wrap');
  const inChatSearchInput = document.getElementById('msg-inchat-search-input');
  const inChatSearchClose = document.getElementById('msg-inchat-search-close');

  searchToggleBtn?.addEventListener('click', () => {
    isSearchingChat = !isSearchingChat;
    inChatSearchWrap?.classList.toggle('hidden', !isSearchingChat);
    if (isSearchingChat) inChatSearchInput?.focus();
    else {
      inChatSearchQuery = '';
      if (inChatSearchInput) inChatSearchInput.value = '';
      filterMessageBubbles();
    }
  });

  inChatSearchClose?.addEventListener('click', () => {
    isSearchingChat = false;
    inChatSearchWrap?.classList.add('hidden');
    inChatSearchQuery = '';
    if (inChatSearchInput) inChatSearchInput.value = '';
    filterMessageBubbles();
  });

  inChatSearchInput?.addEventListener('input', (e) => {
    inChatSearchQuery = e.target.value.toLowerCase().trim();
    filterMessageBubbles();
  });

  function filterMessageBubbles() {
    const bubbles = document.querySelectorAll('.msg-bubble-wrap');
    bubbles.forEach((b) => {
      if (!inChatSearchQuery) {
        b.style.display = '';
        return;
      }
      const text = b.querySelector('.msg-text')?.textContent?.toLowerCase() || '';
      b.style.display = text.includes(inChatSearchQuery) ? '' : 'none';
    });
  }

  // ── Audio & Video Call Buttons ──────────────────────────────
  document.getElementById('msg-btn-audio-call')?.addEventListener('click', () => {
    if (!activeOtherUser) return;
    startOutgoingCall({
      targetUser: activeOtherUser,
      callType: 'audio',
      conversationId: activeConvId,
      currentUser,
    });
  });

  document.getElementById('msg-btn-video-call')?.addEventListener('click', () => {
    if (!activeOtherUser) return;
    startOutgoingCall({
      targetUser: activeOtherUser,
      callType: 'video',
      conversationId: activeConvId,
      currentUser,
    });
  });

  // ── Conversation Search Bar ─────────────────────────────────
  const convSearchInput = document.getElementById('conv-search-input');
  convSearchInput?.addEventListener('input', (e) => {
    conversationSearchQuery = e.target.value.toLowerCase().trim();
    renderConversationList();
  });

  // ── New Chat Button ─────────────────────────────────────────
  const openNewChatModal = () => {
    showModal({
      title: 'New Conversation',
      body: `
        <input type="text" id="new-chat-search" class="info-input" placeholder="Search people by username…" />
        <div id="new-chat-results" style="max-height:260px;overflow-y:auto;margin-top:12px;display:flex;flex-direction:column;gap:6px;">
          <p class="vd-suggested-sub" style="padding:10px;text-align:center;">Type to search users…</p>
        </div>
      `,
      confirmLabel: 'Cancel',
      confirmClass: 'btn-secondary',
      onConfirm: () => {},
    });

    const searchInp = document.getElementById('new-chat-search');
    const resultsBox = document.getElementById('new-chat-results');
    let timer;
    searchInp?.addEventListener('input', (e) => {
      clearTimeout(timer);
      const q = e.target.value.trim();
      if (!q) {
        if (resultsBox) resultsBox.innerHTML = '<p class="vd-suggested-sub" style="padding:10px;text-align:center;">Type to search users…</p>';
        return;
      }
      timer = setTimeout(async () => {
        try {
          const res = await userApi.search(q);
          const users = res.users || [];
          if (!users.length) {
            resultsBox.innerHTML = '<p class="vd-suggested-sub" style="padding:10px;text-align:center;">No users found</p>';
            return;
          }
          resultsBox.innerHTML = users.map((u) => `
            <button class="new-chat-user-row" data-uid="${u._id}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:none;border:none;color:#fff;cursor:pointer;border-radius:8px;text-align:left;width:100%;">
              <img src="${u.avatar || LOGO_IMG}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" />
              <div>
                <strong style="display:block;font-size:13px;">${escapeHtml(u.fullName || u.username)}</strong>
                <small style="color:#8A8580;font-size:11px;">@${escapeHtml(u.username)}</small>
              </div>
            </button>
          `).join('');

          resultsBox.querySelectorAll('.new-chat-user-row').forEach((row) => {
            row.addEventListener('click', async () => {
              const uid = row.dataset.uid;
              document.querySelector('.modal-overlay')?.remove();
              // Start conversation or find existing
              try {
                const sendRes = await messageApi.sendMessage({ receiverId: uid, text: '👋 Hi!' });
                await loadConversations();
                selectConversation(sendRes.message.conversation);
              } catch (err) {
                showToast(err.message || 'Could not start chat', 'error');
              }
            });
          });
        } catch {}
      }, 300);
    });
  };

  document.getElementById('msg-new-chat-btn')?.addEventListener('click', openNewChatModal);
  document.getElementById('empty-start-chat-btn')?.addEventListener('click', openNewChatModal);

  // ── Theme toggle ──────────────────────────────────────────────────────────
  const msgThemeBtn = document.getElementById('msg-theme-toggle-btn');
  const syncMsgThemeIcon = () => {
    if (!msgThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    msgThemeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncMsgThemeIcon();
  msgThemeBtn?.addEventListener('click', () => { toggleTheme(); syncMsgThemeIcon(); });

  // ── Emoji Picker Setup ──────────────────────────────────────
  const emojiBtn = document.getElementById('composer-emoji-btn');
  const emojiPopover = document.getElementById('msg-emoji-popover');

  emojiBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPopover?.classList.toggle('hidden');
    if (!emojiPopover?.classList.contains('hidden')) {
      document.getElementById('emoji-search-input')?.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!emojiPopover?.contains(e.target) && e.target !== emojiBtn) {
      emojiPopover?.classList.add('hidden');
    }
  });

  // Emoji click — each emoji is wrapped in a <span class="emoji-item">
  document.getElementById('emoji-grid')?.addEventListener('click', (e) => {
    const item = e.target.closest('.emoji-item');
    if (!item) return;
    const emoji = item.textContent.trim();
    const textarea = document.getElementById('composer-textarea');
    if (textarea && emoji) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.slice(0, start) + emoji + val.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }
    emojiPopover?.classList.add('hidden');
  });

  // Emoji search filter
  document.getElementById('emoji-search-input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.emoji-item').forEach((el) => {
      el.style.display = q ? (el.textContent.includes(q) ? '' : 'none') : '';
    });
  });

  // ── Attachments Handling ────────────────────────────────────
  const fileInput = document.getElementById('composer-file-input');
  document.getElementById('composer-media-btn')?.addEventListener('click', () => {
    fileInput.accept = 'image/*,video/*';
    fileInput.click();
  });
  document.getElementById('composer-doc-btn')?.addEventListener('click', () => {
    fileInput.accept = '.pdf,.doc,.docx,.txt,.zip';
    fileInput.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) stageAttachment(file);
  });

  function stageAttachment(file) {
    stagedFile = file;
    const previewBox = document.getElementById('msg-attachment-preview');
    const nameEl = document.getElementById('attachment-preview-name');
    const sizeEl = document.getElementById('attachment-preview-size');
    const thumbEl = document.getElementById('attachment-preview-thumb');

    if (nameEl) nameEl.textContent = file.name;
    const mb = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;
    if (sizeEl) sizeEl.textContent = mb;

    if (thumbEl) {
      if (file.type.startsWith('image/')) {
        thumbEl.innerHTML = `<img src="${URL.createObjectURL(file)}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;" />`;
      } else {
        thumbEl.innerHTML = `<span style="font-size:24px;display:grid;place-items:center;width:48px;height:48px;background:rgba(255,255,255,0.06);border-radius:6px;">📎</span>`;
      }
    }

    previewBox?.classList.remove('hidden');
  }

  document.getElementById('attachment-preview-clear')?.addEventListener('click', () => {
    stagedFile = null;
    fileInput.value = '';
    document.getElementById('msg-attachment-preview')?.classList.add('hidden');
  });

  // ── Camera Capture Modal ────────────────────────────────────
  const cameraModal = document.getElementById('camera-modal');
  const cameraVideo = document.getElementById('camera-video');
  const cameraCanvas = document.getElementById('camera-canvas');
  const cameraSnapBtn = document.getElementById('camera-snap-btn');
  const cameraRetakeBtn = document.getElementById('camera-retake-btn');
  const cameraUseBtn = document.getElementById('camera-use-btn');
  const cameraCloseBtn = document.getElementById('camera-close-btn');

  document.getElementById('composer-camera-btn')?.addEventListener('click', async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (cameraVideo) cameraVideo.srcObject = cameraStream;
      cameraModal?.classList.remove('hidden');
      cameraCanvas?.classList.add('hidden');
      cameraVideo?.classList.remove('hidden');
      cameraSnapBtn?.classList.remove('hidden');
      cameraRetakeBtn?.classList.add('hidden');
      cameraUseBtn?.classList.add('hidden');
    } catch {
      showToast('Could not access camera', 'error');
    }
  });

  function closeCameraModal() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    cameraModal?.classList.add('hidden');
  }

  cameraCloseBtn?.addEventListener('click', closeCameraModal);

  // Forward modal dismiss & backdrop click
  const forwardModal = document.getElementById('forward-modal');
  document.getElementById('forward-close-btn')?.addEventListener('click', () => {
    forwardModal?.classList.add('hidden');
  });
  forwardModal?.addEventListener('click', (e) => {
    if (e.target.id === 'forward-modal') forwardModal.classList.add('hidden');
  });
  cameraModal?.addEventListener('click', (e) => {
    if (e.target.id === 'camera-modal') closeCameraModal();
  });
  const modalEscHandler = (e) => {
    if (e.key === 'Escape') {
      forwardModal?.classList.add('hidden');
      closeWallpaperModal();
      closeCameraModal();
    }
  };
  document.addEventListener('keydown', modalEscHandler);
  _msgViewCleanups.push(() => document.removeEventListener('keydown', modalEscHandler));

  // ── In-Chat Wallpaper Modal Handlers ─────────────────────────
  function openWallpaperModal() {
    if (!activeConvId) {
      showToast('Select a conversation first', 'info');
      return;
    }
    const wpModal = document.getElementById('wallpaper-modal');
    if (!wpModal) {
      console.warn('[Wallpaper] wallpaper-modal element not found!');
      return;
    }
    console.log('[Wallpaper] Opening modal. activeConvId:', activeConvId, 'activeWallpaper:', activeWallpaper);
    dropMenu?.classList.add('hidden');
    wpModal.classList.remove('hidden');

    wpModal.querySelectorAll('.wp-choice-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === activeWallpaper);
    });
  }

  function closeWallpaperModal() {
    document.getElementById('wallpaper-modal')?.classList.add('hidden');
  }

  document.getElementById('wp-modal-close')?.addEventListener('click', closeWallpaperModal);
  document.getElementById('wallpaper-modal')?.addEventListener('click', async (e) => {
    if (e.target.id === 'wallpaper-modal') {
      closeWallpaperModal();
      return;
    }
    const btn = e.target.closest('.wp-choice-btn');
    if (!btn) return;
    const theme = btn.dataset.theme;
    console.log('[Wallpaper] Theme button clicked:', theme);
    activeWallpaper = theme;
    applyChatWallpaper(theme);
    closeWallpaperModal();
    if (activeConvId) {
      try {
        await messageApi.updateSettings(activeConvId, { wallpaper: theme });
        showToast(`Wallpaper changed to ${btn.querySelector('span:last-child')?.textContent || theme}`, 'success');
      } catch {
        showToast('Could not save wallpaper setting', 'error');
      }
    }
  });

  document.getElementById('wp-apply-inline-color')?.addEventListener('click', async () => {
    const color = document.getElementById('wp-inline-picker')?.value;
    if (color && activeConvId) {
      activeWallpaper = color;
      applyChatWallpaper(color);
      closeWallpaperModal();
      try {
        await messageApi.updateSettings(activeConvId, { wallpaper: color });
        showToast('Custom wallpaper color applied', 'success');
      } catch {
        showToast('Could not save wallpaper setting', 'error');
      }
    }
  });

  document.getElementById('wp-reset-inline')?.addEventListener('click', async () => {
    activeWallpaper = 'default';
    applyChatWallpaper('default');
    closeWallpaperModal();
    if (activeConvId) {
      try {
        await messageApi.updateSettings(activeConvId, { wallpaper: 'default' });
        showToast('Wallpaper reset to default', 'success');
      } catch {
        showToast('Could not reset wallpaper', 'error');
      }
    }
  });

  // ── Image Lightbox ───────────────────────────────────────────
  function openLightbox(src) {
    const lightbox = document.getElementById('img-lightbox');
    const img = document.getElementById('img-lightbox-img');
    if (!lightbox || !img) return;
    img.src = src;
    lightbox.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    const lightbox = document.getElementById('img-lightbox');
    if (!lightbox) return;
    lightbox.classList.add('hidden');
    document.getElementById('img-lightbox-img').src = '';
    document.body.style.overflow = '';
  }

  document.getElementById('img-lightbox-close')?.addEventListener('click', closeLightbox);

  document.getElementById('img-lightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'img-lightbox' || e.target.classList.contains('img-lightbox-inner')) {
      closeLightbox();
    }
  });

  document.getElementById('img-lightbox-download')?.addEventListener('click', () => {
    const img = document.getElementById('img-lightbox-img');
    if (!img?.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = 'image';
    a.target = '_blank';
    a.click();
  });

  // Close lightbox on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // Delegate image clicks inside the stream
  document.getElementById('msg-stream')?.addEventListener('click', (e) => {
    const img = e.target.closest('.msg-img-clickable');
    if (img?.dataset.lightboxSrc) openLightbox(img.dataset.lightboxSrc);
  });

  let capturedBlob = null;
  cameraSnapBtn?.addEventListener('click', () => {
    if (!cameraVideo || !cameraCanvas) return;
    cameraCanvas.width = cameraVideo.videoWidth || 640;
    cameraCanvas.height = cameraVideo.videoHeight || 480;
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);

    cameraCanvas.toBlob((blob) => {
      capturedBlob = blob;
      cameraVideo.classList.add('hidden');
      cameraCanvas.classList.remove('hidden');
      cameraSnapBtn.classList.add('hidden');
      cameraRetakeBtn?.classList.remove('hidden');
      cameraUseBtn?.classList.remove('hidden');
    }, 'image/jpeg', 0.9);
  });

  cameraRetakeBtn?.addEventListener('click', () => {
    cameraVideo?.classList.remove('hidden');
    cameraCanvas?.classList.add('hidden');
    cameraSnapBtn?.classList.remove('hidden');
    cameraRetakeBtn?.classList.add('hidden');
    cameraUseBtn?.classList.add('hidden');
  });

  cameraUseBtn?.addEventListener('click', () => {
    if (capturedBlob) {
      const file = new File([capturedBlob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      stageAttachment(file);
      closeCameraModal();
    }
  });

  // ── Voice Recording Setup ───────────────────────────────────
  const voiceRecorderBar = document.getElementById('msg-voice-recorder-bar');
  const composerBar = document.getElementById('msg-composer-bar');
  const voiceTimerEl = document.getElementById('voice-timer');
  const voicePreviewPlayer = document.getElementById('voice-preview-player');

  document.getElementById('composer-mic-btn')?.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        if (voicePreviewPlayer) {
          voicePreviewPlayer.src = URL.createObjectURL(recordedAudioBlob);
          voicePreviewPlayer.classList.remove('hidden');
        }
        document.getElementById('voice-stop-btn')?.classList.add('hidden');
        document.getElementById('voice-send-btn')?.classList.remove('hidden');
      };

      mediaRecorder.start();
      recordingSeconds = 0;
      if (voiceTimerEl) voiceTimerEl.textContent = '00:00';
      if (recordingInterval) clearInterval(recordingInterval);
      recordingInterval = setInterval(() => {
        recordingSeconds++;
        const m = Math.floor(recordingSeconds / 60);
        const s = recordingSeconds % 60;
        if (voiceTimerEl) voiceTimerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }, 1000);

      composerBar?.classList.add('hidden');
      voiceRecorderBar?.classList.remove('hidden');
      voicePreviewPlayer?.classList.add('hidden');
      document.getElementById('voice-stop-btn')?.classList.remove('hidden');
      document.getElementById('voice-send-btn')?.classList.add('hidden');
    } catch {
      showToast('Microphone access denied', 'error');
    }
  });

  function stopRecordingTracks() {
    if (mediaRecorder && mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    }
    if (recordingInterval) clearInterval(recordingInterval);
  }

  document.getElementById('voice-stop-btn')?.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      stopRecordingTracks();
    }
  });

  document.getElementById('voice-cancel-btn')?.addEventListener('click', () => {
    stopRecordingTracks();
    recordedAudioBlob = null;
    voiceRecorderBar?.classList.add('hidden');
    composerBar?.classList.remove('hidden');
  });

  document.getElementById('voice-send-btn')?.addEventListener('click', async () => {
    if (!recordedAudioBlob || !activeConvId) return;
    const file = new File([recordedAudioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
    try {
      await messageApi.sendMessage({
        conversationId: activeConvId,
        mediaFile: file,
        voiceDuration: recordingSeconds,
      });
      stopRecordingTracks();
      recordedAudioBlob = null;
      voiceRecorderBar?.classList.add('hidden');
      composerBar?.classList.remove('hidden');
      loadMessagesForConversation(activeConvId);
    } catch (err) {
      showToast('Could not send voice message', 'error');
    }
  });

  // ── Auto-grow Textarea and Typing Events ────────────────────
  const textarea = document.getElementById('composer-textarea');
  textarea?.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';

    if (activeConvId && activeOtherUser?._id) {
      emitTyping(activeConvId, activeOtherUser._id);
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        emitStopTyping(activeConvId, activeOtherUser._id);
      }, 2000);
    }
  });

  // Enter to send, Shift + Enter for new line
  textarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('msg-composer-bar')?.dispatchEvent(new Event('submit'));
    }
  });

  // ── Reply Cancel Button ─────────────────────────────────────
  document.getElementById('reply-banner-cancel')?.addEventListener('click', () => {
    activeReplyTo = null;
    document.getElementById('msg-reply-banner')?.classList.add('hidden');
  });

  // ── Composer Submit ─────────────────────────────────────────
  document.getElementById('msg-composer-bar')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeConvId) return;

    const text = textarea?.value.trim() || '';
    if (!text && !stagedFile) return;

    const payload = {
      conversationId: activeConvId,
      text,
      mediaFile: stagedFile,
      replyTo: activeReplyTo,
    };

    try {
      // Clear inputs immediately for responsiveness
      if (textarea) {
        textarea.value = '';
        textarea.style.height = 'auto';
      }
      if (stagedFile) {
        stagedFile = null;
        fileInput.value = '';
        document.getElementById('msg-attachment-preview')?.classList.add('hidden');
      }
      if (activeReplyTo) {
        activeReplyTo = null;
        document.getElementById('msg-reply-banner')?.classList.add('hidden');
      }

      const res = await messageApi.sendMessage(payload);
      if (res.success && res.message) {
        appendMessageBubble(res.message);
        scrollToBottom();
      }
    } catch (err) {
      showToast(err.message || 'Failed to send message', 'error');
    }
  });

  // ── Load All Conversations ──────────────────────────────────
  async function loadConversations() {
    try {
      const res = await messageApi.getConversations();
      conversations = res.conversations || [];
      renderConversationList();

      // If active conversation is open, update header status
      if (activeConvId) {
        const found = conversations.find((c) => String(c._id) === String(activeConvId));
        if (found) syncActiveHeader(found);
      }
    } catch (err) {
      console.error('[Messages] error loading conversations:', err);
      const listEl = document.getElementById('msg-conv-list');
      if (listEl) listEl.innerHTML = `<div class="msg-state-error">Could not load chats.</div>`;
    }
  }

  function renderConversationList() {
    const listEl = document.getElementById('msg-conv-list');
    if (!listEl) return;

    let filtered = conversations.slice();

    // 1. Tab Filter (removed)
    // 2. Search Filter (only users with whom conversations exist)
    if (conversationSearchQuery) {
      filtered = filtered.filter((c) => {
        const other = c.otherParticipant || {};
        const nickObj = c.nicknames?.find((n) => (n.user?._id || n.user)?.toString() === other._id?.toString());
        const displayName = (nickObj?.nickname || other.fullName || other.username || '').toLowerCase();
        const handle = (other.username || '').toLowerCase();
        const lastMsg = (c.lastMessage?.text || '').toLowerCase();
        return displayName.includes(conversationSearchQuery) || handle.includes(conversationSearchQuery) || lastMsg.includes(conversationSearchQuery);
      });
    }

    // Update unread badges
    const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    const badgeEl = document.getElementById('pill-unread-total');
    if (badgeEl) {
      badgeEl.textContent = totalUnread > 99 ? '99+' : totalUnread;
      badgeEl.style.display = totalUnread > 0 ? '' : 'none';
    }
    const sbBadge = document.getElementById('sb-msg-unread-badge');
    if (sbBadge) {
      sbBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      sbBadge.style.display = totalUnread > 0 ? '' : 'none';
    }

    if (!filtered.length) {
      listEl.innerHTML = `<div class="msg-empty-convs">No conversations found.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((c) => conversationItemHTML(c, activeConvId)).join('');

    // Wire item clicks
    listEl.querySelectorAll('.msg-conv-item').forEach((item) => {
      item.addEventListener('click', () => {
        const convId = item.dataset.id;
        selectConversation(convId);
      });
    });
  }

  function conversationItemHTML(conv, selectedId) {
    const other = conv.otherParticipant || {};
    const isSelected = String(conv._id) === String(selectedId);
    const unread = conv.unreadCount || 0;
    const avatar = other.avatar || LOGO_IMG;
    const nickObj = conv.nicknames?.find((n) => (n.user?._id || n.user)?.toString() === other._id?.toString());
    const displayName = escapeHtml(nickObj?.nickname || other.fullName || other.username || 'User');
    const isOnline = Boolean(conv.isOnline);

    let lastPreview = 'No messages yet';
    if (conv.lastMessage) {
      if (conv.lastMessage.deletedForEveryone) lastPreview = 'This message was deleted';
      else if (conv.lastMessage.text) lastPreview = conv.lastMessage.text;
      else if (conv.lastMessage.mediaType === 'image') lastPreview = '📷 Photo';
      else if (conv.lastMessage.mediaType === 'video') lastPreview = '🎬 Video';
      else if (conv.lastMessage.mediaType === 'audio') lastPreview = '🎙️ Voice message';
      else if (conv.lastMessage.mediaType === 'call') lastPreview = `📞 ${conv.lastMessage.callDetails?.callType === 'video' ? 'Video' : 'Audio'} Call`;
      else if (conv.lastMessage.mediaType === 'file') lastPreview = `📎 ${conv.lastMessage.fileName || 'Attachment'}`;
    }

    return `
    <div class="msg-conv-item ${isSelected ? 'active' : ''} ${unread > 0 ? 'unread' : ''}" data-id="${conv._id}" role="button" tabindex="0">
      <div class="msg-conv-avatar-wrap">
        <img class="avatar" src="${avatar}" alt="" loading="lazy" onerror="this.src='${LOGO_IMG}'" />
        ${isOnline ? `<span class="conv-online-dot"></span>` : ''}
      </div>
      <div class="msg-conv-info">
        <div class="msg-conv-top">
          <strong class="msg-conv-name">${displayName}</strong>
          <span class="msg-conv-time">${timeAgo(conv.updatedAt || conv.lastMessage?.createdAt)}</span>
        </div>
        <div class="msg-conv-bottom">
          <p class="msg-conv-preview">${escapeHtml(lastPreview)}</p>
          ${unread > 0 ? `<span class="conv-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ── Select Conversation ─────────────────────────────────────
  async function selectConversation(conversationId) {
    activeConvId = conversationId;
    document.getElementById('msg-chat-viewport')?.classList.add('open');
    document.getElementById('msg-empty-placeholder')?.classList.add('hidden');
    document.getElementById('msg-active-screen')?.classList.remove('hidden');

    renderConversationList();
    await loadMessagesForConversation(conversationId);
  }

  async function loadMessagesForConversation(conversationId) {
    const stream = document.getElementById('msg-stream');
    if (stream) stream.innerHTML = `<div class="msg-loading-spinner">Loading messages…</div>`;

    try {
      const res = await messageApi.getMessages(conversationId);
      const messages = res.messages || [];
      const convInfo = res.conversation || {};

      activeWallpaper = convInfo.wallpaper || 'default';
      applyChatWallpaper(activeWallpaper);

      // Identify the other participant
      const curConv = conversations.find((c) => String(c._id) === String(conversationId));
      if (curConv) {
        syncActiveHeader(curConv);
      }

      renderMessageStream(messages);
      scrollToBottom();

      // Mark as read on backend
      messageApi.markRead(conversationId).catch(() => {});
      if (curConv) curConv.unreadCount = 0;
      renderConversationList();
    } catch (err) {
      if (stream) stream.innerHTML = `<div class="msg-state-error">Could not load messages.</div>`;
    }
  }

  function syncActiveHeader(conv) {
    activeOtherUser = conv.otherParticipant;
    const nickObj = conv.nicknames?.find((n) => (n.user?._id || n.user)?.toString() === activeOtherUser?._id?.toString());
    activeNickname = nickObj?.nickname || '';
    const displayName = activeNickname || activeOtherUser?.fullName || activeOtherUser?.username || 'User';

    const avatarEl = document.getElementById('msg-hdr-avatar');
    const nameEl = document.getElementById('msg-hdr-name');
    const statusEl = document.getElementById('msg-hdr-status');
    const dotEl = document.getElementById('msg-hdr-online-dot');

    if (avatarEl) avatarEl.src = activeOtherUser?.avatar || LOGO_IMG;
    if (nameEl) nameEl.textContent = displayName;

    const isOnline = Boolean(conv.isOnline);
    if (dotEl) dotEl.classList.toggle('hidden', !isOnline);
    if (statusEl) {
      if (isOnline) {
        statusEl.textContent = 'Online';
        statusEl.className = 'msg-hdr-status online';
      } else {
        const lastSeen = activeOtherUser?.lastSeen;
        statusEl.textContent = lastSeen ? `Last seen ${timeAgo(lastSeen)}` : 'Offline';
        statusEl.className = 'msg-hdr-status offline';
      }
    }
  }

  const WALLPAPER_STYLES = {
    default: '#171717',
    sunset: `radial-gradient(ellipse at 95% 85%, #050203 14%, transparent 30%),
      radial-gradient(ellipse at 88% 75%, #080305 20%, transparent 36%),
      linear-gradient(180deg, transparent 0%, transparent 68%, rgba(8,20,28,0.95) 75%, #04080d 100%),
      radial-gradient(ellipse at 50% 72%, rgba(254,215,170,0.75) 0%, rgba(249,115,22,0.55) 20%, transparent 55%),
      radial-gradient(circle at 50% 64%, #fff7ed 0%, #ffedd5 4%, #fde047 10%, #fb923c 24%, #ea580c 40%, transparent 58%),
      linear-gradient(180deg, #18080f 0%, #3b0713 18%, #781016 35%, #991b1b 48%, #c2410c 62%, #ea580c 70%, #f59e0b 74%, #0f1c24 76%, #05090e 100%)`,
    emerald: `radial-gradient(ellipse at 50% 30%, #065f46 0%, #064e3b 35%, #022c22 65%, #01130e 100%)`,
    nebula: `radial-gradient(ellipse at 20% 20%, rgba(239,68,68,0.6) 0%, transparent 45%),
      radial-gradient(ellipse at 80% 75%, rgba(163,28,27,0.8) 0%, transparent 50%),
      radial-gradient(circle at 50% 50%, #580c0c 0%, #290404 60%, #0b0101 100%)`,
    midnight: `radial-gradient(ellipse at 80% 20%, rgba(56,189,248,0.25) 0%, transparent 45%),
      linear-gradient(180deg, #0e1726 0%, #060910 55%, #020406 100%)`,
  };

  function applyChatWallpaper(theme) {
    const streamContainer = document.getElementById('msg-stream-container');
    if (!streamContainer) {
      console.warn('[Wallpaper] msg-stream-container not found');
      return;
    }

    // Remove all theme classes (kept for any CSS that relies on them)
    streamContainer.classList.remove('theme-default', 'theme-sunset', 'theme-emerald', 'theme-nebula', 'theme-midnight');

    // Always apply via inline style to guarantee it overrides any CSS
    const bg = WALLPAPER_STYLES[theme] || (theme?.startsWith('#') || theme?.startsWith('rgb') ? theme : WALLPAPER_STYLES.default);
    streamContainer.style.setProperty('background', bg, 'important');

    // Also add the class for any other CSS hooks
    const classKey = WALLPAPER_STYLES[theme] ? theme : 'default';
    streamContainer.classList.add(`theme-${classKey}`);

    console.log('[Wallpaper] Applied theme:', theme, '→', bg.substring(0, 40) + '...');
  }

  function renderMessageStream(messages) {
    const stream = document.getElementById('msg-stream');
    if (!stream) return;

    if (!messages.length) {
      stream.innerHTML = `<div class="msg-stream-empty">No messages yet. Say hello! 👋</div>`;
      return;
    }

    let lastDateStr = null;
    const htmlParts = [];

    messages.forEach((msg) => {
      const dateStr = formatDateSeparator(msg.createdAt);
      if (dateStr !== lastDateStr) {
        htmlParts.push(`<div class="msg-date-separator"><span>${dateStr}</span></div>`);
        lastDateStr = dateStr;
      }
      htmlParts.push(messageBubbleHTML(msg));
    });

    stream.innerHTML = htmlParts.join('');

    wireMessageQuickActions();
  }

  function appendMessageBubble(msg) {
    const stream = document.getElementById('msg-stream');
    if (!stream) return;

    const empty = stream.querySelector('.msg-stream-empty');
    if (empty) empty.remove();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = messageBubbleHTML(msg);
    const bubbleEl = tempDiv.firstElementChild;
    stream.appendChild(bubbleEl);

    wireSingleMessageActions(bubbleEl);
  }

  function messageBubbleHTML(msg) {
    const myId = String(currentUserId || '');
    const senderId = String(msg.sender?._id || msg.sender || '');
    const isMine = Boolean(myId && senderId && myId === senderId);
    const src = mediaSrc(msg.mediaUrl);
    const isRead = Array.isArray(msg.readBy) && msg.readBy.length > 1;
    const isDeleted = Boolean(msg.deletedForEveryone);
    const senderName = escapeHtml(msg.sender?.fullName || msg.sender?.username || 'User');
    const senderAvatar = msg.sender?.avatar || LOGO_IMG;

    // Reactions aggregated map
    const reactionMap = {};
    (msg.reactions || []).forEach((r) => {
      reactionMap[r.emoji] = (reactionMap[r.emoji] || 0) + 1;
    });
    const reactionsHTML = Object.entries(reactionMap).map(([emoji, count]) => `
      <span class="msg-reaction-badge" data-emoji="${emoji}">
        ${emoji} ${count > 1 ? `<small>${count}</small>` : ''}
      </span>
    `).join('');

    // Nested Threaded Reply Block
    let replyHTML = '';
    if (msg.replyTo && !isDeleted) {
      replyHTML = `
      <div class="msg-reply-quote">
        <span class="quote-sender">${escapeHtml(msg.replyTo.senderName || 'User')}</span>
        <span class="quote-text">${escapeHtml(msg.replyTo.text || (msg.replyTo.mediaUrl ? 'Attachment' : ''))}</span>
      </div>`;
    }

    // Forwarded Label
    const forwardedHTML = msg.isForwarded ? `<div class="msg-forwarded-tag">↷ Forwarded</div>` : '';

    // Content based on mediaType
    let bodyHTML = '';
    if (isDeleted) {
      bodyHTML = `<p class="msg-text deleted-text">🚫 This message was deleted</p>`;
    } else {
      if (msg.mediaType === 'image' && src) {
        bodyHTML += `<div class="msg-media-wrap image"><img src="${src}" alt="media" loading="lazy" class="msg-img-clickable" data-lightbox-src="${src}" /></div>`;
      } else if (msg.mediaType === 'video' && src) {
        bodyHTML += `<div class="msg-media-wrap video"><video src="${src}" controls preload="metadata"></video></div>`;
      } else if (msg.mediaType === 'audio' && src) {
        bodyHTML += `
        <div class="msg-voice-card">
          <audio src="${src}" controls preload="metadata"></audio>
          ${msg.voiceDuration ? `<span class="voice-card-duration">${formatDuration(msg.voiceDuration)}</span>` : ''}
        </div>`;
      } else if (msg.mediaType === 'call' && msg.callDetails) {
        const isVideoCall = msg.callDetails.callType === 'video';
        bodyHTML += `
        <div class="msg-call-card ${msg.callDetails.status}">
          <span class="call-card-icon">${isVideoCall ? icons.video : icons.phone}</span>
          <div class="call-card-meta">
            <strong>${isVideoCall ? 'Video Call' : 'Audio Call'}</strong>
            <small>${msg.callDetails.status === 'missed' ? 'Missed call' : (msg.callDetails.duration ? formatDuration(msg.callDetails.duration) : 'Ended')}</small>
          </div>
        </div>`;
      } else if (msg.mediaType === 'file' && src) {
        bodyHTML += `
        <a class="msg-file-card" href="${src}" target="_blank" download="${escapeHtml(msg.fileName || 'file')}">
          <span class="file-icon">📎</span>
          <div class="file-meta">
            <strong class="file-title">${escapeHtml(msg.fileName || 'Attachment')}</strong>
            <small class="file-size">${msg.fileSize || ''}</small>
          </div>
        </a>`;
      }

      if (msg.text) {
        bodyHTML += `<p class="msg-text">${escapeHtml(msg.text)}</p>`;
      }
    }

    return `
    <div class="msg-bubble-wrap ${isMine ? 'mine' : 'theirs'} ${isDeleted ? 'deleted' : ''}"
         data-msg-id="${msg._id}"
         data-is-mine="${isMine}"
         data-text="${escapeHtml(msg.text || '')}"
         data-sender="${senderName}"
         data-media-url="${src || ''}"
         data-media-type="${msg.mediaType || ''}">

      ${!isMine ? `<img class="avatar xs msg-theirs-avatar" src="${senderAvatar}" alt="" onerror="this.src='${LOGO_IMG}'" />` : ''}

      <div class="msg-bubble-content-col">
        <!-- Quick Action Trigger Bar (desktop hover / mobile click) -->
        <div class="msg-quick-bar">
          <button class="qb-btn react-btn" title="React">😊</button>
          <button class="qb-btn reply-btn" title="Reply">${icons.reply || '↩'}</button>
          <button class="qb-btn forward-btn" title="Forward">↷</button>
          <button class="qb-btn copy-btn" title="Copy">${icons.copy || '📄'}</button>
          ${isMine && !isDeleted ? `
            <button class="qb-btn edit-btn" title="Edit">${icons.edit || '✎'}</button>
            <button class="qb-btn delete-btn" title="Delete">${icons.trash || '🗑'}</button>
          ` : ''}
          ${!isMine && !isDeleted ? `
            <button class="qb-btn delete-btn" title="Delete">${icons.trash || '🗑'}</button>
          ` : ''}
        </div>

        <div class="msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}">
          ${forwardedHTML}
          ${replyHTML}
          ${bodyHTML}

          <div class="msg-meta-row">
            ${msg.isEdited && !isDeleted ? `<span class="edited-tag">(edited)</span>` : ''}
            <span class="msg-time">${formatTime(msg.createdAt)}</span>
            ${isMine ? `
              <span class="msg-receipt ${isRead ? 'seen' : 'sent'}" title="${isRead ? 'Seen' : 'Delivered'}">
                ${isRead ? '✓✓' : '✓'}
              </span>
            ` : ''}
          </div>
        </div>

        ${reactionsHTML ? `<div class="msg-reactions-row">${reactionsHTML}</div>` : ''}
      </div>
    </div>`;
  }

  // ── Message Actions Handlers ────────────────────────────────
  function wireMessageQuickActions() {
    document.querySelectorAll('.msg-bubble-wrap').forEach(wireSingleMessageActions);
  }

  function wireSingleMessageActions(bubble) {
    const msgId = bubble.dataset.msgId;
    const isMine = bubble.dataset.isMine === 'true';
    const text = bubble.dataset.text;
    const sender = bubble.dataset.sender;
    const mediaUrl = bubble.dataset.mediaUrl;
    const mediaType = bubble.dataset.mediaType;

    // React
    bubble.querySelector('.react-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      showQuickReactionPicker(msgId, e.currentTarget);
    });

    // Existing reaction click (toggle)
    bubble.querySelectorAll('.msg-reaction-badge').forEach((badge) => {
      badge.addEventListener('click', () => {
        const emoji = badge.dataset.emoji;
        messageApi.reactToMessage(msgId, emoji).then(() => {
          loadMessagesForConversation(activeConvId);
        });
      });
    });

    // Reply
    bubble.querySelector('.reply-btn')?.addEventListener('click', () => {
      activeReplyTo = { messageId: msgId, senderName: sender, text, mediaUrl };
      document.getElementById('reply-to-user').textContent = sender;
      document.getElementById('reply-to-snippet').textContent = text || (mediaUrl ? 'Attachment' : '');
      document.getElementById('msg-reply-banner')?.classList.remove('hidden');
      document.getElementById('composer-textarea')?.focus();
    });

    // Forward
    bubble.querySelector('.forward-btn')?.addEventListener('click', () => {
      openForwardModal({ text, mediaUrl, mediaType });
    });

    // Copy
    bubble.querySelector('.copy-btn')?.addEventListener('click', () => {
      if (text) {
        navigator.clipboard.writeText(text);
        showToast('Message copied to clipboard', 'success');
      } else {
        showToast('Nothing to copy', 'info');
      }
    });

    // Edit (mine only)
    bubble.querySelector('.edit-btn')?.addEventListener('click', () => {
      showModal({
        title: 'Edit Message',
        body: `
          <textarea id="edit-msg-input" rows="3" style="width:100%;box-sizing:border-box;padding:12px;border-radius:10px;background:var(--velove-surface-2);color:var(--velove-text);border:1px solid var(--velove-border-2);font-family:inherit;font-size:14px;line-height:1.45;resize:vertical;outline:none;">${escapeHtml(text || '')}</textarea>
        `,
        confirmLabel: 'Save Changes',
        confirmClass: 'btn-primary',
        cancelLabel: 'Cancel',
        onOpen: (overlay) => {
          const input = overlay.querySelector('#edit-msg-input');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
            input.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                overlay.querySelector('.modal-confirm-btn')?.click();
              }
            });
          }
        },
        onConfirm: async () => {
          const newText = document.getElementById('edit-msg-input')?.value.trim();
          if (!newText) {
            showToast('Message text cannot be empty', 'error');
            return;
          }
          if (newText === text) {
            return;
          }
          try {
            await messageApi.editMessage(msgId, newText);
            showToast('Message updated', 'success');
            loadMessagesForConversation(activeConvId);
          } catch (err) {
            showToast(err.message || 'Could not edit message', 'error');
          }
        },
      });
    });

    // Delete
    bubble.querySelector('.delete-btn')?.addEventListener('click', () => {
      showModal({
        title: 'Delete Message',
        body: `
          <p style="color:var(--velove-muted);font-size:13px;margin:0 0 14px 0;">Are you sure you want to delete this message?</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button type="button" id="del-for-me-btn" class="vd-btn-primary secondary" style="width:100%;padding:10px 14px;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
              <span>Delete for Me</span>
            </button>
            ${isMine ? `
              <button type="button" id="del-for-everyone-btn" class="vd-btn-primary danger" style="width:100%;padding:10px 14px;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
                <span>Delete for Everyone</span>
              </button>
            ` : ''}
          </div>
        `,
        confirmLabel: null,
        cancelLabel: 'Cancel',
        onOpen: (overlay, cleanup) => {
          overlay.querySelector('#del-for-me-btn')?.addEventListener('click', async () => {
            cleanup();
            try {
              await messageApi.deleteMessage(msgId, 'me');
              showToast('Deleted for you', 'info');
              loadMessagesForConversation(activeConvId);
            } catch (err) {
              showToast(err.message || 'Could not delete message', 'error');
            }
          });

          overlay.querySelector('#del-for-everyone-btn')?.addEventListener('click', async () => {
            cleanup();
            try {
              await messageApi.deleteMessage(msgId, 'everyone');
              showToast('Deleted for everyone', 'info');
              loadMessagesForConversation(activeConvId);
            } catch (err) {
              showToast(err.message || 'Could not delete for everyone', 'error');
            }
          });
        },
      });
    });
  }

  function showQuickReactionPicker(msgId, targetBtn) {
    document.querySelector('.quick-reaction-popup')?.remove();
    const popup = document.createElement('div');
    popup.className = 'quick-reaction-popup';
    popup.innerHTML = `
      <span>❤️</span>
      <span>👍</span>
      <span>😂</span>
      <span>😮</span>
      <span>😢</span>
      <span>🔥</span>
    `;

    targetBtn.parentElement.appendChild(popup);

    popup.querySelectorAll('span').forEach((s) => {
      s.addEventListener('click', async () => {
        const emoji = s.textContent.trim();
        popup.remove();
        try {
          await messageApi.reactToMessage(msgId, emoji);
          loadMessagesForConversation(activeConvId);
        } catch {}
      });
    });

    const removePopup = () => { popup.remove(); document.removeEventListener('click', removePopup); };
    setTimeout(() => document.addEventListener('click', removePopup), 50);
  }

  // ── Forward Modal ───────────────────────────────────────────
  function openForwardModal(msgData) {
    const modal = document.getElementById('forward-modal');
    const listEl = document.getElementById('forward-conv-list');
    if (!modal || !listEl) return;

    modal.classList.remove('hidden');

    listEl.innerHTML = conversations.map((c) => {
      const other = c.otherParticipant || {};
      return `
      <div class="forward-row" data-conv-id="${c._id}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #1A2A1C;cursor:pointer;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${other.avatar || LOGO_IMG}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" />
          <strong>${escapeHtml(other.fullName || other.username || 'User')}</strong>
        </div>
        <button class="forward-send-btn" style="background:#A31C1B;color:#fff;border:none;border-radius:14px;padding:4px 12px;font-size:12px;cursor:pointer;">Forward</button>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.forward-send-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const row = e.target.closest('.forward-row');
        const convId = row.dataset.convId;
        modal.classList.add('hidden');
        try {
          await messageApi.sendMessage({
            conversationId: convId,
            text: msgData.text,
            isForwarded: true,
          });
          showToast('Message forwarded successfully', 'success');
        } catch {
          showToast('Failed to forward message', 'error');
        }
      });
    });

    document.getElementById('forward-close-btn')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  function scrollToBottom() {
    const stream = document.getElementById('msg-stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  // ── Real-Time Socket Event Subscriptions ─────────────────────
  _msgViewCleanups.push(
    onReceiveMessage((message) => {
      // If belongs to active conversation, append bubble
      if (String(message.conversation) === String(activeConvId)) {
        appendMessageBubble(message);
        scrollToBottom();
        messageApi.markRead(activeConvId).catch(() => {});
      } else {
        // Play notification or toast if not active conversation
        showToast(`New message from ${message.sender?.fullName || message.sender?.username || 'User'}`, 'info');
      }
      loadConversations();
    })
  );

  _msgViewCleanups.push(
    onUpdateConversationOrder(() => {
      loadConversations();
    })
  );

  _msgViewCleanups.push(
    onMessagesRead(({ conversationId, readBy }) => {
      if (String(conversationId) === String(activeConvId)) {
        document.querySelectorAll('.msg-bubble-wrap.mine .msg-receipt').forEach((el) => {
          el.textContent = '✓✓';
          el.className = 'msg-receipt seen';
        });
      }
    })
  );

  _msgViewCleanups.push(
    onUserTyping(({ conversationId, senderId }) => {
      if (String(conversationId) === String(activeConvId)) {
        const banner = document.getElementById('msg-typing-banner');
        banner?.classList.remove('hidden');
      }
    })
  );

  _msgViewCleanups.push(
    onUserStopTyping(({ conversationId }) => {
      if (String(conversationId) === String(activeConvId)) {
        const banner = document.getElementById('msg-typing-banner');
        banner?.classList.add('hidden');
      }
    })
  );

  _msgViewCleanups.push(
    onMessageEdited((updatedMsg) => {
      if (String(updatedMsg.conversation) === String(activeConvId)) {
        loadMessagesForConversation(activeConvId);
      }
    })
  );

  _msgViewCleanups.push(
    onMessageDeleted(({ conversationId }) => {
      if (String(conversationId) === String(activeConvId)) {
        loadMessagesForConversation(activeConvId);
      }
    })
  );

  _msgViewCleanups.push(
    onMessageReaction(({ conversationId }) => {
      if (String(conversationId) === String(activeConvId)) {
        loadMessagesForConversation(activeConvId);
      }
    })
  );

  _msgViewCleanups.push(
    onConversationSettingsUpdated(({ conversationId, wallpaper, nicknames }) => {
      if (String(conversationId) === String(activeConvId)) {
        if (wallpaper !== undefined && wallpaper !== null) {
          activeWallpaper = wallpaper;
          applyChatWallpaper(wallpaper);
        }
        loadConversations();
      }
    })
  );

  _msgViewCleanups.push(
    onUserStatusChange(({ userId, isOnline }) => {
      if (activeOtherUser && String(activeOtherUser._id) === String(userId)) {
        const dot = document.getElementById('msg-hdr-online-dot');
        const st = document.getElementById('msg-hdr-status');
        if (dot) dot.classList.toggle('hidden', !isOnline);
        if (st) {
          st.textContent = isOnline ? 'Online' : 'Offline';
          st.className = `msg-hdr-status ${isOnline ? 'online' : 'offline'}`;
        }
      }
      loadConversations();
    })
  );

  // Initial load
  await loadConversations();
  if (activeConvId) {
    selectConversation(activeConvId);
  }
}
