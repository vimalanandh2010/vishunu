import { LOGO_IMG, icons } from '../constants.js';
import { userApi, postApi, messageApi } from '../services/api.js';
import { getSessionUser } from '../state/session.js';
import { escapeHtml, mediaSrc } from '../utils/dom.js';
import { toggleTheme } from '../state/theme.js';

function renderGridHTML(posts) {
  if (!posts || !posts.length) {
    return `<div class="empty"><span class="empty-icon">📷</span><strong>No posts yet</strong><p>Share your first moment!</p></div>`;
  }
  return `<div class="pf-grid">${posts.map((p) => {
    const src = mediaSrc(p.mediaUrl);
    return src
      ? (p.mediaType === 'video'
        ? `<div class="pf-cell" data-id="${p._id}" title="Open post"><video src="${src}" muted></video></div>`
        : `<div class="pf-cell" data-id="${p._id}" title="Open post"><img src="${src}" alt="${escapeHtml(p.caption || 'post')}" onerror="this.parentElement.classList.add('broken')" /></div>`)
      : `<div class="pf-cell" data-id="${p._id}" title="Open post"><div class="pf-cap">${escapeHtml(p.caption || '')}</div></div>`;
  }).join('')}</div>`;
}

/**
 * Renders the User Profile screen.
 */
