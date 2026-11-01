import { LOGO_IMG, features, icons, googleSvg, eyeSvg, eyeOffSvg } from '../constants.js';
import { authApi, userApi } from '../services/api.js';
import { saveSession } from '../state/session.js';

let authMode = 'signup'; // 'signup' | 'login' | 'forgot'

/**
 * Renders the Authentication view (Signup / Login / Forgot Password).
 */
export function renderAuth(container, { onAuthSuccess } = {}) {
  container.innerHTML = `
  <div class="page">
    <aside class="hero">
      <div class="hero-inner">
        <img src="${LOGO_IMG}" alt="VELOVE logo" class="hero-logo" />
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
          <img src="${LOGO_IMG}" alt="VELOVE logo" class="brand-logo" />
          <h1 class="brand-name">VELOVE</h1>
          <p class="brand-sub">Share Moments • Connect People • Explore Together</p>
        </div>

        <div class="tabs" role="tablist" id="auth-tabs">
          <button class="tab ${authMode === 'signup' ? 'active' : ''}" data-mode="signup" type="button">Sign Up</button>
          <button class="tab ${authMode === 'login' ? 'active' : ''}" data-mode="login" type="button">Log In</button>
        </div>

        <!-- SIGN UP FORM -->
        <form id="signup-form" class="form ${authMode !== 'signup' ? 'hidden' : ''}" novalidate>
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

          <button type="submit" class="btn-gradient" id="su-submit">Sign Up</button>

          <div class="divider"><span>OR</span></div>
          <button type="button" class="btn-google" id="google-btn">${googleSvg} Continue with Google</button>
          <p class="switch">Already have an account? <a href="#" data-switch="login">Log in</a></p>
        </form>

        <!-- LOGIN FORM -->
        <form id="login-form" class="form ${authMode !== 'login' ? 'hidden' : ''}" novalidate>
          <h2 class="form-title">Welcome Back</h2>
          <div class="field"><span class="field-icon">✉</span>
            <input id="li-id" type="text" placeholder="Email or Username" autocomplete="username" required /></div>
          <div class="field"><span class="field-icon">🔒</span>
            <input id="li-password" type="password" placeholder="Password" autocomplete="current-password" required />
            <button type="button" class="toggle-pw" data-target="li-password" aria-label="Show password">${eyeSvg}</button></div>
          <p class="forgot"><a href="#" id="forgot-link">Forgot password?</a></p>
          <button type="submit" class="btn-gradient" id="li-submit">Log In</button>
          <div class="divider"><span>OR</span></div>
          <button type="button" class="btn-google" id="google-btn-login">${googleSvg} Continue with Google</button>
          <p class="switch">Don't have an account? <a href="#" data-switch="signup">Sign up</a></p>
        </form>

        <!-- FORGOT PASSWORD FORM -->
        <form id="forgot-form" class="form ${authMode !== 'forgot' ? 'hidden' : ''}" novalidate>
          <button type="button" class="back-btn" id="forgot-back" aria-label="Back to login">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to Login
          </button>
          <h2 class="form-title">Reset Password</h2>
          <p class="form-desc">Enter your account email and we'll send you a link to reset your password.</p>
          <div class="field"><span class="field-icon">✉</span>
            <input id="fp-email" type="email" placeholder="Your account email" autocomplete="email" required /></div>
          <button type="submit" class="btn-gradient" id="fp-submit">Send Reset Link</button>
          <div id="fp-success" class="fp-success hidden">
            <div class="fp-success-icon">📬</div>
            <h3>Check your inbox!</h3>
            <p>We sent a password reset link to <strong id="fp-email-sent"></strong>. It expires in 10 minutes.</p>
            <button type="button" class="btn-ghost" id="fp-back-login">Back to Login</button>
          </div>
        </form>

        <p class="msg" id="msg"></p>
      </section>
    </main>
  </div>`;

  bindAuthEvents(container, onAuthSuccess);
}

