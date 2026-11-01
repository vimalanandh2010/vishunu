import { LOGO_IMG, icons } from '../constants.js';
import { getSessionUser } from '../state/session.js';
import { escapeHtml, showToast, showModal } from '../utils/dom.js';
import { toggleTheme } from '../state/theme.js';
import {
  initSocket,
  emitSendRandomMessage,
  emitEndRandomChat,
  emitNextStranger,
  emitReportStranger,
  emitBlockStranger,
  emitReconnectRandomSession,
  emitRandomPing,
  onRandomMessageReceived,
  onRandomChatEnded,
  onStrangerConnectionState,
  onStrangerReconnected,
  onRandomReconnectResult,
  onRandomReportSubmitted,
  onRandomChatError,
  onRandomPong,
} from '../services/socket.js';

// Anonymous silhouette SVG
const anonymousAvatarSVG = `
<svg class="rc-chat-anon-avatar" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="50" cy="50" r="48" fill="#06110C" stroke="#1F2E23" stroke-width="2.5" />
  <circle cx="50" cy="36" r="16" fill="#8A8580" />
  <path d="M22 82C22 66 34 58 50 58C66 58 78 66 78 82" fill="#8A8580" />
  <circle cx="50" cy="50" r="48" stroke="rgba(163, 28, 27, 0.4)" stroke-width="1.5" />
</svg>`;

const EMOJI_LIST = [
  '😊','😂','❤️','👍','👋','🔥','✨','🎉','😎','🙌','🥺','😍','🙏','💯','🤔','👀','🤣','🥳','👏','😭',
  '☕','🍕','⚡','🎈','💡','🌟','✌️','💬','🤝','🌸','🏖️','🚀','💀','😇','😋','😜','🤩','😏','😴','🤫'
];

/**
 * Format ISO date / timestamp into 12-hour format "HH:MM AM/PM"
 */