export async function renderProfile(container, username, { onNavigate, onGoBack, _autoOpenSavedTab = false } = {}) {
  const currentUser = getSessionUser();

  container.innerHTML = `
  <div class="app-shell">
    <nav class="top-nav" role="banner">
      <div class="top-nav-inner">
        <button id="pf-back" class="nav-btn" title="Back" aria-label="Go back">${icons.arrowLeft}</button>
        <span class="nav-brand" style="font-size:15px;letter-spacing:1px">Profile</span>
        <button id="pf-theme-btn" class="nav-btn" title="Toggle theme" aria-label="Toggle theme" style="margin-left:auto">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>
      </div>
    </nav>
    <main class="feed-area"><section class="card profile-card">
      <div class="people-loading">Loading profile…</div>
    </section></main>
  </div>`;

  document.getElementById('pf-back')?.addEventListener('click', () => {
    if (typeof onGoBack === 'function') onGoBack();
  });

  // Theme toggle (both loading and full render share same btn id)
  const pfThemeBtn = document.getElementById('pf-theme-btn');
  const syncPfThemeIcon = () => {
    if (!pfThemeBtn) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    pfThemeBtn.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncPfThemeIcon();
  pfThemeBtn?.addEventListener('click', () => { toggleTheme(); syncPfThemeIcon(); });

  let profile, userPosts;
  try {
    const [pData, postsData] = await Promise.all([
      userApi.getProfile(username),
      userApi.getUserPosts(username).catch(() => ({ posts: [] })),
    ]);

    profile = pData.profile;
    userPosts = postsData.posts || [];
  } catch (err) {
    const cardEl = container.querySelector('.profile-card');
    if (cardEl) {
      cardEl.innerHTML = `<div class="empty">⚠️ ${escapeHtml(err.message || "Couldn't load profile.")}</div>`;
    }
    return;
  }

  const isMe = currentUser && (profile._id === currentUser._id || profile.username === currentUser.username);
  const following = !!profile.isFollowing;
  const web = profile.website
    ? /^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`
    : null;

  container.innerHTML = `
  <div class="app-shell">
    <nav class="top-nav" role="banner">
      <div class="top-nav-inner">
        <button id="pf-back" class="nav-btn" title="Back" aria-label="Go back">${icons.arrowLeft}</button>
        <span class="nav-brand" style="font-size:15px;letter-spacing:1px">@${escapeHtml(profile.username)}</span>
        <button id="pf-theme-btn" class="nav-btn" title="Toggle theme" aria-label="Toggle theme" style="margin-left:auto">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>
      </div>
    </nav>
    <main class="feed-area"><section class="card profile-card">

      <div class="pf-head">
        <img class="avatar pf-avatar" src="${profile.avatar || LOGO_IMG}" alt="${escapeHtml(profile.username)}" onerror="this.src='${LOGO_IMG}'" />
        <div class="pf-id">
          <div class="pf-name">${escapeHtml(profile.fullName || profile.username)}
            ${profile.isVerified ? '<span class="pf-verified" title="Verified">✔️</span>' : ''}</div>
          <div class="pf-username">@${escapeHtml(profile.username)}</div>
        </div>
      </div>

      ${profile.bio ? `<p class="pf-bio">${escapeHtml(profile.bio)}</p>` : ''}
      ${web ? `<a class="pf-web" href="${escapeHtml(web)}" target="_blank" rel="noopener">🔗 ${escapeHtml(profile.website)}</a>` : ''}

      <div class="pf-stats">
        <div class="pf-stat"><strong id="pf-posts">${profile.postsCount ?? userPosts.length}</strong><span>posts</span></div>
        <div class="pf-stat"><strong id="pf-followers">${profile.followersCount}</strong><span>followers</span></div>
        <div class="pf-stat"><strong id="pf-following">${profile.followingCount}</strong><span>following</span></div>
      </div>

      ${isMe
        ? `<button id="pf-edit" class="btn-gradient btn-wide">Edit Profile</button>`
        : `<div style="display:flex;gap:var(--sp-2)">
            <button id="pf-follow" class="pf-follow ${following ? 'on' : ''}" style="flex:1" data-id="${profile._id}">${following ? 'Following ✓' : 'Follow'}</button>
            <button id="pf-message" class="btn-ghost" style="flex:1;border-radius:var(--r-md);font-size:var(--text-sm);font-weight:600">Message</button>
          </div>`}

      ${isMe ? `
      <div class="pf-tabs" role="tablist">
        <button class="pf-tab active" id="tab-posts" data-tab="posts">Posts (${userPosts.length})</button>
        <button class="pf-tab" id="tab-saved" data-tab="saved">Saved (${currentUser?.savedPosts?.length || 0})</button>
      </div>` : `<h3 class="feed-head">Posts</h3>`}

      <div id="pf-tab-content">
        ${renderGridHTML(userPosts)}
      </div>
    </section></main>
  </div>`;

  document.getElementById('pf-back')?.addEventListener('click', () => {
    if (typeof onGoBack === 'function') onGoBack();
  });

  // Re-wire theme toggle after full render
  const pfThemeBtn2 = document.getElementById('pf-theme-btn');
  const syncPfThemeIcon2 = () => {
    if (!pfThemeBtn2) return;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    pfThemeBtn2.innerHTML = isDark ? icons.sun : icons.moon;
  };
  syncPfThemeIcon2();
  pfThemeBtn2?.addEventListener('click', () => { toggleTheme(); syncPfThemeIcon2(); });

  const tabContent = container.querySelector('#pf-tab-content');
  const tabPosts = container.querySelector('#tab-posts');
  const tabSaved = container.querySelector('#tab-saved');

  tabPosts?.addEventListener('click', () => {
    tabPosts.classList.add('active');
    tabSaved?.classList.remove('active');
    if (tabContent) tabContent.innerHTML = renderGridHTML(userPosts);
  });

  tabSaved?.addEventListener('click', async () => {
    tabSaved.classList.add('active');
    tabPosts?.classList.remove('active');
    if (tabContent) tabContent.innerHTML = '<div class="people-loading">Loading saved posts…</div>';
    try {
      const data = await postApi.getSavedPosts();
      const savedPosts = data.savedPosts || [];
      if (tabContent) {
        if (!savedPosts.length) {
          tabContent.innerHTML = `<div class="empty"><span class="empty-icon">🔖</span><strong>No saved posts</strong><p>Bookmark photos and videos to see them again.</p></div>`;
        } else {
          tabContent.innerHTML = renderGridHTML(savedPosts);
        }
      }
    } catch (err) {
      if (tabContent) tabContent.innerHTML = `<div class="empty">⚠️ ${escapeHtml(err.message || 'Could not load saved posts')}</div>`;
    }
  });

  // Delegated click for post cells inside #pf-tab-content
  tabContent?.addEventListener('click', (e) => {
    const cell = e.target.closest('.pf-cell');
    if (cell && cell.dataset.id) {
      onNavigate?.('postDetail', { postId: cell.dataset.id });
    }
  });

  // Auto-open saved tab when navigated from sidebar "Saved" button
  if (_autoOpenSavedTab && tabSaved) {
    tabSaved.click();
  }

  const editBtn = document.getElementById('pf-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      onNavigate?.('onboarding', { step: 1 });
    });
  }

  const messageBtn = document.getElementById('pf-message');
  if (messageBtn) {
    messageBtn.addEventListener('click', async () => {
      messageBtn.disabled = true;
      try {
        const res = await messageApi.sendMessage({ receiverId: profile._id, text: '👋 Hi!' });
        const convId = res.message?.conversation?._id || res.message?.conversation;
        onNavigate?.('messages', { conversationId: convId });
      } catch {
        onNavigate?.('messages');
      } finally {
        messageBtn.disabled = false;
      }
    });
  }

  const followBtn = document.getElementById('pf-follow');
  if (followBtn) {
    followBtn.addEventListener('click', async () => {
      if (followBtn.disabled) return;
      followBtn.disabled = true;
      try {
        const data = await userApi.toggleFollow(followBtn.dataset.id);
        const nowFollowing = data.isFollowing ?? !following;
        followBtn.textContent = nowFollowing ? 'Following ✓' : 'Follow';
        followBtn.classList.toggle('on', nowFollowing);
        const fc = document.getElementById('pf-followers');
        if (fc) {
          fc.textContent = Math.max(0, parseInt(fc.textContent, 10) + (nowFollowing ? 1 : -1));
        }
      } catch (err) {
        followBtn.textContent = err.message || 'Failed';
      } finally {
        followBtn.disabled = false;
      }
    });
  }
}
