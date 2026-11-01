import { LOGO_IMG, icons } from '../constants.js';
import { userApi } from '../services/api.js';
import { getSessionUser, updateSessionUser } from '../state/session.js';
import { stepperHTML, peopleRow, escapeHtml } from '../utils/dom.js';

/**
 * Renders onboarding steps (1: Profile Setup, 2: Find People, 3: Welcome).
 */
export function renderOnboarding(container, step = 1, { onFinish, onNavigate } = {}) {
  const currentUser = getSessionUser();

  if (step === 1) {
    container.innerHTML = `
    <div class="page onb-page">
      <main class="auth-wrap"><section class="card onb-card">
        ${stepperHTML(1)}
        <h2 class="onb-title">Complete Your Profile</h2>
        <p class="onb-sub">Make your profile yours ✨</p>

        <div class="avatar-ring">
          <img id="ob-avatar-img" class="ob-avatar" src="${currentUser?.avatar || LOGO_IMG}" alt="avatar" />
          <label class="change-photo" for="ob-avatar">
            ${icons.camera} <span>Change Photo</span>
            <input id="ob-avatar" type="file" accept="image/*" hidden />
          </label>
        </div>

        <label class="ob-label" for="ob-name">Full Name</label>
        <input id="ob-name" class="ob-input" type="text" value="${escapeHtml(currentUser?.fullName || '')}" />

        <label class="ob-label" for="ob-username">Username</label>
        <div class="ob-user-wrap">
          <input id="ob-username" class="ob-input" type="text" value="${escapeHtml(currentUser?.username || '')}" />
          <span class="ob-avail" id="ob-avail"></span>
        </div>

        <label class="ob-label" for="ob-bio">Bio</label>
        <textarea id="ob-bio" class="ob-textarea" maxlength="150" rows="3" placeholder="Tell your story…">${escapeHtml(currentUser?.bio || '')}</textarea>
        <div class="char-count"><span id="ob-bio-count">${(currentUser?.bio || '').length}</span>/150</div>

        <p class="msg" id="ob-msg"></p>
        <button id="ob-continue" class="btn-gradient btn-wide">Continue →</button>
      </section></main>
    </div>`;

    bindStep1(container, { onNavigate });
  } else if (step === 2) {
    container.innerHTML = `
    <div class="page onb-page">
      <main class="auth-wrap"><section class="card onb-card">
        ${stepperHTML(2)}
        <h2 class="onb-title">Find People to Follow</h2>
        <p class="onb-sub">Follow people and build your VELOVE feed</p>

        <div class="search-box">
          <span class="search-ic">${icons.search}</span>
          <input id="people-search" type="text" placeholder="Search people, username..." />
        </div>

        <div class="people-tabs">
          <button class="ptab active" data-tab="suggested">Suggested</button>
          <span class="see-all" id="refresh-people">See All</span>
        </div>

        <div class="people-list" id="people-list">
          <div class="people-loading">Loading people…</div>
        </div>

        <button id="ob-continue" class="btn-gradient btn-wide">Continue →</button>
        <p class="skip" id="skip-people">Skip for now</p>
      </section></main>
    </div>`;

    bindStep2(container, { onNavigate });
  } else if (step === 3) {
    container.innerHTML = `
    <div class="page onb-page">
      <main class="auth-wrap"><section class="card onb-card welcome-card">
        ${stepperHTML(3)}
        <div class="welcome-blob">
          <img class="welcome-avatar" src="${currentUser?.avatar || LOGO_IMG}" alt="avatar" onerror="this.src='${LOGO_IMG}'" />
          <span class="w-deco w-heart">${icons.heart}</span>
          <span class="w-deco w-cam">${icons.camera}</span>
          <span class="w-verified">✓</span>
        </div>
        <h2 class="onb-title">You're All Set! 🎉</h2>
        <p class="onb-sub">Welcome to VELOVE, <strong>${escapeHtml(currentUser?.fullName || currentUser?.username || 'Friend')}</strong>!</p>
        <p class="welcome-copy">Start exploring, sharing and connecting with amazing people.</p>

        <div class="welcome-actions">
          <button class="w-action" id="go-feed">
            <span class="w-ic pink">${icons.home}</span>
            <span class="w-txt"><strong>Explore Feed</strong><small>See posts from people you follow</small></span>
            <span class="w-chev">${icons.chevron}</span>
          </button>
          <button class="w-action" id="go-people">
            <span class="w-ic violet">${icons.users}</span>
            <span class="w-txt"><strong>Find More People</strong><small>Discover interesting creators</small></span>
            <span class="w-chev">${icons.chevron}</span>
          </button>
          <button class="w-action" id="go-post">
            <span class="w-ic orange">${icons.plus}</span>
            <span class="w-txt"><strong>Create Your First Post</strong><small>Share your first moment</small></span>
            <span class="w-chev">${icons.chevron}</span>
          </button>
        </div>

        <button id="ob-continue" class="btn-gradient btn-wide">Go to Home →</button>
      </section></main>
    </div>`;

    document.getElementById('go-feed')?.addEventListener('click', () => onFinish?.());
    document.getElementById('go-people')?.addEventListener('click', () => onNavigate?.(2));
    document.getElementById('go-post')?.addEventListener('click', () => onFinish?.(true));
    document.getElementById('ob-continue')?.addEventListener('click', () => onFinish?.());
  }
}

