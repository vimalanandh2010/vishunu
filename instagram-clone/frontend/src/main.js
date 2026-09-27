import './style.css'
import logo1 from './assets/logo1.png'

const API_URL = import.meta.env.VITE_API_URL || '/api';

/* ---------------------------------- state --------------------------------- */
let mode = 'signup'; // 'signup' | 'login'

/* --------------------------------- markup --------------------------------- */
const googleSvg = `
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
    <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9.001c0 1.452.348 2.827.957 4.041l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
  </svg>`;

const eyeSvg = `
  <svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;

const eyeOffSvg = `
  <svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19.5C5 19.5 1 12 1 12a19 19 0 0 1 5.06-5.94M9.9 4.24A9.5 9.5 0 0 1 12 4.5c7 0 11 7.5 11 7.5a19 19 0 0 1-2.16 3.19"/>
    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;

const features = [
  { icon: 'users', title: 'Connect', text: 'with friends worldwide' },
  { icon: 'image', title: 'Share', text: 'your moments' },
  { icon: 'heart', title: 'Discover', text: 'amazing stories' },
];

const featureIcons = {
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
};

document.querySelector('#app').innerHTML = `
  <div class="page">
    <!-- left hero panel -->
    <aside class="hero">
      <div class="hero-inner">
        <img src="${logo1}" alt="VELOVE logo" class="hero-logo" />
        <p class="hero-tagline">Connecting hearts, creating stories.</p>
        <ul class="features">
          ${features
            .map(
              (f) => `
            <li class="feature">
              <span class="feature-icon">${featureIcons[f.icon]}</span>
              <span><strong>${f.title}</strong><small>${f.text}</small></span>
            </li>`
            )
            .join('')}
        </ul>
      </div>
    </aside>

    <!-- right auth card -->
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

        <!-- SIGNUP -->
        <form id="signup-form" class="form" novalidate>
          <h2 class="form-title">Create Your Account</h2>

          <div class="field">
            <span class="field-icon">${featureIcons.users}</span>
            <input id="su-name" type="text" placeholder="Full Name" autocomplete="name" required />
          </div>

          <div class="field">
            <span class="field-icon">@</span>
            <input id="su-username" type="text" placeholder="Username" autocomplete="username" required />
          </div>

          <div class="field">
            <span class="field-icon">&#9993;</span>
            <input id="su-email" type="email" placeholder="Email" autocomplete="email" required />
          </div>

          <div class="field">
            <span class="field-icon">&#128274;</span>
            <input id="su-password" type="password" placeholder="Password" autocomplete="new-password" required />
            <button type="button" class="toggle-pw" data-target="su-password" aria-label="Show password">${eyeSvg}</button>
          </div>

          <div class="field">
            <span class="field-icon">&#128274;</span>
            <input id="su-confirm" type="password" placeholder="Confirm Password" autocomplete="new-password" required />
            <button type="button" class="toggle-pw" data-target="su-confirm" aria-label="Show password">${eyeSvg}</button>
          </div>
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

        <!-- LOGIN -->
        <form id="login-form" class="form hidden" novalidate>
          <h2 class="form-title">Welcome Back</h2>

          <div class="field">
            <span class="field-icon">&#9993;</span>
            <input id="li-id" type="text" placeholder="Email or Username" autocomplete="username" required />
          </div>

          <div class="field">
            <span class="field-icon">&#128274;</span>
            <input id="li-password" type="password" placeholder="Password" autocomplete="current-password" required />
            <button type="button" class="toggle-pw" data-target="li-password" aria-label="Show password">${eyeSvg}</button>
          </div>

          <p class="forgot"><a href="#">Forgot password?</a></p>

          <button type="submit" class="btn-gradient">Log In</button>

          <div class="divider"><span>OR</span></div>

          <button type="button" class="btn-google" id="google-btn-login">${googleSvg} Continue with Google</button>

          <p class="switch">Don't have an account? <a href="#" data-switch="signup">Sign up</a></p>
        </form>

        <p class="msg" id="msg"></p>
      </section>
    </main>
  </div>
`;

/* --------------------------------- helpers -------------------------------- */
const $ = (sel) => document.querySelector(sel);
const msgEl = $('#msg');

function showMsg(text, ok = false) {
  msgEl.textContent = text;
  msgEl.className = `msg ${ok ? 'ok' : 'err'}${text ? '' : ' hidden'}`;
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.mode === mode)
  );
  $('#signup-form').classList.toggle('hidden', mode !== 'signup');
  $('#login-form').classList.toggle('hidden', mode !== 'login');
  showMsg('');
}

/* password show/hide */
document.querySelectorAll('.toggle-pw').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? eyeOffSvg : eyeSvg;
  });
});

/* tab + link switching */
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => setMode(t.dataset.mode))
);
document.querySelectorAll('[data-switch]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    setMode(a.dataset.switch);
  })
);

/* google oauth (vlove backend, port 3001) */
function googleLogin() {
  showMsg('Redirecting to Google…');
  window.location.href = 'http://localhost:3001/auth/google';
}
$('#google-btn').addEventListener('click', googleLogin);
$('#google-btn-login').addEventListener('click', googleLogin);

/* --------------------------------- signup --------------------------------- */
$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('');

  const fullName = $('#su-name').value.trim();
  const username = $('#su-username').value.trim();
  const email = $('#su-email').value.trim();
  const password = $('#su-password').value;
  const confirm = $('#su-confirm').value;
  const hint = $('#confirm-hint');

  if (!fullName || !username || !email || !password) return showMsg('Please fill in all fields.');
  if (password.length < 6) return showMsg('Password must be at least 6 characters.');
  if (password !== confirm) {
    hint.textContent = 'Passwords do not match';
    hint.classList.add('err');
    $('#su-confirm').classList.add('invalid');
    return showMsg('Passwords do not match.');
  }
  hint.textContent = '';
  $('#su-confirm').classList.remove('invalid');

  if (!$('#su-agree').checked) return showMsg('Please agree to the Terms of Service.');

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, fullName, password }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showMsg('Account created! Welcome to VELOVE 🎉', true);
      setTimeout(() => setMode('login'), 1200);
    } else {
      const first = data.errors?.[0]?.message || data.message || 'Signup failed.';
      showMsg(first);
    }
  } catch {
    showMsg('Network error — is the backend running on port 5000?');
  }
});

/* ---------------------------------- login --------------------------------- */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('');

  const emailOrUsername = $('#li-id').value.trim();
  const password = $('#li-password').value;
  if (!emailOrUsername || !password) return showMsg('Please enter your credentials.');

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ emailOrUsername, password }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showMsg(`Welcome back, ${data.user?.username || 'friend'}!`, true);
    } else {
      const first = data.errors?.[0]?.message || data.message || 'Login failed.';
      showMsg(first);
    }
  } catch {
    showMsg('Network error — is the backend running on port 5000?');
  }
});

/* live confirm-password feedback */
$('#su-confirm').addEventListener('input', () => {
  const confirm = $('#su-confirm').value;
  const password = $('#su-password').value;
  const hint = $('#confirm-hint');
  if (!confirm) { hint.textContent = ''; return; }
  hint.textContent = confirm === password ? '✓ Passwords match' : 'Passwords do not match';
  hint.classList.toggle('ok', confirm === password);
  hint.classList.toggle('err', confirm !== password);
});
