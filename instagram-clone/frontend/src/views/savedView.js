import { LOGO_IMG, icons } from '../constants.js';
import { postApi, authApi, userApi } from '../services/api.js';
import { getSessionUser, clearSession, updateSessionUser } from '../state/session.js';
import { toggleTheme } from '../state/theme.js';
import { escapeHtml, mediaSrc, showToast, showModal } from '../utils/dom.js';

/**
 * Build Left Sidebar for Saved Posts View
 */
function buildSavedSidebar(currentUser) {
  const avatar = currentUser?.avatar || LOGO_IMG;
  const name = escapeHtml(currentUser?.fullName || currentUser?.username || 'You');
  const handle = escapeHtml(currentUser?.username || '');

  const navItems = [
    { id: 'sbnav-home', route: 'home', icon: icons.home, label: 'Home' },
    { id: 'sbnav-messages', route: 'messages', icon: icons.message, label: 'Messages' },
    { id: 'sbnav-random', route: 'random-connect', icon: icons.randomConnect, label: 'Random Connect' },
    { id: 'sbnav-notifs', route: 'notifs', icon: icons.bell, label: 'Notifications' },
    { id: 'sbnav-create', route: 'create', icon: icons.plus, label: 'Create Post', special: 'vd-create' },
    { id: 'sbnav-saved', route: 'saved', icon: icons.saved, label: 'Saved Posts', active: true },
  ];

  const navHTML = navItems.map((item) => {
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

/**
 * Video indicator SVG icon
 */
const videoCameraIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;

/**
 * Render the dedicated Saved Posts View
 */
export async function renderSavedView(container, { onNavigate, onLogout } = {}) {
  const currentUser = getSessionUser();
  if (!currentUser) {
    onNavigate?.('home');
    return;
  }

  container.innerHTML = `
  <div class="vd-layout">
    ${buildSavedSidebar(currentUser)}

    <div class="vd-main">
      <!-- Top header bar -->
      <header class="vd-header">
        <div class="vd-header-left">
          <button id="vd-saved-back-btn" class="vd-icon-btn mobile-only" title="Back to Home" aria-label="Back">
            ${icons.arrowLeft}
          </button>
          <div class="vd-saved-header-meta">
            <span class="vd-saved-header-title">Saved</span>
          </div>
        </div>

        <div class="vd-header-right">
          <button id="vd-theme-btn" class="vd-icon-btn" title="Toggle theme" aria-label="Toggle theme">
            ${icons.sun}
          </button>
          <button id="vd-header-avatar" class="vd-header-avatar-btn" title="Your account" aria-label="Your account">
            <img src="${currentUser?.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
          </button>
        </div>
      </header>

      <!-- Main Saved Posts Area -->
      <div class="vd-content">
        <div class="vd-saved-container">
          <!-- Page Banner -->
          <div class="vd-saved-hero">
            <div class="vd-saved-hero-left">
              <div class="vd-saved-hero-icon">
                ${icons.saved}
              </div>
              <div class="vd-saved-hero-text">
                <h1 class="vd-saved-hero-heading">Saved Posts</h1>
                <p class="vd-saved-hero-sub">Only you can see the posts you've bookmarked</p>
              </div>
            </div>
            <div class="vd-saved-hero-badge" id="vd-saved-badge">
              <span id="vd-saved-count-num">Loading…</span>
            </div>
          </div>

          <!-- Grid Stream Container -->
          <div id="vd-saved-grid-wrap" class="vd-saved-grid-wrap">
            <div class="vd-saved-skeletons">
              <div class="vd-saved-sk-cell"></div>
              <div class="vd-saved-sk-cell"></div>
              <div class="vd-saved-sk-cell"></div>
              <div class="vd-saved-sk-cell"></div>
              <div class="vd-saved-sk-cell"></div>
              <div class="vd-saved-sk-cell"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // DOM Elements
  const gridWrap = container.querySelector('#vd-saved-grid-wrap');
  const countNum = container.querySelector('#vd-saved-count-num');
  const backBtn = container.querySelector('#vd-saved-back-btn');

  backBtn?.addEventListener('click', () => onNavigate?.('home'));

  // Header Avatar click
  container.querySelector('#vd-header-avatar')?.addEventListener('click', () => {
    onNavigate?.('profile', { username: currentUser?.username });
  });

  // Theme Toggle
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

  // Sidebar navigation bindings
  const sidebarEl = container.querySelector('.vd-sidebar');
  sidebarEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route]');
    if (!btn) return;
    const route = btn.dataset.route;

    switch (route) {
      case 'home':
        onNavigate?.('home');
        break;
      case 'messages':
        onNavigate?.('messages');
        break;
      case 'random-connect':
        onNavigate?.('random-connect');
        break;
      case 'notifs':
        onNavigate?.('home');
        break;
      case 'create':
        onNavigate?.('home');
        break;
      case 'saved':
        break; // Already here
      case 'settings':
        showToast('Settings coming soon!');
        break;
      case 'profile':
        onNavigate?.('profile', { username: currentUser?.username });
        break;
    }
  });

  // User Footer click
  container.querySelector('#sbnav-user-footer')?.addEventListener('click', () => {
    onNavigate?.('profile', { username: currentUser?.username });
  });

  // Fetch saved posts
  let savedPosts = [];
  try {
    const data = await postApi.getSavedPosts();
    savedPosts = data.savedPosts || data.posts || [];
    renderSavedList(savedPosts);
  } catch (err) {
    console.error('[Saved] Error fetching saved posts:', err);
    if (gridWrap) {
      gridWrap.innerHTML = `
        <div class="vd-saved-error">
          <p>⚠️ ${escapeHtml(err.message || 'Could not load saved posts')}</p>
          <button class="vd-btn-retry" id="vd-saved-retry-btn">Retry</button>
        </div>
      `;
      container.querySelector('#vd-saved-retry-btn')?.addEventListener('click', () => {
        renderSavedView(container, { onNavigate, onLogout });
      });
    }
    if (countNum) countNum.textContent = '0 posts';
  }

  /**
   * Render the saved posts list / empty state
   */
  function renderSavedList(posts) {
    if (countNum) {
      countNum.textContent = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;
    }

    if (!posts || posts.length === 0) {
      gridWrap.innerHTML = `
        <div class="vd-saved-empty">
          <div class="vd-saved-empty-circle">
            ${icons.saved}
          </div>
          <h2 class="vd-saved-empty-title">No saved posts yet</h2>
          <p class="vd-saved-empty-sub">
            Save photos and videos that you want to see again. Nobody is notified when you save something.
          </p>
          <button class="vd-saved-explore-btn" id="vd-saved-feed-btn">
            Browse Home Feed
          </button>
        </div>
      `;
      container.querySelector('#vd-saved-feed-btn')?.addEventListener('click', () => {
        onNavigate?.('home');
      });
      return;
    }

    gridWrap.innerHTML = `
      <div class="vd-saved-grid">
        ${posts.map((p) => {
          const src = mediaSrc(p.mediaUrl);
          const isVideo = p.mediaType === 'video';
          const author = p.user?.username || p.user?.fullName || 'User';
          const authorAvatar = p.user?.avatar || LOGO_IMG;
          const caption = p.caption || '';

          return `
          <article class="vd-saved-card" data-id="${p._id}">
            <div class="vd-saved-media-box">
              ${src
                ? (isVideo
                    ? `<video src="${src}" class="vd-saved-media" muted preload="metadata"></video>
                       <span class="vd-saved-video-badge" title="Video">${videoCameraIcon}</span>`
                    : `<img src="${src}" class="vd-saved-media" alt="${escapeHtml(caption || 'Post')}" loading="lazy" onerror="this.parentElement.classList.add('broken');" />`)
                : `<div class="vd-saved-caption-preview">${escapeHtml(caption)}</div>`
              }

              <!-- Unsave button badge overlay -->
              <button class="vd-saved-unsave-btn" data-unsave-id="${p._id}" title="Remove from saved" aria-label="Remove bookmark">
                ${icons.saved}
              </button>

              <!-- Hover overlay with stats -->
              <div class="vd-saved-overlay" data-cell-id="${p._id}">
                <div class="vd-saved-overlay-meta">
                  <div class="vd-saved-author-pill">
                    <img src="${authorAvatar}" class="vd-saved-author-avatar" alt="" onerror="this.src='${LOGO_IMG}'" />
                    <span>@${escapeHtml(author)}</span>
                  </div>
                  <div class="vd-saved-stats-row">
                    <span class="vd-saved-stat">${icons.heart} ${p.likesCount || (p.likes ? p.likes.length : 0)}</span>
                    <span class="vd-saved-stat">${icons.message} ${p.commentsCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>
            ${caption ? `<p class="vd-saved-caption-text" title="${escapeHtml(caption)}">${escapeHtml(caption)}</p>` : ''}
          </article>`;
        }).join('')}
      </div>
    `;

    // Handle Unsave / Remove Bookmark
    gridWrap.querySelectorAll('.vd-saved-unsave-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const postId = btn.dataset.unsaveId;
        if (!postId) return;

        try {
          await postApi.toggleSave(postId);

          // Update session user saved list
          const u = getSessionUser();
          if (u) {
            let saved = Array.isArray(u.savedPosts) ? [...u.savedPosts] : [];
            saved = saved.filter((id) => String(id._id || id) !== postId);
            updateSessionUser({ savedPosts: saved });
          }

          // Animate removal from view
          const card = gridWrap.querySelector(`.vd-saved-card[data-id="${postId}"]`);
          if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
              savedPosts = savedPosts.filter((item) => String(item._id) !== postId);
              renderSavedList(savedPosts);
            }, 300);
          }

          showToast('Removed from saved posts', 'info');
        } catch (err) {
          showToast(err.message || 'Could not remove post', 'error');
        }
      });
    });

    // Handle Click on Post to view detail
    gridWrap.querySelectorAll('.vd-saved-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.vd-saved-unsave-btn')) return;
        const postId = card.dataset.id;
        if (postId) {
          onNavigate?.('postDetail', { postId });
        }
      });
    });
  }
}