function bindStep1(container, { onNavigate }) {
  const $ = (s) => container.querySelector(s);
  const currentUser = getSessionUser();

  $('#ob-avatar')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) $('#ob-avatar-img').src = URL.createObjectURL(f);
  });

  $('#ob-bio')?.addEventListener('input', () => {
    const countEl = $('#ob-bio-count');
    if (countEl) countEl.textContent = $('#ob-bio').value.length;
  });

  let availTimer;
  $('#ob-username')?.addEventListener('input', () => {
    clearTimeout(availTimer);
    availTimer = setTimeout(async () => {
      const v = $('#ob-username').value.trim();
      const el = $('#ob-avail');
      if (!el) return;
      if (!v) {
        el.textContent = '';
        return;
      }
      try {
        const data = await userApi.checkUsername(v);
        const isOwn = currentUser && v === currentUser.username;
        el.textContent = (data.available || isOwn) ? 'Available ✓' : 'Taken ✗';
        el.className = `ob-avail ${(data.available || isOwn) ? 'ok' : 'bad'}`;
      } catch {
        el.textContent = '';
      }
    }, 350);
  });

  $('#ob-continue')?.addEventListener('click', async () => {
    const msg = $('#ob-msg');
    const fullName = $('#ob-name').value.trim();
    const username = $('#ob-username').value.trim();
    const bio = $('#ob-bio').value.trim();
    const file = $('#ob-avatar').files[0];
    const continueBtn = $('#ob-continue');

    if (!fullName || !username) {
      msg.textContent = 'Name and username are required.';
      msg.className = 'msg err';
      return;
    }

    if (continueBtn) continueBtn.disabled = true;

    try {
      let data;
      if (file) {
        const fd = new FormData();
        fd.append('fullName', fullName);
        fd.append('username', username);
        fd.append('bio', bio);
        fd.append('avatar', file);
        data = await userApi.updateProfile(fd);
      } else {
        data = await userApi.updateProfile({ fullName, username, bio });
      }

      if (data.user) {
        updateSessionUser(data.user);
      }
      onNavigate?.(2);
    } catch (err) {
      msg.textContent = err.message || 'Update failed.';
      msg.className = 'msg err';
    } finally {
      if (continueBtn) continueBtn.disabled = false;
    }
  });
}

function bindStep2(container, { onNavigate }) {
  const $ = (s) => container.querySelector(s);
  const list = $('#people-list');

  async function loadPeople(query = '') {
    if (!list) return;
    try {
      const data = query ? await userApi.search(query) : await userApi.getSuggested();
      const people = query ? (data.users || []) : (data.suggestions || []);
      if (!people.length) {
        list.innerHTML = `<div class="empty">No people found${query ? ' for “' + escapeHtml(query) + '”' : ''}.</div>`;
        return;
      }
      list.innerHTML = people.map(peopleRow).join('');
    } catch {
      list.innerHTML = `<div class="empty">Couldn't load people.</div>`;
    }
  }

  // Event delegation on list for follow buttons
  list?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.follow-btn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const userId = btn.dataset.id;
    const wasFollowing = btn.classList.contains('following');
    btn.classList.toggle('following', !wasFollowing);
    btn.textContent = !wasFollowing ? 'Following' : 'Follow';

    try {
      const data = await userApi.toggleFollow(userId);
      const isNowFollowing = data.isFollowing ?? !wasFollowing;
      btn.classList.toggle('following', isNowFollowing);
      btn.textContent = isNowFollowing ? 'Following' : 'Follow';
    } catch {
      // Revert on failure
      btn.classList.toggle('following', wasFollowing);
      btn.textContent = wasFollowing ? 'Following' : 'Follow';
    } finally {
      btn.disabled = false;
    }
  });

  loadPeople();

  let timer;
  $('#people-search')?.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadPeople(e.target.value.trim()), 350);
  });

  $('#refresh-people')?.addEventListener('click', () => loadPeople());
  $('#ob-continue')?.addEventListener('click', () => onNavigate?.(3));
  $('#skip-people')?.addEventListener('click', () => onNavigate?.(3));
}
