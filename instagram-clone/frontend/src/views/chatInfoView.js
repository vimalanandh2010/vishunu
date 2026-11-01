import { LOGO_IMG, icons } from '../constants.js';
import { userApi, messageApi } from '../services/api.js';
import { getSessionUser } from '../state/session.js';
import { escapeHtml, mediaSrc, timeAgo, showToast, showModal } from '../utils/dom.js';
import { startOutgoingCall } from '../components/callModal.js';
import { toggleTheme } from '../state/theme.js';

export async function renderChatInfo(container, { targetUserId, conversationId, onNavigate, onGoBack } = {}) {
  const currentUser = getSessionUser();
  const currentUserId = currentUser?._id || currentUser?.id;

  container.innerHTML = `
  <div class="vd-layout">
    <!-- Fixed left sidebar -->
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

    <!-- Main Content Area -->
    <main class="vd-main">
      <header class="vd-header info-header">
        <button id="chat-info-back" class="nav-btn chat-info-back-btn" title="Back to Chat">
          ${icons.arrowLeft} <span>Back to Conversation</span>
        </button>
        <button id="ci-theme-btn" class="vd-icon-btn" title="Toggle theme" aria-label="Toggle theme" style="margin-left:auto">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>
      </header>

      <div class="chat-info-scrollable" id="chat-info-content">
        <div class="chat-info-loading">Loading user information…</div>
      </div>
    </main>
  </div>`;

  // Wire sidebar navigation
  container.querySelectorAll('.vd-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route === 'messages') {
        if (conversationId) onNavigate?.('messages', { conversationId });
        else onNavigate?.('messages');
      } else {
        onNavigate?.(route);
      }
    });
  });

  document.getElementById('sbnav-user-footer')?.addEventListener('click', () => {
    onNavigate?.('profile', { username: currentUser?.username });
  });

  // Back button handler
  document.getElementById('chat-info-back')?.addEventListener('click', () => {
    if (typeof onGoBack === 'function') onGoBack();
    else if (conversationId) onNavigate?.('messages', { conversationId });
    else onNavigate?.('messages');
  });

  // Theme toggle
  const ciThemeBtn = document.getElementById('ci-theme-btn');
  const syncCiThemeIcon = () => {
    if (!ciThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    ciThemeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncCiThemeIcon();
  ciThemeBtn?.addEventListener('click', () => { toggleTheme(); syncCiThemeIcon(); });

  const contentEl = document.getElementById('chat-info-content');

  try {
    // 1. Fetch user chat info
    const infoRes = await userApi.getUserChatInfo(targetUserId);
    const targetUser = infoRes.user || {};

    // 2. Fetch conversation data (for current nickname, wallpaper, mute)
    let convData = null;
    let sharedMedia = [];
    if (conversationId) {
      try {
        const msgsRes = await messageApi.getMessages(conversationId, { limit: 1 });
        convData = msgsRes.conversation || null;
      } catch (e) {
        console.warn('Conv fetch error:', e);
      }
      try {
        const mediaRes = await messageApi.getSharedMedia(conversationId);
        sharedMedia = mediaRes.media || [];
      } catch (e) {
        console.warn('Media fetch error:', e);
      }
    }

    // Find current nickname in this conversation
    const existingNickObj = convData?.nicknames?.find((n) => (n.user?._id || n.user)?.toString() === targetUserId);
    const currentNickname = existingNickObj?.nickname || '';
    const isMuted = convData?.isMuted || false;
    const currentWallpaper = convData?.wallpaper || 'default';

    renderInfoContent({
      targetUser,
      currentNickname,
      isMuted,
      currentWallpaper,
      sharedMedia,
      currentUser,
    });
  } catch (err) {
    console.error('[ChatInfo] error:', err);
    contentEl.innerHTML = `
      <div class="chat-info-error">
        <p>Could not load user details.</p>
        <button id="chat-info-retry" class="link-btn">Retry</button>
      </div>`;
    document.getElementById('chat-info-retry')?.addEventListener('click', () => {
      renderChatInfo(container, { targetUserId, conversationId, onNavigate, onGoBack });
    });
  }

  function renderInfoContent({ targetUser, currentNickname, isMuted, currentWallpaper, sharedMedia, currentUser }) {
    const avatar = targetUser.avatar || LOGO_IMG;
    const username = escapeHtml(targetUser.username || '');
    const fullName = escapeHtml(targetUser.fullName || targetUser.username || 'User');
    const bio = escapeHtml(targetUser.bio || 'No bio provided.');
    const isOnline = Boolean(targetUser.isOnline);
    const lastSeenText = targetUser.lastSeen
      ? `Last seen ${timeAgo(targetUser.lastSeen)}`
      : 'Last seen recently';
    const statusText = isOnline ? '🟢 Online' : lastSeenText;
    const isBlocked = Boolean(targetUser.isBlockedByMe);

    contentEl.innerHTML = `
    <div class="chat-info-container">

      <!-- Profile Card -->
      <section class="chat-info-card hero-card">
        <div class="chat-info-avatar-wrap">
          <img class="chat-info-avatar" src="${avatar}" alt="${username}" onerror="this.src='${LOGO_IMG}'" />
          ${isOnline ? `<span class="online-indicator-dot"></span>` : ''}
        </div>
        <h2 class="chat-info-name">
          ${fullName}
          ${targetUser.isVerified ? `<span class="verified-badge">✓</span>` : ''}
        </h2>
        <span class="chat-info-handle">@${username}</span>
        <span class="chat-info-status ${isOnline ? 'online' : 'offline'}">${statusText}</span>

        <div class="chat-info-quick-actions">
          <button id="info-btn-msg" class="info-action-pill" title="Send Message">
            ${icons.message} <span>Message</span>
          </button>
          <button id="info-btn-audio" class="info-action-pill" title="Audio Call">
            ${icons.phone} <span>Audio</span>
          </button>
          <button id="info-btn-video" class="info-action-pill" title="Video Call">
            ${icons.video} <span>Video</span>
          </button>
        </div>
      </section>

      <!-- About Information -->
      <section class="chat-info-card">
        <h3 class="card-section-title">About</h3>
        <p class="chat-info-bio-text">${bio}</p>
      </section>

      <!-- Synchronized Custom Nickname -->
      <section class="chat-info-card">
        <h3 class="card-section-title">Custom Nickname</h3>
        <p class="card-section-desc">Set a synchronized nickname for this person. Changes are visible to both participants.</p>
        <div class="nickname-form-row">
          <input type="text" id="nickname-input" class="info-input" placeholder="e.g. Ocean_Vibes 🌊" value="${escapeHtml(currentNickname)}" maxlength="40" />
          <button id="nickname-save-btn" class="info-save-btn">Save</button>
        </div>
      </section>

      <!-- Shared Media & Files -->
      <section class="chat-info-card">
        <div class="card-section-header-row">
          <h3 class="card-section-title">Shared Media & Files</h3>
          <span class="media-count-badge">${sharedMedia.length} item${sharedMedia.length === 1 ? '' : 's'}</span>
        </div>
        ${sharedMedia.length > 0 ? `
          <div class="shared-media-grid">
            ${sharedMedia.map((m) => {
              const src = mediaSrc(m.mediaUrl);
              if (m.mediaType === 'image') {
                return `<div class="shared-media-item image" data-src="${src}">
                  <img src="${src}" alt="media" loading="lazy" />
                </div>`;
              }
              if (m.mediaType === 'video') {
                return `<div class="shared-media-item video" data-src="${src}">
                  <video src="${src}" preload="metadata"></video>
                  <span class="video-play-indicator">▶</span>
                </div>`;
              }
              return `<a class="shared-file-item" href="${src}" target="_blank" download="${escapeHtml(m.fileName || 'file')}">
                <span class="file-icon-box">📎</span>
                <div class="file-info-col">
                  <strong class="file-name">${escapeHtml(m.fileName || 'Attachment')}</strong>
                  <small class="file-size">${m.fileSize || ''}</small>
                </div>
              </a>`;
            }).join('')}
          </div>
        ` : `
          <p class="empty-media-text">No media or files shared in this chat yet.</p>
        `}
      </section>

      <!-- Chat Customization: Background Wallpaper -->
      <section class="chat-info-card">
        <h3 class="card-section-title">Chat Customization</h3>
        <p class="card-section-desc">Choose a wallpaper theme or color for this conversation.</p>
        <div class="wallpaper-options-grid">
          <button class="wallpaper-thumb ${currentWallpaper === 'default' ? 'active' : ''}" data-theme="default" title="Default Dark (#171717)">
            <span class="wp-preview default-dark"></span>
            <span>Default</span>
          </button>
          <button class="wallpaper-thumb ${currentWallpaper === 'sunset' ? 'active' : ''}" data-theme="sunset" title="Sunset Beach">
            <span class="wp-preview sunset-beach"></span>
            <span>Sunset Beach</span>
          </button>
          <button class="wallpaper-thumb ${currentWallpaper === 'emerald' ? 'active' : ''}" data-theme="emerald" title="Dark Emerald">
            <span class="wp-preview dark-emerald"></span>
            <span>Emerald Dark</span>
          </button>
          <button class="wallpaper-thumb ${currentWallpaper === 'nebula' ? 'active' : ''}" data-theme="nebula" title="Crimson Nebula">
            <span class="wp-preview crimson-nebula"></span>
            <span>Crimson Nebula</span>
          </button>
          <button class="wallpaper-thumb ${currentWallpaper === 'midnight' ? 'active' : ''}" data-theme="midnight" title="Midnight City">
            <span class="wp-preview midnight-city"></span>
            <span>Midnight</span>
          </button>
        </div>

        <div class="custom-color-row">
          <label for="wp-color-picker" class="color-picker-label">Custom Background Color:</label>
          <input type="color" id="wp-color-picker" value="${currentWallpaper.startsWith('#') ? currentWallpaper : '#171717'}" />
          <button id="wp-apply-color-btn" class="info-action-pill small">Apply Color</button>
          <button id="wp-reset-btn" class="info-action-pill small secondary">Reset</button>
        </div>
      </section>

      <!-- Chat Notifications & Privacy -->
      <section class="chat-info-card">
        <h3 class="card-section-title">Notifications & Privacy</h3>

        <div class="setting-toggle-row">
          <div class="setting-text">
            <strong>Mute Chat Notifications</strong>
            <small>Stop notification sounds and banners for this conversation</small>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-mute-chat" ${isMuted ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-toggle-row">
          <div class="setting-text">
            <strong>Show My Online Status</strong>
            <small>Let this user and others see when you are active</small>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-online-privacy" ${currentUser.onlineStatusPrivacy !== false ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="setting-toggle-row">
          <div class="setting-text">
            <strong>Show My Last Seen</strong>
            <small>Allow others to see when you were last online</small>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="toggle-lastseen-privacy" ${currentUser.lastSeenPrivacy !== false ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
      </section>

      <!-- Danger Zone: Block & Report -->
      <section class="chat-info-card danger-card">
        <h3 class="card-section-title text-danger">Safety & Controls</h3>

        <div class="danger-actions-list">
          <button id="btn-block-user" class="danger-row-btn ${isBlocked ? 'blocked' : ''}">
            <span class="danger-icon">🚫</span>
            <div class="danger-text">
              <strong>${isBlocked ? 'Unblock User' : 'Block User'}</strong>
              <small>${isBlocked ? 'Allow this user to message you again' : 'Prevent this user from messaging or calling you'}</small>
            </div>
            <span class="danger-badge-btn">${isBlocked ? 'Unblock' : 'Block'}</span>
          </button>

          <button id="btn-report-user" class="danger-row-btn">
            <span class="danger-icon">⚠️</span>
            <div class="danger-text">
              <strong>Report User</strong>
              <small>Report abusive, spam, or harmful behavior to VELOVE safety</small>
            </div>
            <span class="danger-badge-btn warning">Report</span>
          </button>
        </div>
      </section>

    </div>`;

    // Wire Quick Action Buttons
    document.getElementById('info-btn-msg')?.addEventListener('click', () => {
      if (conversationId) onNavigate?.('messages', { conversationId });
      else onNavigate?.('messages');
    });

    document.getElementById('info-btn-audio')?.addEventListener('click', () => {
      startOutgoingCall({
        targetUser,
        callType: 'audio',
        conversationId,
        currentUser,
      });
    });

    document.getElementById('info-btn-video')?.addEventListener('click', () => {
      startOutgoingCall({
        targetUser,
        callType: 'video',
        conversationId,
        currentUser,
      });
    });

    // Wire Nickname Save
    document.getElementById('nickname-save-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('nickname-input');
      const val = input?.value.trim() || '';
      if (!conversationId) {
        showToast('Open a conversation first to set a custom nickname', 'error');
        return;
      }
      try {
        await messageApi.updateSettings(conversationId, {
          nickname: val,
          targetUserId,
        });
        showToast(`Nickname saved: "${val || fullName}"`, 'success');
      } catch (err) {
        showToast(err.message || 'Failed to save nickname', 'error');
      }
    });

    // Wire Wallpaper Thumbnails
    contentEl.querySelectorAll('.wallpaper-thumb').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        contentEl.querySelectorAll('.wallpaper-thumb').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (conversationId) {
          try {
            await messageApi.updateSettings(conversationId, { wallpaper: theme });
            showToast(`Theme updated to ${btn.title}`, 'success');
          } catch (e) {
            showToast('Could not save wallpaper setting', 'error');
          }
        }
      });
    });

    // Wire Custom Color Picker
    document.getElementById('wp-apply-color-btn')?.addEventListener('click', async () => {
      const color = document.getElementById('wp-color-picker')?.value;
      if (color && conversationId) {
        try {
          await messageApi.updateSettings(conversationId, { wallpaper: color });
          showToast(`Custom background color applied`, 'success');
        } catch (e) {
          showToast('Could not save color setting', 'error');
        }
      }
    });

    // Wire Reset Wallpaper
    document.getElementById('wp-reset-btn')?.addEventListener('click', async () => {
      if (conversationId) {
        try {
          await messageApi.updateSettings(conversationId, { wallpaper: 'default' });
          contentEl.querySelectorAll('.wallpaper-thumb').forEach((b) => b.classList.toggle('active', b.dataset.theme === 'default'));
          showToast('Wallpaper reset to default', 'success');
        } catch (e) {
          showToast('Could not reset wallpaper', 'error');
        }
      }
    });

    // Wire Mute Toggle
    document.getElementById('toggle-mute-chat')?.addEventListener('change', async (e) => {
      const isMutedNow = e.target.checked;
      if (conversationId) {
        try {
          await messageApi.updateSettings(conversationId, { isMuted: isMutedNow });
          showToast(isMutedNow ? 'Chat notifications muted' : 'Chat notifications unmuted', 'info');
        } catch (err) {
          showToast('Could not update mute setting', 'error');
        }
      }
    });

    // Wire Online Privacy Toggle
    document.getElementById('toggle-online-privacy')?.addEventListener('change', async (e) => {
      try {
        const val = e.target.checked;
        await userApi.updatePrivacy({ onlineStatusPrivacy: val });
        currentUser.onlineStatusPrivacy = val;
        showToast(val ? 'Online status is visible' : 'Online status hidden', 'info');
      } catch (err) {
        showToast('Could not update privacy setting', 'error');
      }
    });

    // Wire Last Seen Privacy Toggle
    document.getElementById('toggle-lastseen-privacy')?.addEventListener('change', async (e) => {
      try {
        const val = e.target.checked;
        await userApi.updatePrivacy({ lastSeenPrivacy: val });
        currentUser.lastSeenPrivacy = val;
        showToast(val ? 'Last seen is visible' : 'Last seen hidden', 'info');
      } catch (err) {
        showToast('Could not update privacy setting', 'error');
      }
    });

    // Wire Block User
    document.getElementById('btn-block-user')?.addEventListener('click', async () => {
      const actionText = isBlocked ? 'Unblock' : 'Block';
      showModal({
        title: `${actionText} @${username}?`,
        body: `<p>Are you sure you want to ${actionText.toLowerCase()} @${username}? ${isBlocked ? 'They will be able to message you.' : 'They will no longer be able to message or call you on VELOVE.'}</p>`,
        confirmLabel: actionText,
        confirmClass: isBlocked ? 'btn-primary' : 'btn-danger',
        onConfirm: async () => {
          try {
            const res = await userApi.toggleBlock(targetUserId);
            showToast(res.message || 'Block state updated', 'success');
            renderChatInfo(container, { targetUserId, conversationId, onNavigate, onGoBack });
          } catch (err) {
            showToast(err.message || 'Failed to update block state', 'error');
          }
        },
      });
    });

    // Wire Report User
    document.getElementById('btn-report-user')?.addEventListener('click', () => {
      showModal({
        title: `Report @${username}`,
        body: `
          <p>Please select a reason for reporting this user:</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
              <input type="radio" name="report_reason" value="Spam or scams" checked /> Spam or scam
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
              <input type="radio" name="report_reason" value="Harassment or hate speech" /> Harassment or hate speech
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
              <input type="radio" name="report_reason" value="Inappropriate media" /> Inappropriate or offensive media
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
              <input type="radio" name="report_reason" value="Impersonation" /> Impersonation or fake profile
            </label>
          </div>
        `,
        confirmLabel: 'Submit Report',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          const selected = document.querySelector('input[name="report_reason"]:checked')?.value || 'Spam';
          try {
            await userApi.reportUser(targetUserId, selected);
            showToast('Report submitted. Thank you for keeping VELOVE safe.', 'success');
          } catch (e) {
            showToast('Could not submit report', 'error');
          }
        },
      });
    });
  }
}
