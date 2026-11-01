import { LOGO_IMG } from '../constants.js';

/**
 * Escapes user-generated strings to prevent XSS injection.
 */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Maps legacy paths and absolute backend upload URLs to local /uploads proxy.
 */
export function mediaSrc(url) {
  if (!url) return null;
  const abs = url.match(/^https?:\/\/[^/]+\/uploads\/([^/?#]+)$/i);
  if (abs) return `/uploads/${abs[1]}`;
  if (/^[a-zA-Z]:\\/.test(url)) {
    const m = url.match(/uploads[/\\]([^/\\]+)$/);
    return m ? `/uploads/${encodeURIComponent(m[1])}` : null;
  }
  return url;
}

/**
 * Formats timestamps into readable relative time strings.
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Shows a temporary floating toast message.
 */
export function showToast(msg, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => {
    t.classList.add('hide');
    setTimeout(() => t.remove(), 260);
  }, 2600);
}

/**
 * Generates shimmer skeleton placeholders for feed loading.
 */
export function feedSkeletons(n = 3) {
  return Array.from({ length: n }).map(() => `
    <div class="sk-post">
      <div class="sk-post-head">
        <div class="skeleton sk-avatar"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <div class="skeleton sk-line" style="width:45%"></div>
          <div class="skeleton sk-line" style="width:25%"></div>
        </div>
      </div>
      <div class="skeleton sk-media"></div>
      <div class="sk-post-lines">
        <div class="skeleton sk-line" style="width:80%"></div>
        <div class="skeleton sk-line" style="width:60%"></div>
      </div>
    </div>`).join('');
}

/**
 * Step wizard indicator for onboarding.
 */
export function stepperHTML(step) {
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

/**
 * Renders a person item for user search / suggested list.
 */
export function peopleRow(u) {
  const avatar = u.avatar || LOGO_IMG;
  return `
  <div class="person" data-id="${u._id}">
    <img class="avatar" src="${avatar}" alt="" onerror="this.src='${LOGO_IMG}'" />
    <div class="person-info">
      <strong>${escapeHtml(u.fullName || '')}</strong>
      <span>@${escapeHtml(u.username || '')}</span>
      <small>${u.followersCount != null ? 'Followed by ' + u.followersCount + ' people' : ''}</small>
    </div>
    <button class="follow-btn ${u.isFollowing ? 'following' : ''}" data-id="${u._id}" data-username="${escapeHtml(u.username || '')}">
      ${u.isFollowing ? 'Following' : 'Follow'}
    </button>
  </div>`;
}

/**
 * Creates an accessible modal dialog and cleans up all event listeners on close.
 */
export function showModal(options = {}) {
  let opts = options;
  if (typeof options === 'string') {
    opts = { bodyHTML: options };
  }

  const {
    id = 'app-modal',
    title,
    body,
    bodyHTML,
    confirmLabel,
    confirmClass = 'btn-primary',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    onOpen,
    onClose,
  } = opts;

  const existing = document.getElementById(id);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = id;

  if (bodyHTML) {
    overlay.innerHTML = bodyHTML;
  } else {
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width:440px;width:92vw;">
        ${title ? `<h3 style="margin:0 0 12px;font-size:16px;font-weight:700;">${escapeHtml(title)}</h3>` : ''}
        <div class="modal-body" style="margin-bottom:16px;">
          ${body || ''}
        </div>
        <div class="modal-actions" style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
          ${cancelLabel !== null && cancelLabel !== undefined ? `<button type="button" class="btn btn-secondary modal-cancel-btn">${escapeHtml(cancelLabel)}</button>` : ''}
          ${confirmLabel ? `<button type="button" class="btn ${confirmClass} modal-confirm-btn">${escapeHtml(confirmLabel)}</button>` : ''}
        </div>
      </div>
    `;
  }

  document.body.appendChild(overlay);

  const cleanup = () => {
    document.removeEventListener('keydown', handleKey);
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') cleanup();
  };

  document.addEventListener('keydown', handleKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cleanup();
  });

  const cancelBtn = overlay.querySelector('.modal-cancel-btn');
  cancelBtn?.addEventListener('click', () => {
    if (typeof onCancel === 'function') onCancel(cleanup);
    cleanup();
  });

  const confirmBtn = overlay.querySelector('.modal-confirm-btn');
  confirmBtn?.addEventListener('click', async () => {
    if (typeof onConfirm === 'function') {
      try {
        confirmBtn.disabled = true;
        await onConfirm(cleanup);
      } catch (err) {
        console.error(err);
      } finally {
        confirmBtn.disabled = false;
      }
    }
    cleanup();
  });

  if (typeof onOpen === 'function') {
    onOpen(overlay, cleanup);
  }

  return { overlay, close: cleanup };
}
