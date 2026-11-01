import { LOGO_IMG } from '../constants.js';
import { authApi } from '../services/api.js';

/**
 * Renders the Email Verification view — accessed via verification link in email.
 * Automatically calls the API, shows success or error, then redirects.
 *
 * @param {HTMLElement} container
 * @param {string} token - The verification token from the URL
 * @param {{ onSuccess: Function }} options
 */
export function renderEmailVerify(container, token, { onSuccess } = {}) {
  // Show loading skeleton immediately
  container.innerHTML = `
  <div class="verify-page">
    <div class="verify-card">
      <img src="${LOGO_IMG}" alt="VELOVE" class="verify-logo" />

      <div id="verify-loading" class="verify-state">
        <div class="verify-spinner"></div>
        <h2>Verifying your email…</h2>
        <p>This will only take a moment.</p>
      </div>

      <div id="verify-success" class="verify-state hidden">
        <div class="verify-icon verify-icon--ok">✉️</div>
        <h2>Email Verified!</h2>
        <p>Your email address has been confirmed. Your account is fully active.</p>
        <button type="button" class="btn-gradient" id="verify-go">Continue to VELOVE</button>
      </div>

      <div id="verify-error" class="verify-state hidden">
        <div class="verify-icon verify-icon--err">⚠️</div>
        <h2>Verification Failed</h2>
        <p id="verify-err-msg">The link is invalid or has already been used.</p>
        <button type="button" class="btn-gradient" id="verify-go-login">Go to Login</button>
      </div>
    </div>
  </div>`;

  _doVerify(container, token, onSuccess);
}

async function _doVerify(container, token, onSuccess) {
  const $ = (s) => container.querySelector(s);

  const showState = (id) => {
    ['verify-loading', 'verify-success', 'verify-error'].forEach((s) => {
      $(`#${s}`)?.classList.toggle('hidden', s !== id);
    });
  };

  if (!token) {
    $(`#verify-err-msg`).textContent = 'No verification token found in the link.';
    showState('verify-error');
    return;
  }

  try {
    await authApi.verifyEmail(token);
    showState('verify-success');
  } catch (err) {
    const errMsg = $(`#verify-err-msg`);
    if (errMsg) errMsg.textContent = err.message || 'The verification link is invalid or has already been used.';
    showState('verify-error');
  }

  $('#verify-go')?.addEventListener('click', () => {
    if (typeof onSuccess === 'function') onSuccess();
  });
  $('#verify-go-login')?.addEventListener('click', () => {
    if (typeof onSuccess === 'function') onSuccess();
  });
}