function formatTime(isoOrDate) {
  try {
    const d = new Date(isoOrDate);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Fullscreen Random Text Chat View
 */
export function renderRandomTextChat(container, {
  sessionId,
  strangerTempName = 'Stranger',
  myTempName = 'You',
  onNavigate,
} = {}) {
  const currentUser = getSessionUser();
  const socket = initSocket();

  let activeSessionId = sessionId;
  let strangerName = strangerTempName;
  let myName = myTempName;
  let messages = [];
  let isStrangerConnected = true;
  let pingInterval = null;
  let connectionQuality = 'Good'; // 'Good' | 'Fair' | 'Poor'

  // Persist session info to sessionStorage for refresh recovery
  if (activeSessionId) {
    sessionStorage.setItem('velove_active_rc_session', JSON.stringify({
      sessionId: activeSessionId,
      strangerTempName: strangerName,
      myTempName: myName,
      timestamp: Date.now(),
    }));
  }

  // Sockets cleanup registry
  const unsubs = [];

  container.innerHTML = `
  <div class="rc-chat-layout">
    <!-- Chat Header -->
    <header class="rc-chat-header">
      <!-- Stranger Identity -->
      <div class="rc-chat-header-user">
        <div class="rc-chat-avatar-wrap">
          ${anonymousAvatarSVG}
          <span class="rc-chat-status-dot online" id="rc-header-status-dot"></span>
        </div>
        <div class="rc-chat-user-meta">
          <div class="rc-chat-name-row">
            <strong class="rc-chat-stranger-name" id="rc-chat-stranger-name">${escapeHtml(strangerName)}</strong>
            <span class="rc-chat-mode-badge">Text Chat</span>
          </div>
          <div class="rc-chat-status-row">
            <span class="rc-chat-status-label" id="rc-chat-status-label">Online</span>
            <span class="rc-chat-dot-sep">•</span>
            <span class="rc-chat-quality-label quality-good" id="rc-chat-quality">Good connection</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="rc-chat-header-actions">
        <button id="rc-chat-theme-btn" class="rc-chat-icon-btn" title="Toggle theme" aria-label="Toggle theme">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>

        <button id="rc-chat-next-btn" class="rc-chat-btn secondary" title="Next Stranger">
          ${icons.randomConnect}
          <span>Next</span>
        </button>

        <button id="rc-chat-more-btn" class="rc-chat-icon-btn" title="Safety options" aria-label="More options">
          ${icons.moreH}
        </button>

        <button id="rc-chat-end-btn" class="rc-chat-btn danger" title="End Chat">
          <span>End Chat</span>
        </button>

        <!-- Dropdown menu for Report & Block -->
        <div class="rc-chat-dropdown hidden" id="rc-chat-dropdown">
          <button id="rc-drop-report" class="rc-drop-item warning">
            <span>⚠️</span> Report Stranger
          </button>
          <button id="rc-drop-block" class="rc-drop-item danger">
            <span>🚫</span> Block Stranger
          </button>
        </div>
      </div>
    </header>

    <!-- Disconnection banner (hidden by default) -->
    <div class="rc-chat-disconn-banner hidden" id="rc-chat-disconn-banner">
      <span class="rc-disconn-spinner"></span>
      <span id="rc-disconn-msg">Stranger disconnected. Waiting 15s to see if they reconnect...</span>
      <button class="rc-disconn-end-btn" id="rc-disconn-end-btn">End Now</button>
    </div>

    <!-- Conversation Stream -->
    <main class="rc-chat-stream-wrap" id="rc-chat-stream-wrap">
      <div class="rc-chat-stream" id="rc-chat-stream">
        <!-- Empty State -->
        <div class="rc-chat-empty-state" id="rc-chat-empty-state">
          <div class="rc-empty-bubble-icon">👋</div>
          <h3>Connected with ${escapeHtml(strangerName)}!</h3>
          <p>Say hello to break the ice! Your real identity is 100% private and protected.</p>
        </div>
      </div>
    </main>

    <!-- Message Composer -->
    <footer class="rc-chat-composer-wrap">
      <!-- Emoji Popover -->
      <div class="rc-chat-emoji-popover hidden" id="rc-chat-emoji-popover">
        <div class="rc-chat-emoji-grid">
          ${EMOJI_LIST.map((em) => `<button type="button" class="rc-emoji-item">${em}</button>`).join('')}
        </div>
      </div>

      <form class="rc-chat-composer" id="rc-chat-composer" autocomplete="off">
        <button type="button" class="rc-composer-emoji-btn" id="rc-composer-emoji-btn" title="Add emoji">
          😊
        </button>
        
        <textarea
          id="rc-composer-textarea"
          class="rc-composer-input"
          rows="1"
          placeholder="Type a message to ${escapeHtml(strangerName)}…"
          maxlength="2000"
        ></textarea>

        <button type="submit" class="rc-composer-send-btn" id="rc-composer-send-btn" title="Send (Enter)">
          ${icons.send}
        </button>
      </form>
    </footer>
  </div>`;

  const streamWrap = document.getElementById('rc-chat-stream-wrap');
  const stream = document.getElementById('rc-chat-stream');
  const emptyState = document.getElementById('rc-chat-empty-state');
  const textarea = document.getElementById('rc-composer-textarea');
  const emojiPopover = document.getElementById('rc-chat-emoji-popover');
  const dropdown = document.getElementById('rc-chat-dropdown');
  const disconnBanner = document.getElementById('rc-chat-disconn-banner');
  const disconnMsg = document.getElementById('rc-disconn-msg');
  const statusDot = document.getElementById('rc-header-status-dot');
  const statusLabel = document.getElementById('rc-chat-status-label');
  const qualityLabel = document.getElementById('rc-chat-quality');

  // ── Theme toggle ──────────────────────────────────────────────────────────
  const chatThemeBtn = document.getElementById('rc-chat-theme-btn');
  const syncChatThemeIcon = () => {
    if (!chatThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    chatThemeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncChatThemeIcon();
  chatThemeBtn?.addEventListener('click', () => { toggleTheme(); syncChatThemeIcon(); });

  function scrollToBottom() {
    if (streamWrap) {
      streamWrap.scrollTop = streamWrap.scrollHeight;
    }
  }

  function appendMessage(msg) {
    if (emptyState) emptyState.style.display = 'none';

    const isMine = msg.senderTempName === myName;
    const bubble = document.createElement('div');
    bubble.className = `rc-msg-wrap ${isMine ? 'mine' : 'theirs'}`;

    bubble.innerHTML = `
      <div class="rc-msg-bubble">
        <span class="rc-msg-sender">${escapeHtml(isMine ? 'You' : strangerName)}</span>
        <p class="rc-msg-text">${escapeHtml(msg.text)}</p>
        <span class="rc-msg-time">${formatTime(msg.createdAt)}</span>
      </div>
    `;

    stream.appendChild(bubble);
    scrollToBottom();
  }

  function renderAllMessages(msgList) {
    if (!msgList || msgList.length === 0) return;
    if (emptyState) emptyState.style.display = 'none';
    stream.innerHTML = '';
    msgList.forEach(appendMessage);
    scrollToBottom();
  }

  // ── Auto-growing textarea ────────────────────────────────────────────────
  textarea?.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  });

  textarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('rc-chat-composer')?.dispatchEvent(new Event('submit'));
    }
  });

  // ── Send message submit ──────────────────────────────────────────────────
  document.getElementById('rc-chat-composer')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textarea?.value.trim();
    if (!text || !activeSessionId) return;

    emitSendRandomMessage({
      sessionId: activeSessionId,
      text,
    });

    textarea.value = '';
    textarea.style.height = 'auto';
    textarea.focus();
  });

  // ── Emoji Picker ─────────────────────────────────────────────────────────
  document.getElementById('rc-composer-emoji-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPopover?.classList.toggle('hidden');
  });

  emojiPopover?.addEventListener('click', (e) => {
    const btn = e.target.closest('.rc-emoji-item');
    if (btn && textarea) {
      const emoji = btn.textContent;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.slice(0, start) + emoji + val.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!emojiPopover?.contains(e.target) && e.target.id !== 'rc-composer-emoji-btn') {
      emojiPopover?.classList.add('hidden');
    }
    if (!dropdown?.contains(e.target) && e.target.id !== 'rc-chat-more-btn' && !e.target.closest('#rc-chat-more-btn')) {
      dropdown?.classList.add('hidden');
    }
  });

  // ── More Dropdown (Report & Block) ───────────────────────────────────────
  document.getElementById('rc-chat-more-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('hidden');
  });

  // ── End Chat ─────────────────────────────────────────────────────────────
  function executeEndChat() {
    sessionStorage.removeItem('velove_active_rc_session');
    if (activeSessionId) {
      emitEndRandomChat({ sessionId: activeSessionId, reason: 'User left the chat.' });
    }
    clearInterval(pingInterval);
    unsubs.forEach((fn) => fn && fn());
    onNavigate?.('random-connect');
  }

  document.getElementById('rc-chat-end-btn')?.addEventListener('click', () => {
    executeEndChat();
  });

  document.getElementById('rc-disconn-end-btn')?.addEventListener('click', () => {
    executeEndChat();
  });

  // ── Next Stranger ────────────────────────────────────────────────────────
  document.getElementById('rc-chat-next-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('velove_active_rc_session');
    if (activeSessionId) {
      emitNextStranger({ sessionId: activeSessionId, mode: 'text' });
    }
    clearInterval(pingInterval);
    unsubs.forEach((fn) => fn && fn());
    // Navigate back to random-connect and trigger fresh matching immediately
    onNavigate?.('random-connect', { autoMatchMode: 'text' });
  });

  // ── Report Modal ─────────────────────────────────────────────────────────
  document.getElementById('rc-drop-report')?.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
    showModal({
      title: 'Report Stranger',
      body: `
        <p style="color:#C8C4BF;font-size:13px;margin-bottom:12px;">
          Reports are 100% anonymous. Your report protects the VELOVE community.
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:#F0EDE8;">
            <input type="radio" name="rc_report_reason" value="Harassment" checked /> Harassment / Bullying
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:#F0EDE8;">
            <input type="radio" name="rc_report_reason" value="Inappropriate Content" /> Inappropriate Content
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:#F0EDE8;">
            <input type="radio" name="rc_report_reason" value="Spam" /> Spam / Advertising
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:#F0EDE8;">
            <input type="radio" name="rc_report_reason" value="Fake Identity" /> Fake Identity / Bot
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:#F0EDE8;">
            <input type="radio" name="rc_report_reason" value="Other" /> Other
          </label>
        </div>
        <textarea id="rc-report-desc" placeholder="Optional details..." style="width:100%;background:#06110C;border:1px solid #1F2E23;border-radius:8px;color:#fff;padding:8px;margin-top:10px;font-size:12.5px;box-sizing:border-box;resize:none;" rows="2"></textarea>
      `,
      confirmLabel: 'Submit & End Chat',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        const reason = document.querySelector('input[name="rc_report_reason"]:checked')?.value || 'Harassment';
        const description = document.getElementById('rc-report-desc')?.value.trim() || '';
        emitReportStranger({ sessionId: activeSessionId, reason, description });
        showToast('Report submitted. Stranger has been blocked.', 'success');
        executeEndChat();
      },
    });
  });

  // ── Block Stranger ───────────────────────────────────────────────────────
  document.getElementById('rc-drop-block')?.addEventListener('click', () => {
    dropdown?.classList.add('hidden');
    showModal({
      title: `Block ${escapeHtml(strangerName)}?`,
      body: `<p style="color:#C8C4BF;font-size:13px;">You will immediately leave this chat and never be matched with this stranger again.</p>`,
      confirmLabel: 'Block & Leave',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        emitBlockStranger({ sessionId: activeSessionId });
        showToast('Stranger blocked permanently.', 'info');
        executeEndChat();
      },
    });
  });

  // ── Ping/Pong Latency check for Connection Quality ───────────────────────
  pingInterval = setInterval(() => {
    emitRandomPing(Date.now());
  }, 5000);

  unsubs.push(
    onRandomPong((sendTime) => {
      const rtt = Date.now() - sendTime;
      if (rtt < 120) {
        connectionQuality = 'Good';
        if (qualityLabel) {
          qualityLabel.textContent = 'Good connection';
          qualityLabel.className = 'rc-chat-quality-label quality-good';
        }
      } else if (rtt < 300) {
        connectionQuality = 'Fair';
        if (qualityLabel) {
          qualityLabel.textContent = 'Fair connection';
          qualityLabel.className = 'rc-chat-quality-label quality-fair';
        }
      } else {
        connectionQuality = 'Poor';
        if (qualityLabel) {
          qualityLabel.textContent = 'Poor connection';
          qualityLabel.className = 'rc-chat-quality-label quality-poor';
        }
      }
    })
  );

  // ── Socket Message & Event Listeners ─────────────────────────────────────
  unsubs.push(
    onRandomMessageReceived((msg) => {
      if (msg.sessionId === activeSessionId) {
        messages.push(msg);
        appendMessage(msg);
      }
    })
  );

  unsubs.push(
    onRandomChatEnded((data) => {
      showToast(data.reason || 'Stranger has left the chat.', 'info');
      executeEndChat();
    })
  );

  unsubs.push(
    onStrangerConnectionState((data) => {
      if (disconnBanner && disconnMsg) {
        disconnMsg.textContent = data.message || 'Stranger disconnected...';
        disconnBanner.classList.remove('hidden');
      }
      if (statusDot) statusDot.className = 'rc-chat-status-dot offline';
      if (statusLabel) statusLabel.textContent = 'Reconnecting...';
    })
  );

  unsubs.push(
    onStrangerReconnected(() => {
      if (disconnBanner) disconnBanner.classList.add('hidden');
      if (statusDot) statusDot.className = 'rc-chat-status-dot online';
      if (statusLabel) statusLabel.textContent = 'Online';
      showToast('Stranger reconnected!', 'success');
    })
  );

  unsubs.push(
    onRandomReconnectResult((res) => {
      if (res.success) {
        strangerName = res.strangerTempName || strangerName;
        myName = res.myTempName || myName;
        document.getElementById('rc-chat-stranger-name').textContent = strangerName;
        if (res.messages && res.messages.length > 0) {
          messages = res.messages;
          renderAllMessages(messages);
        }
      } else {
        showToast('Previous random chat session has ended.', 'info');
        executeEndChat();
      }
    })
  );

  unsubs.push(
    onRandomChatError((err) => {
      showToast(err.message || 'Chat error', 'error');
    })
  );

  // If activeSessionId is present on mount, attempt reconnection to restore in-memory chat
  if (activeSessionId) {
    emitReconnectRandomSession({ sessionId: activeSessionId });
  }

  // Cleanup handler if user navigates away or page unloads
  window.addEventListener('beforeunload', () => {
    if (activeSessionId) {
      emitEndRandomChat({ sessionId: activeSessionId, reason: 'User navigated away' });
    }
  }, { once: true });
}

