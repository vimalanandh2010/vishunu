import { LOGO_IMG, icons } from '../constants.js';
import { postApi, commentApi, userApi } from '../services/api.js';
import { getSessionUser, updateSessionUser } from '../state/session.js';
import { escapeHtml, mediaSrc, timeAgo, showToast, showModal } from '../utils/dom.js';
import { toggleTheme } from '../state/theme.js';

/**
 * Single top-level comment row markup template.
 */
function commentRowTemplate(c, currentUserId, isPostOwner) {
  const canDelete = c.user?._id === currentUserId || isPostOwner;
  const username = escapeHtml(c.user?.username || 'unknown');
  const avatar = c.user?.avatar || LOGO_IMG;
  const isLiked = (c.likes || []).some((id) => String(id._id || id) === currentUserId);
  const likesCount = (c.likes || []).length;

  return `
  <div class="pd-comment" data-id="${c._id}">
    <img class="avatar sm" src="${avatar}" alt="" onerror="this.src='${LOGO_IMG}'" />
    <div class="pd-comment-body">
      <div class="pd-c-top">
        <strong class="pd-c-username" data-username="${username}">@${username}</strong>
        <span class="pd-c-time">${timeAgo(c.createdAt)}</span>
      </div>
      <p class="pd-c-text">${escapeHtml(c.text)}</p>
      <div class="pd-c-actions">
        <button type="button" class="pd-c-reply-btn" data-id="${c._id}" data-username="${username}">Reply</button>
        <button type="button" class="pd-c-like-btn ${isLiked ? 'liked' : ''}" data-id="${c._id}" aria-label="Like comment" title="Like comment">
          <span class="pd-c-like-icon">${isLiked ? '❤️' : '🤍'}</span>
          <span class="pd-c-like-count">${likesCount > 0 ? likesCount : ''}</span>
        </button>
        ${canDelete ? `<button type="button" class="pd-c-del" data-id="${c._id}" title="Delete comment" aria-label="Delete comment">✕</button>` : ''}
      </div>
    </div>
  </div>`;
}

/**
 * Single reply row markup template.
 */
function replyRowTemplate(r, currentUserId, isPostOwner, rootCommentId) {
  const canDelete = r.user?._id === currentUserId || isPostOwner;
  const username = escapeHtml(r.user?.username || 'unknown');
  const avatar = r.user?.avatar || LOGO_IMG;
  const isLiked = (r.likes || []).some((id) => String(id._id || id) === currentUserId);
  const likesCount = (r.likes || []).length;

  return `
  <div class="pd-comment pd-reply" data-id="${r._id}" data-parent-id="${rootCommentId}">
    <img class="avatar sm" src="${avatar}" alt="" onerror="this.src='${LOGO_IMG}'" />
    <div class="pd-comment-body">
      <div class="pd-c-top">
        <strong class="pd-c-username" data-username="${username}">@${username}</strong>
        <span class="pd-c-time">${timeAgo(r.createdAt)}</span>
      </div>
      <p class="pd-c-text">${escapeHtml(r.text)}</p>
      <div class="pd-c-actions">
        <button type="button" class="pd-c-reply-btn" data-id="${rootCommentId}" data-username="${username}">Reply</button>
        <button type="button" class="pd-c-like-btn ${isLiked ? 'liked' : ''}" data-id="${r._id}" aria-label="Like reply" title="Like reply">
          <span class="pd-c-like-icon">${isLiked ? '❤️' : '🤍'}</span>
          <span class="pd-c-like-count">${likesCount > 0 ? likesCount : ''}</span>
        </button>
        ${canDelete ? `<button type="button" class="pd-c-del" data-id="${r._id}" data-parent-id="${rootCommentId}" title="Delete reply" aria-label="Delete reply">✕</button>` : ''}
      </div>
    </div>
  </div>`;
}

/**
 * Thread markup template (top-level comment + collapsible replies).
 */
