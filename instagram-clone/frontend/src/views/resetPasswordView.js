import { LOGO_IMG } from '../constants.js';
import { authApi } from '../services/api.js';
import { eyeSvg, eyeOffSvg } from '../constants.js';

/**
 * Renders the Reset Password view — accessed via email deep-link token.
 * Shows a password form; on success shows a confirmation then redirects.
 *
 * @param {HTMLElement} container
 * @param {string} token - The raw reset token from the URL
 * @param {{ onSuccess: Function }} options
 */
export function renderResetPassword(container, token, { onSuccess } = {}) {
  container.innerHTML = `
  <div class="reset-pw-page">
    <div class="reset-pw-card">
      <img src="${LOGO_IMG}" alt="VELOVE" class="reset-pw-logo" />
      <h1 class="reset-pw-title">Set a New Password</h1>
      <p class="reset-pw-desc">Choose a strong password — at least 6 characters.</p>

      <form id="reset-pw-form" class="form reset-pw-form" novalidate>
        <div class="field">
          <span class="field-icon">🔒</span>
          <input id="rp-password" type="password" placeholder="New password" autocomplete="new-password" required />
          <button type="button" class="toggle-pw" data-target="rp-password" aria-label="Show password">${eyeSvg}</button>
        </div>
        <div class="field">
          <span class="field-icon">🔒</span>
          <input id="rp-confirm" type="password" placeholder="Confirm new password" autocomplete="new-password" required />
          <button type="button" class="toggle-pw" data-target="rp-confirm" aria-label="Show password">${eyeSvg}</button>
        </div>
        <p class="hint" id="rp-hint"></p>
        <p class="msg" id="rp-msg"></p>
        <button type="submit" class="btn-gradient" id="rp-submit">Reset Password</button>
      </form>

      <!-- Success state -->
      <div id="rp-success" class="rp-success hidden">
        <div class="rp-success-icon">✅</div>
        <h2>Password Reset!</h2>
        <p>Your password has been updated successfully. You can now log in with your new password.</p>
        <button type="button" class="btn-gradient" id="rp-go-login">Go to Login</button>
      </div>

      <!-- Invalid/expired token state -->
      <div id="rp-invalid" class="rp-invalid hidden">
        <div class="rp-invalid-icon">⚠️</div>
        <h2>Link Expired</h2>
        <p>This password reset link is invalid or has expired (links expire after 10 minutes). Please request a new one.</p>
        <button type="button" class="btn-gradient" id="rp-request-new">Request New Link</button>
      </div>
    </div>
  </div>`;

  _bindResetEvents(container, token, onSuccess);
}

function _bindResetEvents(container, token, onSuccess) {
  const $ = (s) => container.querySelector(s);

  const showMsg = (t, ok = false) => {
    const msgEl = $('#rp-msg');
    if (!msgEl) return;
    msgEl.textContent = t;
    msgEl.className = `msg ${ok ? 'ok' : 'err'}${t ? '' : ' hidden'}`;
  };

  // Password visibility toggles
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

  // Live confirm match feedback
  $('#rp-confirm')?.addEventListener('input', () => {
    const pw = $('#rp-password')?.value || '';
    const co = $('#rp-confirm')?.value || '';
    const hint = $('#rp-hint');
    if (!co) { hint && (hint.textContent = ''); return; }
    if (hint) {
      hint.textContent = pw === co ? '✓ Passwords match' : 'Passwords do not match';
      hint.className = `hint ${pw === co ? 'ok' : 'err'}`;
    }
  });

  // If there's no token, immediately show invalid state
  if (!token) {
    $('#reset-pw-form')?.classList.add('hidden');
    $('#rp-invalid')?.classList.remove('hidden');
  }

  // Form submit
  $('#reset-pw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg('');
    const password = $('#rp-password')?.value || '';
    const confirm = $('#rp-confirm')?.value || '';
    const submitBtn = $('#rp-submit');

    if (!password || !confirm) return showMsg('Please fill in both password fields.');
    if (password.length < 6) return showMsg('Password must be at least 6 characters.');
    if (password !== confirm) return showMsg('Passwords do not match.');

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Resetting…'; }

    try {
      await authApi.resetPassword(token, password);
      // Show success
      $('#reset-pw-form')?.classList.add('hidden');
      $('#rp-success')?.classList.remove('hidden');
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired') || err.status === 400) {
        $('#reset-pw-form')?.classList.add('hidden');
        $('#rp-invalid')?.classList.remove('hidden');
      } else {
        showMsg(msg || 'Password reset failed. Please try again.');
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Reset Password'; }
    }
  });

  $('#rp-go-login')?.addEventListener('click', () => {
    if (typeof onSuccess === 'function') onSuccess();
  });

  $('#rp-request-new')?.addEventListener('click', () => {
    if (typeof onSuccess === 'function') onSuccess('forgot');
  });
}
