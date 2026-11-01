import { LOGO_IMG, icons } from '../constants.js';
import { postApi, authApi, messageApi, userApi, commentApi } from '../services/api.js';
import { getSessionUser, updateSessionUser, clearSession } from '../state/session.js';
import { getStoredTheme, toggleTheme, applyTheme as applyThemeDoc } from '../state/theme.js';
import { feedSkeletons, mediaSrc, timeAgo, escapeHtml, showToast, showModal } from '../utils/dom.js';
import { renderStoriesTray } from '../components/storyManager.js';
import { initNotificationBell, closePopover } from '../components/notificationPopover.js';
import { onReceiveMessage } from '../services/socket.js';

// ─── Module-level socket-listener cleanup handles ─────────────────────────────
// Stored at module scope so each new renderHome() call can tear down the
// previous render's listeners before registering new ones.
let _unsubMsgBadge = null;
let _unsubNotifBell = null;
let _unsubDocClick = null;

// ─── Active nav route (for sidebar active-state indicator) ───────────────────
let _activeNavRoute = 'home';

// ─── Track message/notification unread counts for bottom nav badges ──────────
let _msgUnread = 0;
let _notifUnread = 0;

/* ═══════════════════════════════════════════════════════════════════════════
   FEED POST TEMPLATE
   Unchanged from Phase 7 — preserves all existing data-ids and classes.
   ═══════════════════════════════════════════════════════════════════════════ */
function feedPostTemplate(p, currentUserId, savedPostIds = []) {
  const src = mediaSrc(p.mediaUrl);
  const liked = (p.likes || []).some((id) => String(id._id || id) === currentUserId);
  const isSaved = (savedPostIds || []).includes(p._id);
  const likesCount = (p.likes || []).length;
  const commentsCount = p.commentsCount || 0;
  const username = escapeHtml(p.user?.username || 'unknown');
  const avatar = p.user?.avatar || LOGO_IMG;
  const location = p.location ? `<span class="feed-location">${escapeHtml(p.location)}</span>` : '';

  return `
  <article class="feed-post" data-id="${p._id}">
    <header class="feed-head-row" data-username="${username}">
      <img class="avatar" src="${avatar}" alt="" loading="lazy" onerror="this.src='${LOGO_IMG}'" />
      <div class="feed-head-meta">
        <strong>${username}</strong>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="feed-time">${timeAgo(p.createdAt)}</span>
          ${location}
        </div>
      </div>
      <button class="vd-post-more" data-id="${p._id}" aria-label="More options" title="More options">
        ${icons.moreH}
      </button>
    </header>
    ${src ? (p.mediaType === 'video'
      ? `<video class="feed-media" src="${src}" controls preload="none"></video>`
      : `<img class="feed-media" src="${src}" alt="post media" loading="lazy" onerror="this.style.display='none'" />`)
    : ''}
    <div class="feed-actions">
      <div class="feed-actions-main">
        <button class="feed-like ${liked ? 'liked' : ''}" data-id="${p._id}" aria-label="Like post" aria-pressed="${liked}">
          ${icons.heart}<span class="feed-like-count">${likesCount}</span>
        </button>
        <button class="feed-comment-btn" data-id="${p._id}" aria-label="View comments">
          ${icons.comment}<span>${commentsCount}</span>
        </button>
        <button class="vd-share-btn" data-id="${p._id}" aria-label="Share post">
          ${icons.share}
        </button>
      </div>
      <button class="feed-save ${isSaved ? 'saved' : ''}" data-id="${p._id}" aria-label="${isSaved ? 'Remove bookmark' : 'Save post'}" aria-pressed="${isSaved}">
        ${isSaved ? icons.bookmarkFilled : icons.bookmark}
      </button>
    </div>
    ${likesCount > 0 ? `<div class="vd-likes-count">${likesCount.toLocaleString()} like${likesCount !== 1 ? 's' : ''}</div>` : ''}
    <div class="feed-caption">
      <strong data-username="${username}">@${username}</strong> ${renderCaption(p.caption)}
      ${renderTags(p, p.caption)}
    </div>
    ${commentsCount > 0
      ? `<button type="button" class="feed-view-comments" data-id="${p._id}">View all ${commentsCount} comments</button>`
      : ''}
    <form class="feed-quick-comment" data-id="${p._id}" autocomplete="off">
      <input type="text" maxlength="1000" placeholder="Add a comment..." aria-label="Add a comment" />
      <button type="submit" class="feed-quick-send" aria-label="Post comment" disabled>${icons.send}</button>
    </form>
  </article>`;
}

/**
 * Escapes caption text and wraps #hashtags in styled spans.
 * Escaping happens per split-part, so no user HTML can leak through.
 */
function renderCaption(caption) {
  const text = String(caption || '');
  if (!text) return '';
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) => (part.length > 1 && part.startsWith('#')
      ? `<span class="vd-tag">${escapeHtml(part)}</span>`
      : escapeHtml(part)))
    .join('');
}

/**
 * Renders the post's real `tags` array as hashtag chips, skipping any tag
 * already mentioned in the caption (case-insensitive).
 */
