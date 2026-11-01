import { LOGO_IMG, icons } from '../constants.js';
import { notificationApi } from '../services/api.js';
import { onNewNotification } from '../services/socket.js';
import { timeAgo, escapeHtml, showToast, mediaSrc } from '../utils/dom.js';

let notificationsCache = [];
let unreadCountCache = 0;
let popoverInstance = null;

function formatNotificationText(n) {
  const username = escapeHtml(n.sender?.username || 'Someone');
  switch (n.type) {
    case 'like':
      return `<strong>@${username}</strong> liked your post.`;
    case 'comment':
      return `<strong>@${username}</strong> commented on your post: <span class="notif-snippet">"${escapeHtml(n.comment?.text || '')}"</span>`;
    case 'follow':
      return `<strong>@${username}</strong> started following you.`;
    case 'message':
      return `<strong>@${username}</strong> sent you a message.`;
    default:
      return `<strong>@${username}</strong> interacted with you.`;
  }
}

/**
 * Initializes the bell icon and its unread badge.
 */
export function initNotificationBell(bellBtn, badgeEl, { onNavigate } = {}) {
  if (!bellBtn || !badgeEl) return;

  function updateBadge(count) {
    unreadCountCache = Math.max(0, count);
    if (unreadCountCache > 0) {
      badgeEl.textContent = unreadCountCache > 99 ? '99+' : unreadCountCache;
      badgeEl.style.display = 'flex';
      bellBtn.classList.add('has-unread');
    } else {
      badgeEl.style.display = 'none';
      bellBtn.classList.remove('has-unread');
    }
  }

  // Load initial notifications
  notificationApi.getNotifications()
    .then((res) => {
      notificationsCache = res.notifications || [];
      updateBadge(res.unreadCount !== undefined ? res.unreadCount : notificationsCache.filter((n) => !n.isRead).length);
    })
    .catch((err) => {
      console.warn('Could not fetch notifications:', err.message);
    });

  // Listen for real-time socket notifications
  const unsubscribe = onNewNotification((newNotif) => {
    notificationsCache.unshift(newNotif);
    updateBadge(unreadCountCache + 1);

    // Pop animation on bell
    bellBtn.classList.add('pop');
    setTimeout(() => bellBtn.classList.remove('pop'), 200);

    // Show brief toast
    const sender = newNotif.sender?.username || 'Someone';
    const action = newNotif.type === 'like' ? 'liked your post' : newNotif.type === 'comment' ? 'commented on your post' : 'followed you';
    showToast(`@${sender} ${action}`);

    // If popover is open, re-render its list
    if (popoverInstance) {
      renderPopoverList(popoverInstance, onNavigate, updateBadge);
    }
  });

  // Toggle popover on bell click
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popoverInstance) {
      closePopover();
    } else {
      openPopover(bellBtn, onNavigate, updateBadge);
    }
  });

  return () => {
    unsubscribe();
    closePopover();
  };
}

function openPopover(anchorBtn, onNavigate, updateBadge) {
  closePopover();

  const popover = document.createElement('div');
  popover.className = 'notif-popover';
  popover.id = 'notif-popover';
  popover.setAttribute('role', 'region');
  popover.setAttribute('aria-label', 'Notifications');

  popover.innerHTML = `
    <header class="notif-header">
      <h4 class="notif-title">Notifications</h4>
      <div class="notif-header-actions">
        <button class="notif-mark-all-btn" id="notif-mark-all-btn" title="Mark all read">
          ${icons.check} <span>Mark read</span>
        </button>
      </div>
    </header>
    <div class="notif-list" id="notif-list"></div>
  `;

  document.body.appendChild(popover);
  popoverInstance = popover;

  // Position relative to anchor
  positionPopover(popover, anchorBtn);

  // Render items
  renderPopoverList(popover, onNavigate, updateBadge);

  // Mark all read button
  const markAllBtn = popover.querySelector('#notif-mark-all-btn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await notificationApi.markAllRead();
        notificationsCache.forEach((n) => (n.isRead = true));
        updateBadge(0);
        renderPopoverList(popover, onNavigate, updateBadge);
        showToast('All marked as read');
      } catch (err) {
        showToast(err.message || 'Could not mark as read');
      }
    });
  }

  // Click outside listener
  const onDocClick = (e) => {
    if (!popover.contains(e.target) && !anchorBtn.contains(e.target)) {
      closePopover();
      document.removeEventListener('click', onDocClick);
    }
  };
  setTimeout(() => document.addEventListener('click', onDocClick), 10);
}