function threadTemplate(rootComment, replies, currentUserId, isPostOwner) {
  const hasReplies = replies && replies.length > 0;
  const count = replies ? replies.length : 0;

  return `
  <div class="pd-comment-thread" data-thread-id="${rootComment._id}">
    ${commentRowTemplate(rootComment, currentUserId, isPostOwner)}
    <div class="pd-replies-wrap" ${hasReplies ? '' : 'style="display:none"'}>
      <button type="button" class="pd-replies-toggle" data-count="${count}" data-thread-id="${rootComment._id}">
        <span class="pd-replies-line"></span>
        <span class="pd-replies-toggle-text">${hasReplies ? `View ${count} ${count === 1 ? 'reply' : 'replies'}` : ''}</span>
      </button>
      <div class="pd-replies-list hidden" id="replies-${rootComment._id}">
        ${hasReplies ? replies.map((r) => replyRowTemplate(r, currentUserId, isPostOwner, rootComment._id)).join('') : ''}
      </div>
    </div>
  </div>`;
}

/**
 * Builds threaded comments HTML from a list of comments.
 */
function buildThreadsHtml(comments, currentUserId, isPostOwner) {
  if (!comments || !comments.length) {
    return `<div class="empty" id="pd-no-comments">No comments yet — be the first!</div>`;
  }

  const rootComments = [];
  const repliesMap = new Map();

  comments.forEach((c) => {
    const parentId = c.parent?._id || c.parent;
    if (!parentId) {
      rootComments.push(c);
    } else {
      const pid = String(parentId);
      if (!repliesMap.has(pid)) repliesMap.set(pid, []);
      repliesMap.get(pid).push(c);
    }
  });

  return rootComments
    .map((root) => threadTemplate(root, repliesMap.get(String(root._id)) || [], currentUserId, isPostOwner))
    .join('');
}

/**
 * Renders the Post Detail screen.
 */