function renderTags(post, caption = '') {
  const seen = new Set((String(caption || '').match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.toLowerCase()));
  const extra = (post.tags || [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(`#${key}`) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!extra.length) return '';
  return `<div class="feed-tag-row">${extra
    .map((t) => `<span class="vd-tag">#${escapeHtml(t)}</span>`)
    .join('')}</div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOP HEADER
   Search · theme toggle · notification bell · avatar (spans feed + rail)
   ═══════════════════════════════════════════════════════════════════════════ */
function buildHeader(currentUser) {
  const avatar = currentUser?.avatar || LOGO_IMG;
  const theme = getStoredTheme();
  return `
  <header class="vd-header">
    <a class="vd-header-logo" href="#/" aria-label="VELOVE home">
      <img src="${LOGO_IMG}" alt="VELOVE" loading="lazy" />
    </a>
    <div class="vd-search" role="search">
      <span class="vd-search-icon" aria-hidden="true">${icons.search}</span>
      <input id="vd-search-input" class="vd-search-input" type="search"
             placeholder="Search users..." autocomplete="off" aria-label="Search users"
             aria-expanded="false" aria-controls="vd-search-drop" role="combobox" />
      <div class="vd-search-drop" id="vd-search-drop" role="listbox" aria-label="Search results" hidden></div>
    </div>
    <div class="vd-header-actions">
      <button id="vd-theme-btn" class="vd-header-icon" type="button"
              aria-label="Switch theme" title="Switch theme">
        ${theme === 'dark' ? icons.sun : icons.moon}
      </button>
      <button id="vd-header-bell" class="vd-header-icon" type="button"
              aria-label="Notifications" title="Notifications">
        ${icons.bell}
        <span class="vd-header-badge" hidden aria-hidden="true"></span>
      </button>
      <button id="vd-header-avatar" class="vd-header-avatar" type="button" aria-label="View your profile">
        <img src="${avatar}" alt="" loading="lazy" onerror="this.src='${LOGO_IMG}'" />
      </button>
    </div>
  </header>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR HTML
   ═══════════════════════════════════════════════════════════════════════════ */
function buildSidebar(currentUser, { msgUnread = 0, notifUnread = 0 } = {}) {
  const avatar = currentUser?.avatar || LOGO_IMG;
  const name   = escapeHtml(currentUser?.fullName || currentUser?.username || 'You');
  const handle = escapeHtml(currentUser?.username || '');

  // VELOVE nav order: Home · Messages · Random Connect · Notifications · Create Post · Saved Posts
  const navItems = [
    { id: 'sbnav-home',     route: 'home',           icon: icons.home,          label: 'Home',          active: true },
    { id: 'sbnav-messages', route: 'messages',        icon: icons.message,       label: 'Messages',      badge: msgUnread },
    { id: 'sbnav-random',   route: 'random-connect',  icon: icons.randomConnect, label: 'Random Connect' },
    { id: 'sbnav-notifs',   route: 'notifs',          icon: icons.bell,          label: 'Notifications', badge: notifUnread },
    { id: 'sbnav-create',   route: 'create',          icon: icons.plus,          label: 'Create Post',   special: 'vd-create' },
    { id: 'sbnav-saved',    route: 'saved',           icon: icons.saved,         label: 'Saved Posts' },
  ];

  const navHTML = navItems.map((item) => {
    const badgeHTML = item.badge > 0
      ? `<span class="vd-nav-badge" aria-label="${item.badge} unread">${item.badge > 99 ? '99+' : item.badge}</span>`
      : '';
    const extraClass = item.special ? ` ${item.special}` : (item.active ? ' active' : '');
    return `
    <button
      id="${item.id}"
      class="vd-nav-item${extraClass}"
      data-route="${item.route}"
      aria-label="${item.label}"
      title="${item.label}"
    >
      ${item.icon}
      <span>${item.label}</span>
      ${badgeHTML}
    </button>`;
  }).join('');

  return `
  <aside class="vd-sidebar" role="navigation" aria-label="Main navigation">
    <a class="vd-logo-row" href="#/" aria-label="VELOVE home">
      <img src="${LOGO_IMG}" class="vd-logo-img" alt="VELOVE logo" loading="lazy" />
      <span class="vd-logo-text">VELOVE</span>
    </a>

    <nav class="vd-nav" role="list">
      ${navHTML}
      <button id="sbnav-settings" class="vd-nav-item" aria-label="Settings" title="Settings" data-route="settings" style="margin-top:auto;">
        ${icons.settings}
        <span>Settings</span>
      </button>
    </nav>

    <button id="sbnav-user-footer" class="vd-sidebar-user" aria-label="View your profile">
      <div style="position:relative;flex-shrink:0;">
        <img class="vd-sidebar-avatar" src="${avatar}" alt="${name}" loading="lazy" onerror="this.src='${LOGO_IMG}'" />
        <span class="vd-sidebar-online-dot" style="position:absolute;bottom:0;right:0;"></span>
      </div>
      <div class="vd-sidebar-user-info">
        <span class="vd-sidebar-user-name">${name}</span>
        <span class="vd-sidebar-user-handle">@${handle}</span>
      </div>
      ${icons.more}
    </button>
  </aside>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIGHT RAIL HTML
   ═══════════════════════════════════════════════════════════════════════════ */
function buildRailSkeleton() {
  const skItem = `
    <div class="vd-suggested-skeleton">
      <div class="vd-sk-circle"></div>
      <div class="vd-sk-lines">
        <div class="vd-sk-line w60"></div>
        <div class="vd-sk-line w40"></div>
      </div>
    </div>`;
  return skItem.repeat(5);
}

function buildRailSuggestedItem(u, currentUserId) {
  const avatar   = u.avatar || LOGO_IMG;
  const name     = escapeHtml(u.fullName || u.username || '');
  const username = escapeHtml(u.username || '');
  const isFollowing = Boolean(u.isFollowing);

  return `
  <div class="vd-suggested-item" data-uid="${u._id}" data-username="${username}">
    <img class="vd-suggested-avatar" src="${avatar}" alt="${username}" loading="lazy"
         onerror="this.src='${LOGO_IMG}'" />
    <div class="vd-suggested-info">
      <span class="vd-suggested-name">${name || username}</span>
      <span class="vd-suggested-sub">Suggested for you</span>
    </div>
    <button
      class="vd-suggested-follow-btn${isFollowing ? ' following' : ''}"
      data-uid="${u._id}"
      aria-label="${isFollowing ? 'Unfollow' : 'Follow'} @${username}"
      aria-pressed="${isFollowing}"
    >${isFollowing ? 'Following' : 'Follow'}</button>
  </div>`;
}

function buildRail(currentUser) {
  const avatar  = currentUser?.avatar || LOGO_IMG;
  const name    = escapeHtml(currentUser?.fullName || currentUser?.username || 'You');
  const handle  = escapeHtml(currentUser?.username || '');
  const posts   = currentUser?.postsCount ?? '—';
  const followers = Array.isArray(currentUser?.followers)
    ? currentUser.followers.length
    : (currentUser?.followersCount ?? '—');
  const following = Array.isArray(currentUser?.following)
    ? currentUser.following.length
    : (currentUser?.followingCount ?? '—');

  return `
  <aside class="vd-rail" aria-label="Discovery sidebar">

    <!-- Current user mini-profile -->
    <button class="vd-rail-profile" id="rail-profile-btn" aria-label="View your profile">
      <img class="vd-rail-profile-avatar" src="${avatar}" alt="${name}" loading="lazy"
           onerror="this.src='${LOGO_IMG}'" />
      <div class="vd-rail-profile-info">
        <span class="vd-rail-profile-name">${name}</span>
        <span class="vd-rail-profile-handle">@${handle}</span>
      </div>
      <button class="vd-rail-edit-btn" id="rail-edit-btn" aria-label="Edit profile">Edit profile</button>
    </button>

    <!-- Mini stats -->
    <div class="vd-rail-stats">
      <button class="vd-rail-stat" id="rail-stat-posts" aria-label="Posts">
        <span class="vd-rail-stat-value">${posts}</span>
        <span class="vd-rail-stat-label">Posts</span>
      </button>
      <button class="vd-rail-stat" id="rail-stat-followers" aria-label="Followers">
        <span class="vd-rail-stat-value">${followers}</span>
        <span class="vd-rail-stat-label">Followers</span>
      </button>
      <button class="vd-rail-stat" id="rail-stat-following" aria-label="Following">
        <span class="vd-rail-stat-value">${following}</span>
        <span class="vd-rail-stat-label">Following</span>
      </button>
    </div>

    <!-- Suggested for you -->
    <div class="vd-rail-section-head">
      <span class="vd-rail-section-title">Suggested for you</span>
      <button class="vd-rail-see-all" id="rail-see-all-btn">See all</button>
    </div>
    <div class="vd-suggested-list" id="vd-suggested-list">
      ${buildRailSkeleton()}
    </div>

    <!-- Trending (derived from real tags on posts currently in your feed) -->
    <div class="vd-rail-section-head">
      <span class="vd-rail-section-title">Trending</span>
      ${icons.fire}
    </div>
    <div class="vd-trending-list" id="vd-trending-list">
      <p class="vd-trending-empty">Loading trends…</p>
    </div>

    <!-- Footer -->
    <footer class="vd-rail-footer" aria-label="Footer links">
      <div>
        <a href="#">About</a> · <a href="#">Help</a> · <a href="#">Privacy</a> · <a href="#">Terms</a>
      </div>
      <p class="vd-rail-footer-copy">© ${new Date().getFullYear()} VELOVE</p>
    </footer>
  </aside>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOTTOM NAV (mobile)
   ═══════════════════════════════════════════════════════════════════════════ */
function buildBottomNav({ msgUnread = 0, notifUnread = 0 } = {}) {
  const items = [
    { id: 'bn-home',    route: 'home',     icon: icons.home,    label: 'Home',    active: true },
    { id: 'bn-search',  route: 'search',   icon: icons.search,  label: 'Search' },
    { id: 'bn-create',  route: 'create',   icon: icons.plus,    label: 'Create' },
    { id: 'bn-notifs',  route: 'notifs',   icon: icons.bell,    label: 'Alerts',  badge: notifUnread },
    { id: 'bn-profile', route: 'profile',  icon: icons.user,    label: 'Profile' },
  ];
  return `
  <nav class="vd-bottom-nav" aria-label="Bottom navigation">
    <div class="vd-bottom-nav-inner">
      ${items.map((item) => {
        const badgeHTML = item.badge > 0
          ? `<span class="vd-bn-badge" aria-label="${item.badge} unread">${item.badge > 99 ? '99+' : item.badge}</span>`
          : '';
        return `
        <button id="${item.id}" class="vd-bn-item${item.active ? ' active' : ''}"
                data-route="${item.route}" aria-label="${item.label}">
          ${item.icon}
          <span>${item.label}</span>
          ${badgeHTML}
        </button>`;
      }).join('')}
    </div>
  </nav>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN RENDER
   ═══════════════════════════════════════════════════════════════════════════ */
export function renderHome(container, { openComposer = false, onNavigate, onLogout } = {}) {
  // ── Tear down previous render's socket listeners ─────────────────────────
  if (_unsubMsgBadge) { _unsubMsgBadge(); _unsubMsgBadge = null; }
  if (_unsubNotifBell) { _unsubNotifBell(); _unsubNotifBell = null; }

  const currentUser = getSessionUser();

  // ── Apply stored theme preference ─────────────────────────────────────────
  applyThemeDoc(getStoredTheme());

  // ── Build two-column shell: sidebar + main (no right rail) ──────────────
  container.innerHTML = `
  <div class="vd-layout">

    ${buildSidebar(currentUser, { msgUnread: _msgUnread, notifUnread: _notifUnread })}

    <div class="vd-main">
    ${buildHeader(currentUser)}

    <div class="vd-content">
    <!-- ── CENTER FEED COLUMN (full width — no right rail) ─────────────── -->
    <div class="vd-feed-col">

      <!-- Stories Tray -->
      <section id="stories-tray-container" class="stories-tray-container"
               aria-label="Stories Tray" style="margin-bottom:var(--sp-4);"></section>

      <!-- Composer trigger bar → opens the create-post modal -->
      <div class="vd-composer-trigger" id="vd-composer-trigger">
        <div class="vd-composer-top">
          <img class="avatar" src="${currentUser?.avatar || LOGO_IMG}" alt=""
               loading="lazy" onerror="this.src='${LOGO_IMG}'" style="width:40px;height:40px;flex-shrink:0;border-radius:50%;" />
          <span class="vd-composer-placeholder">What's on your mind?</span>
          <button type="button" class="vd-trigger-post">Post</button>
        </div>
      </div>

      <!-- Feed tabs -->
      <div class="vd-feed-tabs" role="tablist">
        <button class="vd-feed-tab active" id="tab-foryou" role="tab"
                aria-selected="true">For You</button>
        <button class="vd-feed-tab" id="tab-following" role="tab"
                aria-selected="false">Following</button>
      </div>

      <!-- Feed -->
      <section id="feed" aria-label="Explore Feed">${feedSkeletons(3)}</section>
      <div id="feed-pagination"></div>
      <div class="feed-footer">
        <button id="logout-footer" class="link-btn back">Sign out</button>
      </div>
    </div>
    </div><!-- /.vd-content -->
    </div><!-- /.vd-main -->
  </div>

  ${buildBottomNav({ msgUnread: _msgUnread, notifUnread: _notifUnread })}
  `;

  // ── Stories Tray ─────────────────────────────────────────────────────────
  const storiesTrayEl = container.querySelector('#stories-tray-container');
  if (storiesTrayEl) renderStoriesTray(storiesTrayEl);

  // ── Notifications bell — wire to sidebar button ───────────────────────────
  // We route the notification bell to the sidebar nav button.
  // The popover still fires as before; badge stays on the sidebar item.
  const notifNavBtn  = container.querySelector('#sbnav-notifs');
  const bnNotifBtn   = container.querySelector('#bn-notifs');
  const headerBellBtn = container.querySelector('#vd-header-bell');

  // Create a synthetic badge element that the popover manager can update.
  // We intercept badge updates to also refresh sidebar + bottom-nav badges.
  const syntheticBadge = document.createElement('span');
  syntheticBadge.style.display = 'none';
  syntheticBadge.className = 'notif-badge';
  // Keep the hidden badge IDs the old code expected so notificationPopover
  // can still find them if needed via getElementById fallback.
  syntheticBadge.id = 'notif-badge';
  container.appendChild(syntheticBadge);

  // Observe the synthetic badge and mirror its value to real UI elements.
  const badgeMirrorObserver = new MutationObserver(() => {
    const count = syntheticBadge.textContent.trim();
    const visible = syntheticBadge.style.display !== 'none';
    _notifUnread = visible ? parseInt(count || '0', 10) : 0;

    // Header bell badge
    const headerBadge = headerBellBtn?.querySelector('.vd-header-badge');
    if (visible && count) {
      if (headerBadge) { headerBadge.textContent = count; headerBadge.hidden = false; }
    } else if (headerBadge) {
      headerBadge.hidden = true;
    }

    // Sidebar badge
    const existingBadge = notifNavBtn?.querySelector('.vd-nav-badge');
    if (visible && count) {
      if (existingBadge) {
        existingBadge.textContent = count;
      } else if (notifNavBtn) {
        const b = document.createElement('span');
        b.className = 'vd-nav-badge';
        b.textContent = count;
        notifNavBtn.appendChild(b);
      }
      if (bnNotifBtn) {
        const bb = bnNotifBtn.querySelector('.vd-bn-badge') || (() => {
          const el = document.createElement('span'); el.className = 'vd-bn-badge';
          bnNotifBtn.appendChild(el); return el;
        })();
        bb.textContent = count; bb.style.display = '';
      }
    } else {
      existingBadge?.remove();
      const bb = bnNotifBtn?.querySelector('.vd-bn-badge');
      if (bb) bb.style.display = 'none';
    }
  });
  badgeMirrorObserver.observe(syntheticBadge, { attributes: true, childList: true, characterData: true, subtree: true });

  // Wire the notification popover to the header bell (always visible).
  // The sidebar and bottom-nav "Notifications" buttons forward their clicks
  // to the header bell so one popover instance is shared.
  if (headerBellBtn) {
    _unsubNotifBell = initNotificationBell(headerBellBtn, syntheticBadge, { onNavigate });
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  const doLogout = async () => {
    badgeMirrorObserver.disconnect();
    await authApi.logout();
    clearSession();
    if (typeof onLogout === 'function') onLogout();
  };
  container.querySelector('#logout-footer')?.addEventListener('click', doLogout);

  // ── Sidebar: nav button routing ──────────────────────────────────────────
  const sidebarEl = container.querySelector('.vd-sidebar');
  sidebarEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    const route = btn.dataset.route;

    // Update active state
    sidebarEl.querySelectorAll('.vd-nav-item').forEach((el) => el.classList.remove('active'));
    if (route !== 'create' && route !== 'settings') btn.classList.add('active');

    switch (route) {
      case 'home':           break; // already here
      case 'search':         focusHeaderSearch(); break;
      case 'random-connect': closePopover(); onNavigate?.('random-connect'); break;
      case 'messages':       closePopover(); onNavigate?.('messages'); break;
      case 'notifs':  // shared popover: forward to the header bell
        headerBellBtn?.click();
        break;
      case 'create':   openComposerModal(); break;
      case 'saved':    closePopover(); onNavigate?.('saved'); break;
      case 'profile':  closePopover(); onNavigate?.('profile', { username: currentUser?.username }); break;
      case 'settings': showToast('Settings coming soon!'); break;
    }
  });

  // Sidebar user footer → profile
  container.querySelector('#sbnav-user-footer')?.addEventListener('click', () => {
    closePopover();
    onNavigate?.('profile', { username: currentUser?.username });
  });

  // ── Bottom nav routing ───────────────────────────────────────────────────
  const bottomNav = container.closest('body')?.querySelector('.vd-bottom-nav')
    ?? document.querySelector('.vd-bottom-nav');
  // The bottom nav is rendered inside the container div via innerHTML so:
  const bottomNavEl = container.querySelector('.vd-bottom-nav');
  bottomNavEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    const route = btn.dataset.route;

    bottomNavEl.querySelectorAll('.vd-bn-item').forEach((el) => el.classList.remove('active'));
    btn.classList.add('active');

    switch (route) {
      case 'home':    break;
      case 'search':  focusHeaderSearch(); break;
      case 'create':  openComposerModal(); break;
      case 'notifs':  headerBellBtn?.click(); break;
      case 'profile': closePopover(); onNavigate?.('profile', { username: currentUser?.username }); break;
    }
  });

  // ── Right rail removed — no event listeners needed ───────────────────────

  // ── Right rail removed — suggested users not loaded on home ─────────────

  // ── Messages badge ───────────────────────────────────────────────────────
  // Badge on sidebar + bottom nav (msg)
  function updateMsgBadge(count) {
    _msgUnread = count;
    const display = count > 0;
    const text = count > 99 ? '99+' : String(count);

    // Sidebar
    const msgNavBtn = container.querySelector('#sbnav-messages');
    const existingBadge = msgNavBtn?.querySelector('.vd-nav-badge');
    if (display) {
      if (existingBadge) {
        existingBadge.textContent = text;
      } else if (msgNavBtn) {
        const b = document.createElement('span');
        b.className = 'vd-nav-badge'; b.textContent = text;
        msgNavBtn.appendChild(b);
      }
    } else {
      existingBadge?.remove();
    }

    // Bottom nav (no messages button, but keep for future)
  }

  messageApi.getConversations()
    .then((res) => {
      const unread = (res.conversations || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0);
      updateMsgBadge(unread);
    })
    .catch(() => {});

  _unsubMsgBadge = onReceiveMessage(() => {
    updateMsgBadge(_msgUnread + 1);
  });

  // ── Create-post modal ──────────────────────────────────────────────────
  // Dropzone + drag-and-drop, media preview, caption with 2200-char counter,
  // location + tags inputs — all wired to the real POST /api/posts contract.
  function openComposerModal() {
    if (document.getElementById('cp-modal')) return;

    let pendingFile = null;
    let previewUrl = null;

    const modal = showModal({
      id: 'cp-modal',
      bodyHTML: `
      <div class="cp-modal" role="dialog" aria-modal="true" aria-label="Create post">
        <header class="cp-head">
          <h3>Create Post</h3>
          <button class="cp-close" id="cp-close" aria-label="Close">${icons.close}</button>
        </header>
        <div class="cp-drop" id="cp-drop" role="button" tabindex="0" aria-label="Upload media: drag and drop or click to browse">
          <span class="cp-drop-icon">${icons.upload}</span>
          <strong>Drag and drop media here</strong>
          <small>or click to upload — photos &amp; videos up to 15MB</small>
          <input type="file" id="cp-file" accept="image/*,video/*" hidden />
        </div>
        <div class="cp-preview" id="cp-preview" hidden></div>
        <textarea id="cp-caption" class="cp-caption" rows="3" maxlength="2200"
                  placeholder="Write a caption..." autocomplete="off"></textarea>
        <div class="cp-counter"><span id="cp-count">0</span>/2200</div>
        <div class="cp-fields">
          <label class="cp-field">${icons.mapPin}
            <input id="cp-location" type="text" maxlength="100" placeholder="Add location" autocomplete="off" />
          </label>
          <label class="cp-field">${icons.tag}
            <input id="cp-tags" type="text" placeholder="Add tags, comma separated" autocomplete="off" />
          </label>
        </div>
        <p class="cp-msg" id="cp-msg" role="status"></p>
        <footer class="cp-foot">
          <button class="cp-cancel" id="cp-cancel" type="button">Cancel</button>
          <button class="cp-publish" id="cp-publish" type="button" disabled>Publish</button>
        </footer>
      </div>`,
      onOpen: (overlay, cleanup) => {
        const drop     = overlay.querySelector('#cp-drop');
        const fileInput = overlay.querySelector('#cp-file');
        const preview  = overlay.querySelector('#cp-preview');
        const caption  = overlay.querySelector('#cp-caption');
        const countEl  = overlay.querySelector('#cp-count');
        const location = overlay.querySelector('#cp-location');
        const tags     = overlay.querySelector('#cp-tags');
        const msg      = overlay.querySelector('#cp-msg');
        const publish  = overlay.querySelector('#cp-publish');

        const refreshPublish = () => { publish.disabled = !pendingFile; };

        const setFile = (f) => {
          if (!f) return;
          if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
            msg.textContent = 'Please choose an image or video file.';
            return;
          }
          if (f.size > 15 * 1024 * 1024) {
            msg.textContent = 'File is too large — the limit is 15MB.';
            return;
          }
          pendingFile = f;
          msg.textContent = '';
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          previewUrl = URL.createObjectURL(f);
          const isVideo = f.type.startsWith('video');
          preview.innerHTML = `
            <${isVideo ? 'video' : 'img'} src="${previewUrl}" ${isVideo ? 'controls muted playsinline' : 'alt="Media preview"'} />
            <button class="cp-preview-remove" id="cp-rm" type="button" aria-label="Remove media">${icons.close}</button>`;
          preview.hidden = false;
          drop.classList.add('has-file');
          overlay.querySelector('#cp-rm')?.addEventListener('click', () => {
            pendingFile = null;
            if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
            preview.innerHTML = '';
            preview.hidden = true;
            drop.classList.remove('has-file');
            fileInput.value = '';
            refreshPublish();
          });
          refreshPublish();
        };

        drop.addEventListener('click', () => fileInput.click());
        drop.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
        });
        fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
        ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.remove('drag-over');
        }));
        drop.addEventListener('drop', (e) => setFile(e.dataTransfer?.files?.[0]));

        caption.addEventListener('input', () => {
          countEl.textContent = caption.value.length;
        });

        overlay.querySelector('#cp-close')?.addEventListener('click', cleanup);
        overlay.querySelector('#cp-cancel')?.addEventListener('click', cleanup);

        publish.addEventListener('click', async () => {
          if (!pendingFile) return;
          publish.disabled = true;
          publish.textContent = 'Publishing…';
          msg.textContent = '';

          const fd = new FormData();
          fd.append('media', pendingFile);
          fd.append('caption', caption.value.trim());
          const loc = location.value.trim();
          if (loc) fd.append('location', loc);
          const tagList = tags.value.split(',').map((t) => t.trim()).filter(Boolean);
          if (tagList.length) fd.append('tags', tagList.join(','));

          try {
            const data = await postApi.createPost(fd);
            if (data.success) {
              showToast('Post shared! ✓');
              if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
              cleanup();
              setTimeout(() => loadFeed(1), 300);
            } else {
              msg.textContent = data.message || 'Post failed';
              publish.disabled = false;
              publish.textContent = 'Publish';
            }
          } catch (err) {
            msg.textContent = err.message || 'Network error — try again';
            publish.disabled = false;
            publish.textContent = 'Publish';
          }
        });

        caption.focus();
      },
      onClose: () => {
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      },
    });

    return modal;
  }

  // Composer trigger bar → open the modal; chips open it and focus their field
  const composerTrigger = container.querySelector('#vd-composer-trigger');
  composerTrigger?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cp-focus]');
    const modal = openComposerModal();
    if (chip && modal) {
      const field = chip.dataset.cpFocus === 'file'
        ? modal.overlay.querySelector('#cp-drop')
        : modal.overlay.querySelector(`#cp-${chip.dataset.cpFocus}`);
      field?.focus();
    }
  });

  // ── Header: theme toggle, search dropdown, avatar ──────────────────────
  const themeBtn = container.querySelector('#vd-theme-btn');
  const syncThemeIcon = () => {
    if (!themeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    themeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncThemeIcon();
  themeBtn?.addEventListener('click', () => {
    toggleTheme();
    syncThemeIcon();
  });

  const headerAvatar = container.querySelector('#vd-header-avatar');
  headerAvatar?.addEventListener('click', () => {
    closePopover();
    onNavigate?.('profile', { username: currentUser?.username });
  });

  const searchInput = container.querySelector('#vd-search-input');
  const searchDrop  = container.querySelector('#vd-search-drop');
  let searchTimer = null;
  let searchSeq = 0;

  function closeSearchDrop() {
    if (!searchDrop) return;
    searchDrop.hidden = true;
    searchDrop.innerHTML = '';
    searchInput?.setAttribute('aria-expanded', 'false');
  }

  function focusHeaderSearch() {
    if (!searchInput) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    searchInput.focus();
  }

  function renderSearchResults(users) {
    if (!users.length) {
      searchDrop.innerHTML = '<p class="vd-search-empty">No users found.</p>';
    } else {
      searchDrop.innerHTML = users.map((u) => `
        <button class="vd-search-item" data-username="${escapeHtml(u.username || '')}" role="option">
          <img src="${u.avatar || LOGO_IMG}" alt="" loading="lazy" onerror="this.src='${LOGO_IMG}'" />
          <span class="vd-search-item-info">
            <strong>${escapeHtml(u.fullName || u.username || '')}</strong>
            <small>@${escapeHtml(u.username || '')}</small>
          </span>
        </button>`).join('');
    }
    searchDrop.hidden = false;
    searchInput?.setAttribute('aria-expanded', 'true');
  }

  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { closeSearchDrop(); return; }
    const seq = ++searchSeq;
    searchTimer = setTimeout(async () => {
      try {
        const res = await userApi.search(q);
        if (seq !== searchSeq) return; // stale response — a newer keystroke won
        renderSearchResults(res.users || []);
      } catch {
        if (seq !== searchSeq) return;
        searchDrop.innerHTML = '<p class="vd-search-empty">Couldn\u2019t search right now.</p>';
        searchDrop.hidden = false;
      }
    }, 300);
  });

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSearchDrop(); searchInput.blur(); return; }
    const items = [...(searchDrop?.querySelectorAll('.vd-search-item') || [])];
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (idx <= 0 ? searchInput : items[idx - 1]).focus(); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); items[idx].click(); }
  });

  searchDrop?.addEventListener('keydown', (e) => {
    const items = [...searchDrop.querySelectorAll('.vd-search-item')];
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || searchInput).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (idx <= 0 ? searchInput : items[idx - 1]).focus(); }
    else if (e.key === 'Escape') { closeSearchDrop(); searchInput?.focus(); }
  });

  searchDrop?.addEventListener('click', (e) => {
    const item = e.target.closest('.vd-search-item[data-username]');
    if (!item) return;
    closeSearchDrop();
    searchInput.value = '';
    closePopover();
    onNavigate?.('profile', { username: item.dataset.username });
  });

  // Close the search dropdown on any outside click
  if (_unsubDocClick) _unsubDocClick();
  const onDocClick = (e) => {
    if (!e.target.closest('.vd-search')) closeSearchDrop();
  };
  document.addEventListener('click', onDocClick);
  _unsubDocClick = () => document.removeEventListener('click', onDocClick);

  // ── Feed delegated interactions ──────────────────────────────────────────
  // All IDs preserved exactly: #feed, #feed-list, #feed-pagination,
  // #feed-load-more, #feed-empty-post, #feed-retry-btn
  const feedEl = container.querySelector('#feed');
  feedEl?.addEventListener('click', async (e) => {

    // 1. Like
    const likeBtn = e.target.closest('.feed-like');
    if (likeBtn) {
      e.stopPropagation();
      if (likeBtn.disabled) return;
      likeBtn.disabled = true;
      const postId = likeBtn.dataset.id;
      const countEl = likeBtn.querySelector('.feed-like-count');
      try {
        const data = await postApi.toggleLike(postId);
        likeBtn.classList.toggle('liked', data.isLiked);
        likeBtn.setAttribute('aria-pressed', String(!!data.isLiked));
        if (countEl) {
          countEl.textContent = data.likesCount !== undefined
            ? data.likesCount
            : Math.max(0, parseInt(countEl.textContent, 10) + (data.isLiked ? 1 : -1));
        }
        // Update likes count line below the actions row (create it if the
        // post had zero likes when rendered and the line doesn't exist yet)
        const postCard = likeBtn.closest('.feed-post');
        let likesLine = postCard?.querySelector('.vd-likes-count');
        if (postCard && data.likesCount !== undefined) {
          if (data.likesCount > 0) {
            if (!likesLine) {
              likesLine = document.createElement('div');
              likesLine.className = 'vd-likes-count';
              postCard.querySelector('.feed-actions')?.insertAdjacentElement('afterend', likesLine);
            }
            likesLine.textContent = `${data.likesCount.toLocaleString()} like${data.likesCount !== 1 ? 's' : ''}`;
            likesLine.style.display = '';
          } else if (likesLine) {
            likesLine.style.display = 'none';
          }
        }
        likeBtn.classList.add('pop');
        setTimeout(() => likeBtn.classList.remove('pop'), 380);
      } catch (err) {
        showToast(err.message || 'Network error — like not saved', 'err');
      } finally {
        likeBtn.disabled = false;
      }
      return;
    }

    // 2. Save / Bookmark
    const saveBtn = e.target.closest('.feed-save');
    if (saveBtn) {
      e.stopPropagation();
      if (saveBtn.disabled) return;
      saveBtn.disabled = true;
      const postId = saveBtn.dataset.id;
      try {
        const data = await postApi.toggleSave(postId);
        const nowSaved = Boolean(data.isSaved);
        saveBtn.classList.toggle('saved', nowSaved);
        saveBtn.setAttribute('aria-pressed', String(nowSaved));
        saveBtn.setAttribute('aria-label', nowSaved ? 'Remove bookmark' : 'Save post');
        saveBtn.innerHTML = nowSaved ? icons.bookmarkFilled : icons.bookmark;
        saveBtn.classList.add('pop');
        setTimeout(() => saveBtn.classList.remove('pop'), 180);

        const u = getSessionUser();
        if (u) {
          let saved = Array.isArray(u.savedPosts) ? [...u.savedPosts] : [];
          if (nowSaved) {
            if (!saved.some((id) => String(id._id || id) === postId)) saved.push(postId);
          } else {
            saved = saved.filter((id) => String(id._id || id) !== postId);
          }
          updateSessionUser({ savedPosts: saved });
        }
        showToast(nowSaved ? 'Post saved to bookmarks' : 'Post removed from bookmarks');
      } catch (err) {
        showToast(err.message || 'Could not update bookmark', 'err');
      } finally {
        saveBtn.disabled = false;
      }
      return;
    }

    // 3. Share (copy link to clipboard)
    const shareBtn = e.target.closest('.vd-share-btn');
    if (shareBtn) {
      e.stopPropagation();
      const postId = shareBtn.dataset.id;
      const url = `${window.location.origin}/#/post/${postId}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard ✓');
      } catch {
        showToast(url);
      }
      return;
    }

    // 4. Profile click
    const userTarget = e.target.closest('[data-username]');
    if (userTarget && userTarget.dataset.username && !e.target.closest('.vd-post-more')) {
      e.stopPropagation();
      closePopover();
      onNavigate?.('profile', { username: userTarget.dataset.username });
      return;
    }

    // 5. Post detail (media or comment button)
    const mediaOrComment = e.target.closest('.feed-media, .feed-comment-btn');
    if (mediaOrComment) {
      e.stopPropagation();
      const postCard = mediaOrComment.closest('.feed-post');
      if (postCard?.dataset.id) {
        closePopover();
        onNavigate?.('postDetail', { postId: postCard.dataset.id });
      }
    }
  });

  // ── Feed tabs (For You / Following) ──────────────────────────────────────
  // Both tabs load from the same /feed endpoint for now — they just label
  // intent. "Following" filters to followed users; "For You" is broader.
  // The existing getFeed() always fetches the followed + self feed, which
  // matches the "Following" semantics. Both tabs load the same data until a
  // discovery endpoint is available.
  let _activeTab = 'foryou';
  container.querySelector('#tab-foryou')?.addEventListener('click', (e) => {
    if (_activeTab === 'foryou') return;
    _activeTab = 'foryou';
    e.currentTarget.classList.add('active');
    e.currentTarget.setAttribute('aria-selected', 'true');
    container.querySelector('#tab-following')?.classList.remove('active');
    container.querySelector('#tab-following')?.setAttribute('aria-selected', 'false');
    loadFeed(1);
  });
  container.querySelector('#tab-following')?.addEventListener('click', (e) => {
    if (_activeTab === 'following') return;
    _activeTab = 'following';
    e.currentTarget.classList.add('active');
    e.currentTarget.setAttribute('aria-selected', 'true');
    container.querySelector('#tab-foryou')?.classList.remove('active');
    container.querySelector('#tab-foryou')?.setAttribute('aria-selected', 'false');
    loadFeed(1);
  });

  // ── Feed pagination + loading ─────────────────────────────────────────────
  let currentPage = 1;
  let totalPages  = 1;

  // ── Trending (derived ONLY from real tags on posts in your loaded feed) ─
  const tagCounts = new Map(); // tag -> post count, accumulated per feed load

  function collectTags(posts) {
    (posts || []).forEach((p) => {
      (p.tags || []).forEach((raw) => {
        const t = String(raw).trim().toLowerCase();
        if (!t) return;
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      });
    });
  }

  function renderTrending() {
    const el = container.querySelector('#vd-trending-list');
    if (!el) return;
    if (!tagCounts.size) {
      el.innerHTML = '<p class="vd-trending-empty">Tags from your feed will appear here.</p>';
      return;
    }
    const top = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    el.innerHTML = top.map(([tag, count]) => `
      <div class="vd-trending-item">
        <span class="vd-trending-hash">${icons.hash}</span>
        <div class="vd-trending-meta">
          <strong>#${escapeHtml(tag)}</strong>
          <small>${count} post${count !== 1 ? 's' : ''}</small>
        </div>
      </div>`).join('');
  }

  async function loadFeed(page = 1) {
    const pagination = container.querySelector('#feed-pagination');
    const savedPostIds = (getSessionUser()?.savedPosts || []).map((id) => String(id._id || id));

    try {
      const data = await postApi.getFeed(page, 10);
      currentPage = data.page || 1;
      totalPages  = data.pages || 1;

      if (page === 1) tagCounts.clear();
      collectTags(data.posts);
      renderTrending();

      if (page === 1) {
        if (data.posts?.length) {
          feedEl.innerHTML = `<div id="feed-list">${data.posts.map((p) => feedPostTemplate(p, currentUser?._id, savedPostIds)).join('')}</div>`;
        } else {
          feedEl.innerHTML = `
          <div class="empty">
            <span class="empty-icon">📸</span>
            <strong>Your feed is empty</strong>
            <p>Follow people or share your first post to get started.</p>
            <button id="feed-empty-post" class="btn-gradient btn-small" style="margin-top:4px">Create a Post</button>
          </div>`;
          container.querySelector('#feed-empty-post')?.addEventListener('click', () => {
            openComposerModal();
          });
        }
      } else if (data.posts?.length) {
        const list = container.querySelector('#feed-list');
        if (list) {
          list.insertAdjacentHTML('beforeend', data.posts.map((p) => feedPostTemplate(p, currentUser?._id, savedPostIds)).join(''));
        }
      }

      if (pagination) {
        if (currentPage < totalPages) {
          pagination.innerHTML = `<button id="feed-load-more" class="feed-load-more">Load more ↓</button>`;
          container.querySelector('#feed-load-more')?.addEventListener('click', () => loadFeed(currentPage + 1));
        } else {
          pagination.innerHTML = '';
        }
      }
    } catch {
      if (page === 1 && feedEl) {
        feedEl.innerHTML = `
          <div class="empty">
            <span class="empty-icon">⚠️</span>
            <strong>Couldn't load feed</strong>
            <p>Check your connection and try again.</p>
            <button id="feed-retry-btn" class="btn-gradient btn-small" style="margin-top:4px">Retry</button>
          </div>`;
        container.querySelector('#feed-retry-btn')?.addEventListener('click', () => loadFeed(1));
      } else {
        showToast('Network error — could not load more posts', 'err');
      }
    }
  }

  loadFeed(1);

  // ── Inline quick-comment form (delegated across the feed) ───────────────
  feedEl?.addEventListener('submit', async (e) => {
    const form = e.target.closest('.feed-quick-comment');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const sendBtn = form.querySelector('.feed-quick-send');
    const text = input?.value.trim();
    if (!text || !input || sendBtn?.disabled) return;
    const postId = form.dataset.id;
    sendBtn.disabled = true;
    try {
      await commentApi.addComment(postId, text);
      input.value = '';
      // Bump the visible comment count on the card
      const postCard = form.closest('.feed-post');
      const counter = postCard?.querySelector('.feed-comment-btn span');
      if (counter) counter.textContent = (parseInt(counter.textContent, 10) || 0) + 1;
      showToast('Comment added');
    } catch (err) {
      showToast(err.message || 'Could not add comment', 'err');
    } finally {
      sendBtn.disabled = true; // stays disabled while input is empty
    }
  });

  // Enable the send button only while the quick-comment field has text
  feedEl?.addEventListener('input', (e) => {
    const form = e.target.closest('.feed-quick-comment');
    if (!form) return;
    const sendBtn = form.querySelector('.feed-quick-send');
    if (sendBtn) sendBtn.disabled = !e.target.value.trim();
  });

  // "View all N comments" → post detail
  feedEl?.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.feed-view-comments');
    if (!viewBtn) return;
    e.stopPropagation();
    closePopover();
    onNavigate?.('postDetail', { postId: viewBtn.dataset.id });
  });

  // ── Honor ?openComposer param (e.g. finishing onboarding) ───────────────
  if (openComposer) openComposerModal();
}