function bindAuthEvents(container, onAuthSuccess) {
  const $ = (s) => container.querySelector(s);
  const msgEl = $('#msg');
  const showMsg = (t, ok = false) => {
    if (!msgEl) return;
    msgEl.textContent = t;
    msgEl.className = `msg ${ok ? 'ok' : 'err'}${t ? '' : ' hidden'}`;
  };

  const setMode = (m) => {
    authMode = m;
    // Hide/show tab bar — tabs are irrelevant during forgot-password flow
    const tabsEl = $('#auth-tabs');
    if (tabsEl) tabsEl.style.display = m === 'forgot' ? 'none' : '';
    container.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === authMode));
    $('#signup-form')?.classList.toggle('hidden', authMode !== 'signup');
    $('#login-form')?.classList.toggle('hidden', authMode !== 'login');
    $('#forgot-form')?.classList.toggle('hidden', authMode !== 'forgot');
    showMsg('');
    // Reset forgot form state when re-entering it
    if (m === 'forgot') {
      $('#fp-success')?.classList.add('hidden');
      $('#fp-email')?.closest('.field')?.classList.remove('hidden');
      $('#fp-submit')?.classList.remove('hidden');
      $('#fp-email') && ($('#fp-email').value = '');
    }
  };

  container.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => setMode(t.dataset.mode));
  });

  container.querySelectorAll('[data-switch]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(a.dataset.switch);
    });
  });

  // Forgot password link
  $('#forgot-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('forgot');
  });

  // Back from forgot
  $('#forgot-back')?.addEventListener('click', () => setMode('login'));
  $('#fp-back-login')?.addEventListener('click', () => setMode('login'));

  // Password visibility toggle
  container.querySelectorAll('.toggle-pw').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? eyeOffSvg : eyeSvg;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  const googleLogin = () => {
    showMsg('Google OAuth will be available soon. Please use username/password to sign in.');
  };
  $('#google-btn')?.addEventListener('click', googleLogin);
  $('#google-btn-login')?.addEventListener('click', googleLogin);

  // Live username availability (debounced)
  let unameTimer;
  $('#su-username')?.addEventListener('input', () => {
    clearTimeout(unameTimer);
    const v = $('#su-username').value.trim();
    const check = $('#username-check');
    if (v.length < 3) {
      check.textContent = '';
      return;
    }
    unameTimer = setTimeout(async () => {
      try {
        const data = await userApi.checkUsername(v);
        check.textContent = data.available ? '✓' : '✗';
        check.className = `field-check ${data.available ? 'ok' : 'bad'}`;
      } catch {
        check.textContent = '';
      }
    }, 350);
  });

  // Live confirm password feedback
  $('#su-confirm')?.addEventListener('input', () => {
    const confirm = $('#su-confirm').value;
    const password = $('#su-password').value;
    const hint = $('#confirm-hint');
    if (!confirm) {
      hint.textContent = '';
      return;
    }
    hint.textContent = confirm === password ? '✓ Passwords match' : 'Passwords do not match';
    hint.className = `hint ${confirm === password ? 'ok' : 'err'}`;
  });

  // SIGNUP
  $('#signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg('');
    const fullName = $('#su-name').value.trim();
    const username = $('#su-username').value.trim();
    const email = $('#su-email').value.trim();
    const password = $('#su-password').value;
    const confirm = $('#su-confirm').value;
    const submitBtn = $('#su-submit');

    if (!fullName || !username || !email || !password) return showMsg('Please fill in all fields.');
    if (password.length < 6) return showMsg('Password must be at least 6 characters.');
    if (password !== confirm) return showMsg('Passwords do not match.');
    if (!$('#su-agree').checked) return showMsg('Please agree to the Terms of Service.');

    if (submitBtn) submitBtn.disabled = true;
    try {
      const data = await authApi.register({ username, email, fullName, password });
      saveSession(data.user);
      if (typeof onAuthSuccess === 'function') {
        onAuthSuccess(data.user, true);
      }
    } catch (err) {
      showMsg(err.message || 'Signup failed.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // LOGIN
  $('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg('');
    const emailOrUsername = $('#li-id').value.trim();
    const password = $('#li-password').value;
    const submitBtn = $('#li-submit');

    if (!emailOrUsername || !password) return showMsg('Please enter your credentials.');

    if (submitBtn) submitBtn.disabled = true;
    try {
      const data = await authApi.login({ emailOrUsername, password });
      saveSession(data.user);
      if (typeof onAuthSuccess === 'function') {
        onAuthSuccess(data.user, false);
      }
    } catch (err) {
      showMsg(err.message || 'Login failed.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // FORGOT PASSWORD
  $('#forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg('');
    const email = $('#fp-email').value.trim();
    const submitBtn = $('#fp-submit');
    if (!email) return showMsg('Please enter your email address.');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }
    try {
      await authApi.forgotPassword(email);
      // Show success state inside form
      $('#fp-email')?.closest('.field')?.classList.add('hidden');
      if (submitBtn) submitBtn.classList.add('hidden');
      const emailSentEl = $('#fp-email-sent');
      if (emailSentEl) emailSentEl.textContent = email;
      $('#fp-success')?.classList.remove('hidden');
    } catch (err) {
      showMsg(err.message || 'Could not send reset email. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Link';
      }
    }
  });
}
