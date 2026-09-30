import './style.css'
import logo1 from './assets/logo1.png'

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SERVER_URL = 'http://localhost:3001'; // vlove Google-OAuth backend

/* ============================ tiny state/router ============================ */
// Screens: auth (signup/login tabs) → onboarding (profile → people → welcome) → home
let mode = 'signup';
let currentUser = null; // { _id, username, fullName, avatar, ... }

function saveSession(user) { currentUser = user; sessionStorage.setItem('velove_user', JSON.stringify(user)); }
function loadSession() {
  try { currentUser = JSON.parse(sessionStorage.getItem('velove_user')); } catch { currentUser = null; }
  return currentUser;
}
function clearSession() { currentUser = null; sessionStorage.removeItem('velove_user'); }

// Legacy posts stored absolute Windows paths or absolute backend URLs as
// mediaUrl; map both to /uploads so they resolve same-origin through the Vite
// proxy (helmet CORP blocks cross-origin image renders), or null when
// unrecoverable. Cloudinary https URLs pass through untouched.
function mediaSrc(url) {
  if (!url) return null;
  const abs = url.match(/^https?:\/\/[^/]+\/uploads\/([^/?#]+)$/i);
  if (abs) return `/uploads/${abs[1]}`;
  if (/^[a-zA-Z]:\\/.test(url)) {
    const m = url.match(/uploads[/\\]([^/\\]+)$/);
    return m ? `/uploads/${encodeURIComponent(m[1])}` : null;
  }
  return url;
}

/* ================================= markup ================================= */
const googleSvg = `
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
    <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9.001c0 1.452.348 2.827.957 4.041l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
  </svg>`;

const eyeSvg = `<svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeOffSvg = `<svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.5 10.5 0 0 1 12 19.5C5 19.5 1 12 1 12a19 19 0 0 1 5.06-5.94M9.9 4.24A9.5 9.5 0 0 1 12 4.5c7 0 11 7.5 11 7.5a19 19 0 0 1-2.16 3.19"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

const icons = {
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`,
};

const features = [
  { icon: 'users', title: 'Connect', text: 'with friends worldwide' },
  { icon: 'image', title: 'Share', text: 'your moments' },
  { icon: 'heart', title: 'Discover', text: 'amazing stories' },
];

function stepperHTML(step) {
  // step: 1=Profile Setup 2=Find People 3=Get Started
  const items = ['Profile Setup', 'Find People', 'Get Started'];
  return `<div class="stepper">
    ${items.map((label, i) => {
      const n = i + 1;
      const state = n < step ? 'done' : n === step ? 'active' : 'todo';
      const inner = state === 'done' ? '✓' : n;
      return `
      <div class="step ${state}">
        <div class="step-bubble">${inner}</div>
        <div class="step-label">${label}</div>
      </div>
      ${n < items.length ? `<div class="step-line ${n < step ? 'filled' : ''}"></div>` : ''}`;
    }).join('')}
  </div>`;
}

const peopleRow = (u) => `
  <div class="person" data-id="${u._id}">
    <img class="avatar" src="${u.avatar}" alt="" onerror="this.src='${logo1}'" />
    <div class="person-info">
      <strong>${u.fullName}</strong>
      <span>@${u.username}</span>
      <small>${u.followersCount != null ? 'Followed by ' + u.followersCount + ' people' : ''}</small>
    </div>
    <button class="follow-btn ${u.isFollowing ? 'following' : ''}" data-id="${u._id}" data-username="${u.username}">
      ${u.isFollowing ? 'Following' : 'Follow'}
    </button>
  </div>`;

const app = document.querySelector('#app');

/* ================================ screen: auth ============================ */
function renderAuth() {
  app.innerHTML = `
  <div class="page">
    <aside class="hero">
      <div class="hero-inner">
        <img src="${logo1}" alt="VELOVE logo" class="hero-logo" />
        <p class="hero-tagline">Connecting hearts, creating stories.</p>
        <ul class="features">
          ${features.map((f) => `
            <li class="feature">
              <span class="feature-icon">${icons[f.icon]}</span>
              <span><strong>${f.title}</strong><small>${f.text}</small></span>
            </li>`).join('')}
        </ul>
      </div>
    </aside>

    <main class="auth-wrap">
      <section class="card">
        <div class="brand">
          <img src="${logo1}" alt="VELOVE logo" class="brand-logo" />
          <h1 class="brand-name">VELOVE</h1>
          <p class="brand-sub">Share Moments • Connect People • Explore Together</p>
        </div>

        <div class="tabs" role="tablist">
          <button class="tab" data-mode="signup" type="button">Sign Up</button>
          <button class="tab" data-mode="login" type="button">Log In</button>
        </div>

        <form id="signup-form" class="form ${mode !== 'signup' ? 'hidden' : ''}" novalidate>
          <h2 class="form-title">Create Your Account</h2>

          <div class="field"><span class="field-icon">${icons.users}</span>
            <input id="su-name" type="text" placeholder="Full Name" autocomplete="name" required /></div>

          <div class="field"><span class="field-icon">@</span>
            <input id="su-username" type="text" placeholder="Username" autocomplete="username" required />
            <span class="field-check" id="username-check"></span></div>

          <div class="field"><span class="field-icon">✉</span>
            <input id="su-email" type="email" placeholder="Email" autocomplete="email" required /></div>

          <div class="field"><span class="field-icon">🔒</span>
            <input id="su-password" type="password" placeholder="Password" autocomplete="new-password" required />
            <button type="button" class="toggle-pw" data-target="su-password" aria-label="Show password">${eyeSvg}</button></div>

          <div class="field"><span class="field-icon">🔒</span>
            <input id="su-confirm" type="password" placeholder="Confirm Password" autocomplete="new-password" required />
            <button type="button" class="toggle-pw" data-target="su-confirm" aria-label="Show password">${eyeSvg}</button></div>
          <p class="hint" id="confirm-hint"></p>

          <label class="agree">
            <input type="checkbox" id="su-agree" />
            <span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></span>
          </label>

          <button type="submit" class="btn-gradient">Sign Up</button>

          <div class="divider"><span>OR</span></div>
          <button type="button" class="btn-google" id="google-btn">${googleSvg} Continue with Google</button>
          <p class="switch">Already have an account? <a href="#" data-switch="login">Log in</a></p>
        </form>

        <form id="login-form" class="form ${mode !== 'login' ? 'hidden' : ''}" novalidate>
          <h2 class="form-title">Welcome Back</h2>
          <div class="field"><span class="field-icon">✉</span>
            <input id="li-id" type="text" placeholder="Email or Username" autocomplete="username" required /></div>
          <div class="field"><span class="field-icon">🔒</span>
            <input id="li-password" type="password" placeholder="Password" autocomplete="current-password" required />
            <button type="button" class="toggle-pw" data-target="li-password" aria-label="Show password">${eyeSvg}</button></div>
          <p class="forgot"><a href="#">Forgot password?</a></p>
          <button type="submit" class="btn-gradient">Log In</button>
          <div class="divider"><span>OR</span></div>
          <button type="button" class="btn-google" id="google-btn-login">${googleSvg} Continue with Google</button>
          <p class="switch">Don't have an account? <a href="#" data-switch="signup">Sign up</a></p>
        </form>

        <p class="msg" id="msg"></p>
      </section>
    </main>
  </div>`;
  bindAuth();
}

/* ============================= screen: onboarding ========================= */
function renderOnboarding(step) {
  if (step === 1) {
    app.innerHTML = `
    <div class="page onb-page">
      <main class="auth-wrap"><section class="card onb-card">
        ${stepperHTML(1)}
        <h2 class="onb-title">Complete Your Profile</h2>
        <p class="onb-sub">Make your profile yours ✨</p>

        <div class="avatar-ring">
          <img id="ob-avatar-img" class="ob-avatar" src="${logo1}" alt="avatar" />
          <label class="change-photo" for="ob-avatar">
            ${icons.camera} <span>Change Photo</span>
            <input id="ob-avatar" type="file" accept="image/*" hidden />
          </label>
        </div>

        <label class="ob-label" for="ob-name">Full Name</label>
        <input id="ob-name" class="ob-input" type="text" value="${currentUser?.fullName || ''}" />

        <label class="ob-label" for="ob-username">Username</label>
        <div class="ob-user-wrap">
          <input id="ob-username" class="ob-input" type="text" value="${currentUser?.username || ''}" />
          <span class="ob-avail" id="ob-avail"></span>
        </div>

        <label class="ob-label" for="ob-bio">Bio</label>
        <textarea id="ob-bio" class="ob-textarea" maxlength="150" rows="3" placeholder="Tell your story…"></textarea>
        <div class="char-count"><span id="ob-bio-count">0</span>/150</div>

        <p class="msg" id="ob-msg"></p>
        <button id="ob-continue" class="btn-gradient btn-wide">Continue →</button>
      </section></main>
    </div>`;
    bindProfileStep();
  }

  if (step === 2) {
    app.innerHTML = `
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
    bindPeopleStep();
  }

  if (step === 3) {
    app.innerHTML = `
    <div class="page onb-page">
      <main class="auth-wrap"><section class="card onb-card welcome-card">
        ${stepperHTML(3)}
        <div class="welcome-blob">
          <img class="welcome-avatar" src="${currentUser?.avatar || logo1}" alt="avatar" onerror="this.src='${logo1}'" />
          <span class="w-deco w-heart">${icons.heart}</span>
          <span class="w-deco w-cam">${icons.camera}</span>
          <span class="w-verified">✓</span>
        </div>
        <h2 class="onb-title">You're All Set! 🎉</h2>
        <p class="onb-sub">Welcome to VELOVE, <strong>${currentUser?.fullName || currentUser?.username}</strong>!</p>
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
    document.getElementById('go-feed').onclick = () => renderHome();
    document.getElementById('go-people').onclick = () => renderOnboarding(2);
    document.getElementById('go-post').onclick = () => renderHome(true);
    document.getElementById('ob-continue').onclick = () => renderHome();
  }
}

/* ================================ screen: home ============================ */
async function renderHome(openComposer = false) {
  app.innerHTML = `
  <div class="page onb-page">
    <main class="auth-wrap"><section class="card home-card">
      <div class="home-top">
        <img src="${logo1}" class="home-logo" alt="VELOVE" />
        <h2 class="home-title">Home</h2>
        <img class="avatar home-me" src="${currentUser?.avatar || logo1}" alt="me" onerror="this.src='${logo1}'" />
      </div>

      ${openComposer ? `
      <div class="composer">
        <textarea id="post-caption" class="ob-textarea" rows="2" placeholder="Share your first moment…"></textarea>
        <div class="composer-row">
          <label class="change-photo small" for="post-file">${icons.camera} <span>Photo</span>
            <input id="post-file" type="file" accept="image/*,video/*" hidden /></label>
          <button id="post-submit" class="btn-gradient btn-small">Post</button>
        </div>
        <p class="msg" id="post-msg"></p>
      </div>` : ''}

      <h3 class="feed-head">Explore Feed</h3>
      <div id="feed"><div class="people-loading">Loading feed…</div></div>
      <button id="logout" class="link-btn">Log out</button>
    </section></main>
  </div>`;

  document.getElementById('logout').onclick = async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    clearSession();
    mode = 'signup';
    renderAuth();
  };

  // READ: feed
  try {
    const res = await fetch(`${API_URL}/posts/feed`, { credentials: 'include' });
    const data = await res.json();
    const feed = document.getElementById('feed');
    if (data.posts?.length) {
      feed.innerHTML = data.posts.map((p) => {
        const src = mediaSrc(p.mediaUrl);
        return `
        <div class="feed-post">
          <div class="feed-head-row">
            <img class="avatar" src="${p.user?.avatar || logo1}" onerror="this.src='${logo1}'" />
            <strong>${p.user?.username || 'unknown'}</strong>
          </div>
          ${src ? (p.mediaType === 'video'
            ? `<video class="feed-media" src="${src}" controls></video>`
            : `<img class="feed-media" src="${src}" onerror="this.style.display='none'" />`)
          : ''}
          <div class="feed-caption"><strong>${p.user?.username}</strong> ${p.caption || ''}</div>
        </div>`;
      }).join('');
    } else {
      feed.innerHTML = `<div class="empty">No posts yet — follow people or create the first post!</div>`;
    }
  } catch {
    document.getElementById('feed').innerHTML = `<div class="empty">Couldn't load feed.</div>`;
  }

  if (openComposer) {
    const fileInput = document.getElementById('post-file');
    document.getElementById('post-submit').onclick = async () => {
      const msg = document.getElementById('post-msg');
      const caption = document.getElementById('post-caption').value.trim();
      if (!fileInput.files[0]) { msg.textContent = 'Choose a photo first.'; msg.className = 'msg err'; return; }
      const fd = new FormData();
      fd.append('media', fileInput.files[0]);
      fd.append('caption', caption);
      const res = await fetch(`${API_URL}/posts`, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (res.ok && data.success) { msg.textContent = 'Posted! ✓'; msg.className = 'msg ok'; setTimeout(() => renderHome(), 700); }
      else { msg.textContent = data.message || 'Post failed'; msg.className = 'msg err'; }
    };
  }
}

/* ============================== auth bindings ============================= */
function bindAuth() {
  const $ = (s) => document.querySelector(s);
  const msgEl = $('#msg');
  const showMsg = (t, ok = false) => { msgEl.textContent = t; msgEl.className = `msg ${ok ? 'ok' : 'err'}${t ? '' : ' hidden'}`; };

  const setMode = (m) => {
    mode = m;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    $('#signup-form').classList.toggle('hidden', mode !== 'signup');
    $('#login-form').classList.toggle('hidden', mode !== 'login');
    showMsg('');
  };
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  document.querySelectorAll('[data-switch]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setMode(a.dataset.switch); }));

  document.querySelectorAll('.toggle-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? eyeOffSvg : eyeSvg;
    });
  });

  const googleLogin = () => { showMsg('Redirecting to Google…'); window.location.href = `${SERVER_URL}/auth/google`; };
  $('#google-btn').addEventListener('click', googleLogin);
  $('#google-btn-login').addEventListener('click', googleLogin);

  /* live username availability (debounced) */
  let unameTimer;
  $('#su-username').addEventListener('input', () => {
    clearTimeout(unameTimer);
    const v = $('#su-username').value.trim();
    const check = $('#username-check');
    if (v.length < 3) { check.textContent = ''; return; }
    unameTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/user/username-available?username=${encodeURIComponent(v)}`);
        const data = await res.json();
        check.textContent = data.available ? '✓' : '✗';
        check.className = `field-check ${data.available ? 'ok' : 'bad'}`;
      } catch { check.textContent = ''; }
    }, 350);
  });

  /* live confirm-password feedback */
  $('#su-confirm').addEventListener('input', () => {
    const confirm = $('#su-confirm').value, password = $('#su-password').value, hint = $('#confirm-hint');
    if (!confirm) { hint.textContent = ''; return; }
    hint.textContent = confirm === password ? '✓ Passwords match' : 'Passwords do not match';
    hint.className = `hint ${confirm === password ? 'ok' : 'err'}`;
  });

  /* SIGNUP → onboarding step 1 */
  $('#signup-form').addEventListener('submit', async (e) => {
    e.preventDefault(); showMsg('');
    const fullName = $('#su-name').value.trim();
    const username = $('#su-username').value.trim();
    const email = $('#su-email').value.trim();
    const password = $('#su-password').value;
    const confirm = $('#su-confirm').value;

    if (!fullName || !username || !email || !password) return showMsg('Please fill in all fields.');
    if (password.length < 6) return showMsg('Password must be at least 6 characters.');
    if (password !== confirm) return showMsg('Passwords do not match.');
    if (!$('#su-agree').checked) return showMsg('Please agree to the Terms of Service.');

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ username, email, fullName, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        saveSession(data.user);
        renderOnboarding(1);
      } else showMsg(data.errors?.[0]?.message || data.message || 'Signup failed.');
    } catch { showMsg('Network error — is the backend running on port 5000?'); }
  });

  /* LOGIN → onboarding step 1 (light confirmation) */
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); showMsg('');
    const emailOrUsername = $('#li-id').value.trim();
    const password = $('#li-password').value;
    if (!emailOrUsername || !password) return showMsg('Please enter your credentials.');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ emailOrUsername, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        saveSession(data.user);
        renderOnboarding(1); // continue the sequence: profile → people → welcome
      } else showMsg(data.errors?.[0]?.message || data.message || 'Login failed.');
    } catch { showMsg('Network error — is the backend running on port 5000?'); }
  });
}

/* =========================== onboarding bindings ========================== */
function bindProfileStep() {
  const $ = (s) => document.querySelector(s);

  $('#ob-avatar').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) $('#ob-avatar-img').src = URL.createObjectURL(f);
  });

  $('#ob-bio').addEventListener('input', () => { $('#ob-bio-count').textContent = $('#ob-bio').value.length; });

  let availTimer;
  $('#ob-username').addEventListener('input', () => {
    clearTimeout(availTimer);
    availTimer = setTimeout(async () => {
      const v = $('#ob-username').value.trim();
      const el = $('#ob-avail');
      if (!v) { el.textContent = ''; return; }
      try {
        const res = await fetch(`${API_URL}/user/username-available?username=${encodeURIComponent(v)}`);
        const data = await res.json();
        const isOwn = currentUser && v === currentUser.username;
        el.textContent = (data.available || isOwn) ? 'Available ✓' : 'Taken ✗';
        el.className = `ob-avail ${(data.available || isOwn) ? 'ok' : 'bad'}`;
      } catch { el.textContent = ''; }
    }, 350);
  });

  $('#ob-continue').addEventListener('click', async () => {
    const msg = $('#ob-msg');
    const fullName = $('#ob-name').value.trim();
    const username = $('#ob-username').value.trim();
    const bio = $('#ob-bio').value.trim();
    const file = $('#ob-avatar').files[0];
    if (!fullName || !username) { msg.textContent = 'Name and username are required.'; msg.className = 'msg err'; return; }

    // UPDATE profile (multipart when a photo was chosen)
    let res;
    if (file) {
      const fd = new FormData();
      fd.append('fullName', fullName); fd.append('username', username); fd.append('bio', bio);
      fd.append('avatar', file);
      res = await fetch(`${API_URL}/user/profile`, { method: 'PUT', credentials: 'include', body: fd });
    } else {
      res = await fetch(`${API_URL}/user/profile`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, username, bio }),
      });
    }
    const data = await res.json();
    if (res.ok && data.success) {
      saveSession({ ...currentUser, ...data.user });
      renderOnboarding(2);
    } else {
      msg.textContent = data.message || 'Update failed.';
      msg.className = 'msg err';
    }
  });
}

function bindPeopleStep() {
  const $ = (s) => document.querySelector(s);

  async function loadPeople(query = '') {
    const list = $('#people-list');
    try {
      const url = query
        ? `${API_URL}/user/search?query=${encodeURIComponent(query)}`
        : `${API_URL}/user/suggested`;
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      const people = query ? (data.users || []) : (data.suggestions || []);
      if (!people.length) { list.innerHTML = `<div class="empty">No people found${query ? ' for “' + query + '”' : ''}.</div>`; return; }
      list.innerHTML = people.map(peopleRow).join('');
      list.querySelectorAll('.follow-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const following = btn.classList.toggle('following');
          btn.textContent = following ? 'Following' : 'Follow';
          await fetch(`${API_URL}/user/follow/${btn.dataset.id}`, { method: 'POST', credentials: 'include' });
        });
      });
    } catch {
      list.innerHTML = `<div class="empty">Couldn't load people.</div>`;
    }
  }
  loadPeople();

  let timer;
  $('#people-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadPeople(e.target.value.trim()), 350);
  });
  $('#refresh-people').addEventListener('click', () => loadPeople());

  $('#ob-continue').addEventListener('click', () => renderOnboarding(3));
  $('#skip-people').addEventListener('click', () => renderOnboarding(3));
}

/* ================================== boot ================================== */
const existing = loadSession();
if (existing && existing.username) renderOnboarding(1);
else renderAuth();