function positionPopover(popover, anchorBtn) {
  const rect = anchorBtn.getBoundingClientRect();
  const top = rect.bottom + 8;
  const right = Math.max(12, window.innerWidth - rect.right);

  popover.style.top = `${top}px`;
  popover.style.right = `${right}px`;
}

function renderPopoverList(popover, onNavigate, updateBadge) {
  const listEl = popover.querySelector('#notif-list');
  if (!listEl) return;

  if (notificationsCache.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon">${icons.bell}</div>
        <p>No notifications yet</p>
        <span>When someone interacts with your posts or profile, you will see it here.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = notificationsCache.map((n) => {
    const avatar = n.sender?.avatar || LOGO_IMG;
    const postMedia = n.post?.mediaUrl ? mediaSrc(n.post.mediaUrl) : null;
    const unreadDot = !n.isRead ? '<span class="notif-unread-dot" title="Unread"></span>' : '';

    return `
      <div class="notif-item ${n.isRead ? 'read' : 'unread'}" data-id="${n._id}">
        <img class="notif-avatar" src="${avatar}" alt="" loading="lazy" onerror="this.src='${LOGO_IMG}'" />
        <div class="notif-content">
          <p class="notif-text">${formatNotificationText(n)}</p>
          <span class="notif-time">${timeAgo(n.createdAt)}</span>
        </div>
        ${postMedia ? `
          <div class="notif-post-thumb">
            <img src="${postMedia}" alt="post thumbnail" loading="lazy" />
          </div>
        ` : ''}
        ${unreadDot}
        <button class="notif-del-btn" data-id="${n._id}" title="Remove notification" aria-label="Delete notification">
          ${icons.close}
        </button>
      </div>
    `;
  }).join('');

  // Bind notification clicks
  const items = listEl.querySelectorAll('.notif-item');
  items.forEach((el) => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.notif-del-btn')) return;

      const notifId = el.dataset.id;
      const notif = notificationsCache.find((n) => n._id === notifId);
      if (!notif) return;

      // Optimistically mark read
      if (!notif.isRead) {
        notif.isRead = true;
        el.classList.remove('unread');
        el.classList.add('read');
        const dot = el.querySelector('.notif-unread-dot');
        if (dot) dot.remove();
        updateBadge(unreadCountCache - 1);
        notificationApi.markRead(notifId).catch(() => {});
      }

      closePopover();

      // Navigation routing
      if (notif.post && (notif.type === 'like' || notif.type === 'comment')) {
        const pId = typeof notif.post === 'object' ? notif.post._id : notif.post;
        onNavigate?.('postDetail', { postId: pId });
      } else if (notif.sender) {
        onNavigate?.('profile', { username: notif.sender.username });
      }
    });
  });

  // Bind delete buttons
  const delBtns = listEl.querySelectorAll('.notif-del-btn');
  delBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const notifId = btn.dataset.id;
      const itemEl = btn.closest('.notif-item');

      try {
        const notif = notificationsCache.find((n) => n._id === notifId);
        if (notif && !notif.isRead) {
          updateBadge(unreadCountCache - 1);
        }

        notificationsCache = notificationsCache.filter((n) => n._id !== notifId);
        if (itemEl) {
          itemEl.style.opacity = '0';
          itemEl.style.transform = 'translateX(20px)';
          setTimeout(() => itemEl.remove(), 150);
        }

        await notificationApi.deleteNotification(notifId);
      } catch (err) {
        showToast(err.message || 'Could not delete notification');
      }
    });
  });
}

export function closePopover() {
  if (popoverInstance) {
    popoverInstance.remove();
    popoverInstance = null;
  }
}