export async function renderPostDetail(container, postId, { onNavigate, onGoBack } = {}) {
  const currentUser = getSessionUser();

  container.innerHTML = `
  <div class="app-shell">
    <nav class="top-nav" role="banner">
      <div class="top-nav-inner">
        <button id="pd-back" class="nav-btn" title="Back" aria-label="Go back">${icons.arrowLeft}</button>
        <span class="nav-brand" style="font-size:15px;letter-spacing:1px">Post</span>
        <button id="pd-theme-btn" class="nav-btn" title="Toggle theme" aria-label="Toggle theme" style="margin-left:auto">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>
      </div>
    </nav>
    <main class="feed-area"><section class="card post-card">
      <div class="pd-body">
        <div class="pd-skeleton pd-sk-media"></div>
        <div class="pd-info">
          <div class="pd-skeleton pd-sk-line w60"></div>
          <div class="pd-skeleton pd-sk-line w90"></div>
          <div class="pd-skeleton pd-sk-line w80"></div>
          <div class="pd-skeleton pd-sk-line w40"></div>
        </div>
      </div>
    </section></main>
  </div>`;

  document.getElementById('pd-back')?.addEventListener('click', () => {
    if (typeof onGoBack === 'function') onGoBack();
  });

  // Wire theme toggle (runs for skeleton render; re-wired after full render too)
  function wirePdTheme() {
    const btn = document.getElementById('pd-theme-btn');
    if (!btn) return;
    const sync = () => {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      btn.innerHTML = isDark ? icons.sun : icons.moon;
    };
    sync();
    btn.addEventListener('click', () => { toggleTheme(); sync(); });
  }
  wirePdTheme();

  let post, comments = [], authorProfile = null;
  try {
    const [pData, cData] = await Promise.all([
      postApi.getPost(postId),
      commentApi.getComments(postId).catch(() => ({ comments: [] })),
    ]);

    post = pData.post;
    comments = cData.comments || [];

    const isOwn = post.user?._id === currentUser?._id;
    if (!isOwn && post.user?.username) {
      const uData = await userApi.getProfile(post.user.username).catch(() => ({}));
      if (uData.profile) authorProfile = uData.profile;
    }
  } catch {
    container.innerHTML = `
    <div class="app-shell">
      <nav class="top-nav" role="banner">
        <div class="top-nav-inner">
          <button id="pd-back" class="nav-btn" title="Back" aria-label="Go back">${icons.arrowLeft}</button>
          <span class="nav-brand" style="font-size:15px;letter-spacing:1px">Post</span>
          <button id="pd-theme-btn" class="nav-btn" title="Toggle theme" aria-label="Toggle theme" style="margin-left:auto">
            ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
          </button>
        </div>
      </nav>
      <main class="feed-area"><section class="card post-card">
        <div class="pd-error">
          <div class="pd-err-icon">🗑️</div>
          <h3>Post unavailable</h3>
          <p>This post is no longer available — it may have been deleted.</p>
          <button id="pd-err-home" class="btn-gradient btn-small">Back to Home</button>
        </div>
      </section></main>
    </div>`;

    document.getElementById('pd-back')?.addEventListener('click', () => onGoBack?.());
    wirePdTheme();
    document.getElementById('pd-err-home')?.addEventListener('click', () => onNavigate?.('home'));
    return;
  }

  const author = post.user || {};
  const isOwn = author._id === currentUser?._id;
  const liked = (post.likes || []).some((id) => String(id._id || id) === currentUser?._id);
  const src = mediaSrc(post.mediaUrl);
  const authorUsername = escapeHtml(author.username || 'unknown');
  const isSaved = (currentUser?.savedPosts || []).some((id) => String(id._id || id) === postId);

  container.innerHTML = `
  <div class="app-shell">
    <nav class="top-nav" role="banner">
      <div class="top-nav-inner">
        <button id="pd-back" class="nav-btn" title="Back" aria-label="Go back">${icons.arrowLeft}</button>
        <span class="nav-brand" style="font-size:15px;letter-spacing:1px">Post</span>
        <button id="pd-theme-btn" class="nav-btn" title="Toggle theme" aria-label="Toggle theme" style="margin-left:auto">
          ${document.documentElement.getAttribute('data-theme') !== 'light' ? icons.sun : icons.moon}
        </button>
      </div>
    </nav>
    <main class="feed-area"><section class="card post-card">

      <div class="pd-body">
        <div class="pd-media ${src ? '' : 'pd-media-empty'}">
          ${src ? (post.mediaType === 'video'
            ? `<video class="pd-img" src="${src}" controls></video>`
            : `<img class="pd-img" id="pd-image" src="${src}" alt="post media" onerror="this.parentElement.classList.add('pd-media-empty'); this.remove()" />`)
          : `<div class="pd-cap-fallback">${escapeHtml(post.caption || 'No media')}</div>`}
        </div>

        <div class="pd-info">
          <div class="pd-author">
            <img class="avatar" src="${author.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
            <div class="pd-author-meta">
              <strong class="pd-username" data-username="${authorUsername}">@${authorUsername}</strong>
              <span class="pd-time">${timeAgo(post.createdAt)}</span>
            </div>
            ${!isOwn && author.username ? `<button id="pd-follow" class="pf-follow pd-follow ${authorProfile?.isFollowing ? 'on' : ''}" data-id="${author._id}">${authorProfile?.isFollowing ? 'Following ✓' : 'Follow'}</button>` : ''}
          </div>

          <div class="pd-caption-box">
            <div class="pd-caption" id="pd-caption">${post.caption ? escapeHtml(post.caption) : '<em class="pd-muted">No caption</em>'}</div>
            ${isOwn ? `
            <div class="pd-owner-actions">
              <button id="pd-edit" class="link-btn small">Edit caption</button>
              <button id="pd-delete" class="link-btn small danger">Delete post</button>
            </div>` : ''}
          </div>

          <div class="pd-actions">
            <div class="pd-actions-main">
              <button id="pd-like" class="pd-like ${liked ? 'liked' : ''}" aria-label="Like post" aria-pressed="${liked}">
                ${icons.heart}<span id="pd-like-count">${(post.likes || []).length}</span>
              </button>
              <button id="pd-likes-open" class="pd-likes-open link-btn small" aria-haspopup="dialog">Liked by</button>
              <span class="pd-comment-count">${icons.comment}<span id="pd-comment-count">${comments.length}</span></span>
            </div>
            <button id="pd-save" class="pd-save ${isSaved ? 'saved' : ''}" aria-label="${isSaved ? 'Remove bookmark' : 'Save post'}" aria-pressed="${isSaved}">
              ${isSaved ? icons.bookmarkFilled : icons.bookmark}
            </button>
          </div>

          <div class="pd-comments" id="pd-comments">
            ${buildThreadsHtml(comments, currentUser?._id, isOwn)}
          </div>

          <div class="pd-reply-banner hidden" id="pd-reply-banner">
            <span class="pd-reply-banner-text" id="pd-reply-banner-text">Replying to @user</span>
            <button type="button" class="pd-reply-cancel" id="pd-reply-cancel" aria-label="Cancel reply">✕</button>
          </div>
          <form class="pd-comment-form" id="pd-comment-form">
            <input id="pd-comment-input" type="text" maxlength="1000" placeholder="Add a comment…" autocomplete="off" />
            <button type="submit" class="btn-gradient btn-small" id="pd-comment-submit">Post</button>
          </form>
        </div>
      </div>
    </section></main>
  </div>`;

  document.getElementById('pd-back')?.addEventListener('click', () => onGoBack?.());
  wirePdTheme();

  // Username navigation (header & author)
  container.querySelectorAll('.pd-username[data-username]').forEach((el) => {
    el.addEventListener('click', () => onNavigate?.('profile', { username: el.dataset.username }));
  });

  // LIKE toggle
  const likeBtn = document.getElementById('pd-like');
  const likeCount = document.getElementById('pd-like-count');
  likeBtn?.addEventListener('click', async () => {
    if (likeBtn.disabled) return;
    likeBtn.disabled = true;
    try {
      const data = await postApi.toggleLike(postId);
      likeBtn.classList.toggle('liked', data.isLiked);
      likeBtn.setAttribute('aria-pressed', String(!!data.isLiked));
      if (likeCount) {
        likeCount.textContent = data.likesCount !== undefined
          ? data.likesCount
          : Math.max(0, parseInt(likeCount.textContent, 10) + (data.isLiked ? 1 : -1));
      }
      likeBtn.classList.add('pop');
      setTimeout(() => likeBtn.classList.remove('pop'), 180);
    } catch (err) {
      showToast(err.message || 'Network error — like not saved', 'err');
    } finally {
      likeBtn.disabled = false;
    }
  });

  // BOOKMARK / SAVE toggle
  const saveBtn = document.getElementById('pd-save');
  saveBtn?.addEventListener('click', async () => {
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      const data = await postApi.toggleSave(postId);
      const nowSaved = Boolean(data.isSaved);
      saveBtn.classList.toggle('saved', nowSaved);
      saveBtn.setAttribute('aria-pressed', String(nowSaved));
      saveBtn.setAttribute('aria-label', nowSaved ? 'Remove bookmark' : 'Save post');
      saveBtn.innerHTML = nowSaved ? icons.bookmarkFilled : icons.bookmark;
      saveBtn.classList.add('pop');
      setTimeout(() => saveBtn.classList.remove('pop'), 180);

      const u = getSessionUser();
      if (u) {
        let saved = Array.isArray(u.savedPosts) ? [...u.savedPosts] : [];
        if (nowSaved) {
          if (!saved.some((id) => String(id._id || id) === postId)) saved.push(postId);
        } else {
          saved = saved.filter((id) => String(id._id || id) !== postId);
        }
        updateSessionUser({ savedPosts: saved });
      }
      showToast(nowSaved ? 'Post saved to bookmarks' : 'Post removed from bookmarks');
    } catch (err) {
      showToast(err.message || 'Could not update bookmark', 'err');
    } finally {
      saveBtn.disabled = false;
    }
  });

  // LIKED-BY modal using memory-leak-free showModal helper
  document.getElementById('pd-likes-open')?.addEventListener('click', () => {
    showModal({
      id: 'lb-modal',
      bodyHTML: `
        <div class="modal lb-modal" role="dialog" aria-modal="true" aria-label="People who liked this post">
          <div class="lb-head">
            <h3>Liked by</h3>
            <button id="lb-close" class="lb-close-btn" aria-label="Close likes list">✕</button>
          </div>
          <div class="lb-list" id="lb-list"><div class="lb-state">Loading…</div></div>
        </div>`,
      onOpen: async (overlay, close) => {
        const closeBtn = overlay.querySelector('#lb-close');
        closeBtn?.addEventListener('click', close);
        closeBtn?.focus();

        try {
          const data = await postApi.getLikes(postId);
          const list = overlay.querySelector('#lb-list');
          if (!list) return;

          if (!data.users?.length) {
            list.innerHTML = `<div class="lb-state">No likes yet — be the first! ❤️</div>`;
            return;
          }

          list.innerHTML = data.users.map((u) => `
            <div class="lb-user" data-username="${escapeHtml(u.username || '')}" role="link" tabindex="0" aria-label="View @${escapeHtml(u.username || '')} profile">
              <img class="avatar sm" src="${u.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
              <div class="lb-user-meta">
                <strong class="lb-username">@${escapeHtml(u.username || 'unknown')}</strong>
                <span class="lb-fullname">${escapeHtml(u.fullName || '')}</span>
              </div>
            </div>`).join('');

          list.addEventListener('click', (e) => {
            const userRow = e.target.closest('.lb-user[data-username]');
            if (userRow?.dataset.username) {
              close();
              onNavigate?.('profile', { username: userRow.dataset.username });
            }
          });
        } catch {
          const list = overlay.querySelector('#lb-list');
          if (list) list.innerHTML = `<div class="lb-state">Network error — could not load likes</div>`;
        }
      },
    });
  });

  // COMMENT STATE & FORM
  let activeReplyTarget = null; // { parentId, username }
  const commentForm = document.getElementById('pd-comment-form');
  const commentInput = document.getElementById('pd-comment-input');
  const commentList = document.getElementById('pd-comments');
  const commentCount = document.getElementById('pd-comment-count');
  const submitCommentBtn = document.getElementById('pd-comment-submit');
  const replyBanner = document.getElementById('pd-reply-banner');
  const replyBannerText = document.getElementById('pd-reply-banner-text');
  const cancelReplyBtn = document.getElementById('pd-reply-cancel');

  cancelReplyBtn?.addEventListener('click', () => {
    activeReplyTarget = null;
    replyBanner?.classList.add('hidden');
    if (commentInput) {
      commentInput.placeholder = 'Add a comment…';
      commentInput.value = '';
    }
  });

  commentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text) {
      showToast('Comment cannot be empty', 'err');
      return;
    }
    if (text.length > 1000) {
      showToast('Comment is too long (max 1000)', 'err');
      return;
    }
    if (submitCommentBtn) submitCommentBtn.disabled = true;

    try {
      const parentId = activeReplyTarget?.parentId || null;
      const data = await commentApi.addComment(postId, text, parentId);
      if (data.comment) {
        document.getElementById('pd-no-comments')?.remove();

        if (parentId) {
          // It's a reply!
          const threadEl = commentList.querySelector(`.pd-comment-thread[data-thread-id="${parentId}"]`);
          const repliesWrap = threadEl?.querySelector('.pd-replies-wrap');
          const repliesList = threadEl?.querySelector(`#replies-${parentId}`);
          const toggleBtn = threadEl?.querySelector('.pd-replies-toggle');

          if (repliesList) {
            repliesList.insertAdjacentHTML('beforeend', replyRowTemplate(data.comment, currentUser?._id, isOwn, parentId));
            repliesList.classList.remove('hidden');

            if (repliesWrap) repliesWrap.style.display = '';

            const currentCount = parseInt(toggleBtn?.dataset.count || '0', 10) + 1;
            if (toggleBtn) {
              toggleBtn.dataset.count = String(currentCount);
              const textSpan = toggleBtn.querySelector('.pd-replies-toggle-text');
              if (textSpan) textSpan.textContent = `Hide replies (${currentCount})`;
            }
          }
          showToast('Reply posted');
        } else {
          // Top-level comment
          commentList.insertAdjacentHTML('beforeend', threadTemplate(data.comment, [], currentUser?._id, isOwn));
          showToast('Comment added');
        }

        if (commentCount) commentCount.textContent = parseInt(commentCount.textContent, 10) + 1;

        // Reset replying state
        activeReplyTarget = null;
        replyBanner?.classList.add('hidden');
        commentInput.placeholder = 'Add a comment…';
        commentInput.value = '';
      }
    } catch (err) {
      showToast(err.message || 'Could not add comment', 'err');
    } finally {
      if (submitCommentBtn) submitCommentBtn.disabled = false;
    }
  });

  // COMMENT LIST EVENT DELEGATION (Likes, Replies, Collapse, Delete, User Profile)
  commentList?.addEventListener('click', async (e) => {
    // 1. Like comment or reply
    const likeBtn = e.target.closest('.pd-c-like-btn');
    if (likeBtn) {
      if (likeBtn.disabled) return;
      likeBtn.disabled = true;
      const targetId = likeBtn.dataset.id;
      try {
        const data = await commentApi.toggleLike(targetId);
        likeBtn.classList.toggle('liked', data.isLiked);
        const iconSpan = likeBtn.querySelector('.pd-c-like-icon');
        const countSpan = likeBtn.querySelector('.pd-c-like-count');
        if (iconSpan) iconSpan.textContent = data.isLiked ? '❤️' : '🤍';
        if (countSpan) countSpan.textContent = data.likesCount > 0 ? data.likesCount : '';
      } catch (err) {
        showToast(err.message || 'Could not like comment', 'err');
      } finally {
        likeBtn.disabled = false;
      }
      return;
    }

    // 2. Reply to comment or reply
    const replyBtn = e.target.closest('.pd-c-reply-btn');
    if (replyBtn) {
      const parentId = replyBtn.dataset.id;
      const targetUsername = replyBtn.dataset.username;
      activeReplyTarget = { parentId, username: targetUsername };
      if (replyBanner && replyBannerText) {
        replyBannerText.textContent = `Replying to @${targetUsername}`;
        replyBanner.classList.remove('hidden');
      }
      if (commentInput) {
        commentInput.placeholder = `Reply to @${targetUsername}…`;
        commentInput.focus();
      }
      return;
    }

    // 3. Toggle replies expansion
    const toggleBtn = e.target.closest('.pd-replies-toggle');
    if (toggleBtn) {
      const threadId = toggleBtn.dataset.threadId;
      const repliesList = document.getElementById(`replies-${threadId}`);
      if (repliesList) {
        const isHidden = repliesList.classList.toggle('hidden');
        const count = parseInt(toggleBtn.dataset.count || '0', 10);
        const textSpan = toggleBtn.querySelector('.pd-replies-toggle-text');
        if (textSpan) {
          textSpan.textContent = isHidden
            ? `View ${count} ${count === 1 ? 'reply' : 'replies'}`
            : `Hide replies`;
        }
      }
      return;
    }

    // 4. Delete comment or reply
    const delBtn = e.target.closest('.pd-c-del');
    if (delBtn) {
      if (delBtn.disabled) return;
      delBtn.disabled = true;
      const commentId = delBtn.dataset.id;
      const parentId = delBtn.dataset.parentId;

      try {
        await commentApi.deleteComment(commentId);

        if (parentId) {
          // Deleting a single reply
          const replyRow = delBtn.closest('.pd-reply');
          const threadEl = delBtn.closest('.pd-comment-thread');
          replyRow?.remove();

          if (commentCount) commentCount.textContent = Math.max(0, parseInt(commentCount.textContent, 10) - 1);

          const toggleBtn = threadEl?.querySelector('.pd-replies-toggle');
          if (toggleBtn) {
            const newCount = Math.max(0, parseInt(toggleBtn.dataset.count || '0', 10) - 1);
            toggleBtn.dataset.count = String(newCount);
            const textSpan = toggleBtn.querySelector('.pd-replies-toggle-text');
            if (newCount === 0) {
              const wrap = threadEl.querySelector('.pd-replies-wrap');
              if (wrap) wrap.style.display = 'none';
            } else if (textSpan) {
              textSpan.textContent = toggleBtn.querySelector('.pd-replies-list')?.classList.contains('hidden')
                ? `View ${newCount} ${newCount === 1 ? 'reply' : 'replies'}`
                : `Hide replies`;
            }
          }
        } else {
          // Deleting a root comment (cascades deletion of all replies)
          const thread = delBtn.closest('.pd-comment-thread');
          const replyCount = thread ? thread.querySelectorAll('.pd-reply').length : 0;
          const totalRemoved = 1 + replyCount;

          thread?.remove();
          if (commentCount) commentCount.textContent = Math.max(0, parseInt(commentCount.textContent, 10) - totalRemoved);

          if (!commentList.querySelector('.pd-comment-thread')) {
            commentList.innerHTML = `<div class="empty" id="pd-no-comments">No comments yet — be the first!</div>`;
          }
        }

        showToast('Comment deleted');
      } catch (err) {
        delBtn.disabled = false;
        showToast(err.message || 'Could not delete comment', 'err');
      }
      return;
    }

    // 5. Profile click
    const userEl = e.target.closest('.pd-c-username[data-username]');
    if (userEl?.dataset.username) {
      onNavigate?.('profile', { username: userEl.dataset.username });
    }
  });

  // FOLLOW AUTHOR
  const followBtn = document.getElementById('pd-follow');
  if (followBtn) {
    followBtn.addEventListener('click', async () => {
      if (followBtn.disabled) return;
      followBtn.disabled = true;
      const wasFollowing = followBtn.classList.contains('on');
      try {
        const data = await userApi.toggleFollow(followBtn.dataset.id);
        const nowFollowing = data.isFollowing ?? !wasFollowing;
        followBtn.textContent = nowFollowing ? 'Following ✓' : 'Follow';
        followBtn.classList.toggle('on', nowFollowing);
      } catch (err) {
        showToast(err.message || 'Could not update follow', 'err');
      } finally {
        followBtn.disabled = false;
      }
    });
  }

  // EDIT CAPTION
  const editBtn = document.getElementById('pd-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const box = container.querySelector('.pd-caption-box');
      if (!box) return;
      box.innerHTML = `
        <textarea id="pd-caption-input" class="ob-textarea" rows="3" maxlength="2200">${escapeHtml(post.caption || '')}</textarea>
        <div class="pd-owner-actions">
          <button id="pd-save" class="btn-gradient btn-small">Save</button>
          <button id="pd-cancel" class="link-btn small">Cancel</button>
        </div>`;
      document.getElementById('pd-caption-input')?.focus();

      document.getElementById('pd-cancel')?.addEventListener('click', () => {
        renderPostDetail(container, postId, { onNavigate, onGoBack });
      });

      document.getElementById('pd-save')?.addEventListener('click', async () => {
        const caption = document.getElementById('pd-caption-input')?.value.trim();
        if (!caption) {
          showToast('Caption cannot be empty', 'err');
          return;
        }
        const saveBtn = document.getElementById('pd-save');
        if (saveBtn) saveBtn.disabled = true;

        try {
          const data = await postApi.updateCaption(postId, caption);
          post.caption = data.post.caption;
          showToast('Caption updated');
          renderPostDetail(container, postId, { onNavigate, onGoBack });
        } catch (err) {
          if (saveBtn) saveBtn.disabled = false;
          showToast(err.message || 'Could not save caption', 'err');
        }
      });
    });
  }

  // DELETE POST with modal dialog
  const deleteBtn = document.getElementById('pd-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      showModal({
        id: 'pd-modal',
        bodyHTML: `
          <div class="modal" role="dialog" aria-modal="true">
            <h3>Delete this post?</h3>
            <p>This will permanently remove the post and its comments.</p>
            <div class="modal-actions">
              <button id="pd-modal-cancel" class="btn-ghost">Cancel</button>
              <button id="pd-modal-confirm" class="btn-danger">Delete</button>
            </div>
          </div>`,
        onOpen: (overlay, close) => {
          overlay.querySelector('#pd-modal-cancel')?.addEventListener('click', close);
          overlay.querySelector('#pd-modal-confirm')?.addEventListener('click', async () => {
            const confirmBtn = overlay.querySelector('#pd-modal-confirm');
            if (confirmBtn) confirmBtn.disabled = true;

            try {
              await postApi.deletePost(postId);
              close();
              showToast('Post deleted');
              onNavigate?.('profile', { username: currentUser?.username, replaceHistory: true });
            } catch (err) {
              if (confirmBtn) confirmBtn.disabled = false;
              showToast(err.message || 'Could not delete post', 'err');
            }
          });
        },
      });
    });
  }
}
