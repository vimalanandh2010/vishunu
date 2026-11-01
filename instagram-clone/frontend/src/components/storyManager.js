import { LOGO_IMG, icons } from '../constants.js';
import { storyApi } from '../services/api.js';
import { getSessionUser } from '../state/session.js';
import { timeAgo, escapeHtml, showToast, mediaSrc } from '../utils/dom.js';

let activeStoryGroups = [];
let storyTrayElement = null;

/**
 * Renders the story bubbles into the container element.
 */
export async function renderStoriesTray(trayContainer) {
  storyTrayElement = trayContainer;
  const currentUser = getSessionUser();
  if (!currentUser) return;

  // Placeholder while loading
  trayContainer.innerHTML = `
    <div class="stories-wrap">
      <div class="stories-track">
        <div class="story-item story-item-self" id="story-self-btn" role="button" tabindex="0" aria-label="Add to your story">
          <div class="story-avatar-wrap">
            <img class="story-avatar" src="${currentUser.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
            <div class="story-plus-badge" id="story-plus-badge">${icons.plus}</div>
          </div>
          <span class="story-username">Your Story</span>
        </div>
        <div class="story-skeleton-pulse"></div>
        <div class="story-skeleton-pulse"></div>
        <div class="story-skeleton-pulse"></div>
      </div>
    </div>
    <input type="file" id="story-file-picker" accept="image/*,video/*" hidden />
  `;

  try {
    const res = await storyApi.getActiveStories();
    activeStoryGroups = res.groupedStories || [];
    renderTrayItems(trayContainer, currentUser, activeStoryGroups);
  } catch (err) {
    console.error('Failed to load active stories:', err);
    // Render at least user's own upload button
    renderTrayItems(trayContainer, currentUser, []);
  }
}

function renderTrayItems(trayContainer, currentUser, groups) {
  const myGroup = groups.find((g) => String(g.user?._id || g.user) === String(currentUser._id || currentUser.id));
  const otherGroups = groups.filter((g) => String(g.user?._id || g.user) !== String(currentUser._id || currentUser.id));

  const hasMyStories = Boolean(myGroup && myGroup.stories?.length > 0);
  const myRingClass = hasMyStories ? (myGroup.hasUnviewed ? 'has-stories unviewed' : 'has-stories viewed') : '';

  let html = `
    <div class="stories-wrap">
      <button class="stories-arrow prev" id="stories-prev" type="button" aria-label="Scroll stories left">${icons.chevronLeft}</button>
      <div class="stories-track" role="region" aria-label="Stories">
        <div class="story-item story-item-self ${myRingClass}" id="story-self-item" role="button" tabindex="0" aria-label="${hasMyStories ? 'View or add your story' : 'Add to your story'}">
          <div class="story-avatar-wrap">
            <img class="story-avatar" src="${currentUser.avatar || LOGO_IMG}" alt="" onerror="this.src='${LOGO_IMG}'" />
            <div class="story-plus-badge ${hasMyStories ? 'small-add' : ''}" id="story-add-trigger" title="Add story">${icons.plus}</div>
          </div>
          <span class="story-username">Your Story</span>
        </div>
      `;

  otherGroups.forEach((group, index) => {
    const user = group.user || {};
    const username = escapeHtml(user.username || 'user');
    const avatar = user.avatar || LOGO_IMG;
    const ringClass = group.hasUnviewed ? 'unviewed' : 'viewed';

    html += `
      <div class="story-item ${ringClass}" data-group-index="${index}" role="button" tabindex="0" aria-label="View ${username}'s story">
        <div class="story-avatar-wrap">
          <img class="story-avatar" src="${avatar}" alt="" onerror="this.src='${LOGO_IMG}'" />
        </div>
        <span class="story-username">${username}</span>
      </div>
    `;
  });

  html += `
      </div>
      <button class="stories-arrow next" id="stories-next" type="button" aria-label="Scroll stories right">${icons.chevron}</button>
    </div>
    <input type="file" id="story-file-picker" accept="image/*,video/*" hidden />
  `;

  trayContainer.innerHTML = html;
  bindTrayEvents(trayContainer, currentUser, myGroup, otherGroups);
  bindStoryArrows(trayContainer);
}

/**
 * Scroll arrows for the story tray: scroll by ~2.5 bubbles per click and
 * hide themselves when there is nothing (more) to scroll to.
 */
function bindStoryArrows(trayContainer) {
  const wrap  = trayContainer.querySelector('.stories-wrap');
  const track = trayContainer.querySelector('.stories-track');
  const prev  = trayContainer.querySelector('#stories-prev');
  const next  = trayContainer.querySelector('#stories-next');
  if (!wrap || !track) return;

  const STEP = 200;
  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    wrap.classList.toggle('is-scrollable', max > 4);
    prev?.classList.toggle('at-start', track.scrollLeft <= 4);
    next?.classList.toggle('at-end', track.scrollLeft >= max - 4);
  };

  prev?.addEventListener('click', () => track.scrollBy({ left: -STEP, behavior: 'smooth' }));
  next?.addEventListener('click', () => track.scrollBy({ left: STEP, behavior: 'smooth' }));
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

function bindTrayEvents(trayContainer, currentUser, myGroup, otherGroups) {
  const filePicker = trayContainer.querySelector('#story-file-picker');
  const selfItem = trayContainer.querySelector('#story-self-item');
  const addTrigger = trayContainer.querySelector('#story-add-trigger');

  if (addTrigger && filePicker) {
    addTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      filePicker.click();
    });
  }

  if (selfItem) {
    selfItem.addEventListener('click', () => {
      if (myGroup && myGroup.stories?.length > 0) {
        // Find index of myGroup in activeStoryGroups
        const myIndex = activeStoryGroups.findIndex((g) => String(g.user?._id || g.user) === String(currentUser._id || currentUser.id));
        openStoryViewer(activeStoryGroups, myIndex >= 0 ? myIndex : 0);
      } else if (filePicker) {
        filePicker.click();
      }
    });

    selfItem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selfItem.click();
      }
    });
  }

  // Bind clicks for other users' stories
  const otherItems = trayContainer.querySelectorAll('.story-item[data-group-index]');
  otherItems.forEach((el) => {
    el.addEventListener('click', () => {
      const gIdx = parseInt(el.dataset.groupIndex, 10);
      const targetGroup = otherGroups[gIdx];
      if (targetGroup) {
        const fullIndex = activeStoryGroups.findIndex((g) => g === targetGroup);
        openStoryViewer(activeStoryGroups, fullIndex >= 0 ? fullIndex : 0);
      }
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  // Handle file selection and story upload
  if (filePicker) {
    filePicker.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('media', file);

      try {
        showToast('Uploading story…');
        if (selfItem) selfItem.classList.add('uploading');

        await storyApi.createStory(formData);
        showToast('Story added to your profile!');
        // Refresh active stories
        renderStoriesTray(trayContainer);
      } catch (err) {
        showToast(err.message || 'Failed to upload story');
      } finally {
        if (selfItem) selfItem.classList.remove('uploading');
        filePicker.value = '';
      }
    });
  }
}

/* ==========================================================================
   Full-screen Interactive Story Viewer
   ========================================================================== */

let viewerState = {
  groups: [],
  groupIndex: 0,
  storyIndex: 0,
  duration: 5000, // 5s for images
  startTime: null,
  elapsedBeforePause: 0,
  isPaused: false,
  animFrameId: null,
  timeoutId: null,
};

/**
 * Launches the full-screen story viewer starting at a specific user group and story.
 */
export function openStoryViewer(groups, initialGroupIndex = 0, initialStoryIndex = 0) {
  if (!groups || groups.length === 0) return;

  viewerState.groups = groups;
  viewerState.groupIndex = Math.max(0, Math.min(initialGroupIndex, groups.length - 1));
  viewerState.storyIndex = initialStoryIndex;
  viewerState.isPaused = false;
  viewerState.elapsedBeforePause = 0;

  let viewerModal = document.querySelector('#story-viewer-modal');
  if (!viewerModal) {
    viewerModal = document.createElement('div');
    viewerModal.id = 'story-viewer-modal';
    viewerModal.className = 'story-viewer-overlay';
    viewerModal.setAttribute('role', 'dialog');
    viewerModal.setAttribute('aria-modal', 'true');
    viewerModal.setAttribute('aria-label', 'Story viewer');
    document.body.appendChild(viewerModal);
  }

  document.body.classList.add('story-viewer-open');
  renderViewerContent(viewerModal);
  bindViewerEvents(viewerModal);
}

function renderViewerContent(modal) {
  const group = viewerState.groups[viewerState.groupIndex];
  if (!group || !group.stories || group.stories.length === 0) {
    closeStoryViewer();
    return;
  }

  const currentUser = getSessionUser();
  const story = group.stories[viewerState.storyIndex];
  if (!story) {
    closeStoryViewer();
    return;
  }

  const isOwner = String(group.user?._id || group.user) === String(currentUser?._id || currentUser?.id);
  const user = group.user || {};
  const username = escapeHtml(user.username || 'user');
  const avatar = user.avatar || LOGO_IMG;
  const src = mediaSrc(story.mediaUrl);
  const isVideo = story.mediaType === 'video';

  // Mark viewed in background
  if (!story.isViewed && !isOwner) {
    story.isViewed = true;
    storyApi.markViewed(story._id).catch(() => {});
  }

  // Segmented progress bars
  const progressBarsHtml = group.stories.map((s, idx) => {
    let fillStyle = '';
    if (idx < viewerState.storyIndex) {
      fillStyle = 'width: 100%;';
    } else if (idx === viewerState.storyIndex) {
      fillStyle = 'width: 0%;';
    } else {
      fillStyle = 'width: 0%;';
    }
    return `
      <div class="story-progress-segment" data-index="${idx}">
        <div class="story-progress-fill" style="${fillStyle}"></div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="story-viewer-stage">
      <div class="story-progress-bar">${progressBarsHtml}</div>
      <header class="story-viewer-header">
        <div class="story-author-info">
          <img class="story-author-avatar" src="${avatar}" alt="" onerror="this.src='${LOGO_IMG}'" />
          <div class="story-author-text">
            <span class="story-author-name">${username}</span>
            <span class="story-time-ago">${timeAgo(story.createdAt)}</span>
          </div>
        </div>
        <div class="story-header-actions">
          ${isOwner ? `
            <span class="story-views-pill" title="Views">
              ${icons.eye} <span>${story.viewsCount || 0}</span>
            </span>
            <button class="story-action-btn story-delete-btn" id="story-delete-btn" title="Delete story" aria-label="Delete story">
              ${icons.trash}
            </button>
          ` : ''}
          <button class="story-action-btn story-close-btn" id="story-close-btn" title="Close" aria-label="Close story viewer">
            ${icons.close}
          </button>
        </div>
      </header>

      <div class="story-media-container" id="story-media-box">
        ${isVideo ? `
          <video class="story-media-item" id="story-video" src="${src}" playsinline autoplay></video>
        ` : `
          <img class="story-media-item" id="story-image" src="${src}" alt="story" />
        `}
      </div>

      <!-- Left / Right Tap Touch Targets -->
      <button class="story-tap-zone story-tap-prev" id="story-tap-prev" aria-label="Previous story"></button>
      <button class="story-tap-zone story-tap-next" id="story-tap-next" aria-label="Next story"></button>
    </div>
  `;

  startStoryTimer(modal, isVideo);
}

function startStoryTimer(modal, isVideo) {
  stopStoryTimer();

  const currentFill = modal.querySelector(`.story-progress-segment[data-index="${viewerState.storyIndex}"] .story-progress-fill`);
  const videoEl = modal.querySelector('#story-video');

  viewerState.duration = 5000;
  viewerState.elapsedBeforePause = 0;
  viewerState.isPaused = false;

  if (isVideo && videoEl) {
    videoEl.currentTime = 0;
    videoEl.play().catch(() => {});
    videoEl.onloadedmetadata = () => {
      if (videoEl.duration && !isNaN(videoEl.duration)) {
        viewerState.duration = Math.max(3000, videoEl.duration * 1000);
      }
    };
    videoEl.onended = () => {
      advanceStory(1);
    };
  }

  viewerState.startTime = performance.now();

  function tick(now) {
    if (viewerState.isPaused) {
      viewerState.animFrameId = requestAnimationFrame(tick);
      return;
    }

    const elapsed = (now - viewerState.startTime) + viewerState.elapsedBeforePause;
    const progress = Math.min(1, elapsed / viewerState.duration);

    if (currentFill) {
      currentFill.style.width = `${(progress * 100).toFixed(1)}%`;
    }

    if (progress >= 1) {
      advanceStory(1);
    } else {
      viewerState.animFrameId = requestAnimationFrame(tick);
    }
  }

  viewerState.animFrameId = requestAnimationFrame(tick);
}

function pauseStory(modal) {
  if (viewerState.isPaused) return;
  viewerState.isPaused = true;
  if (viewerState.startTime) {
    viewerState.elapsedBeforePause += performance.now() - viewerState.startTime;
  }
  const video = modal.querySelector('#story-video');
  if (video) video.pause();
}

function resumeStory(modal) {
  if (!viewerState.isPaused) return;
  viewerState.isPaused = false;
  viewerState.startTime = performance.now();
  const video = modal.querySelector('#story-video');
  if (video) video.play().catch(() => {});
}

function stopStoryTimer() {
  if (viewerState.animFrameId) {
    cancelAnimationFrame(viewerState.animFrameId);
    viewerState.animFrameId = null;
  }
  if (viewerState.timeoutId) {
    clearTimeout(viewerState.timeoutId);
    viewerState.timeoutId = null;
  }
}

function advanceStory(direction = 1) {
  stopStoryTimer();

  const group = viewerState.groups[viewerState.groupIndex];
  if (!group) {
    closeStoryViewer();
    return;
  }

  const nextStoryIndex = viewerState.storyIndex + direction;

  if (nextStoryIndex >= 0 && nextStoryIndex < group.stories.length) {
    // Next/prev story within same user
    viewerState.storyIndex = nextStoryIndex;
    const modal = document.querySelector('#story-viewer-modal');
    if (modal) renderViewerContent(modal);
  } else if (direction > 0) {
    // Move to next user's stories
    const nextGroupIndex = viewerState.groupIndex + 1;
    if (nextGroupIndex < viewerState.groups.length) {
      viewerState.groupIndex = nextGroupIndex;
      viewerState.storyIndex = 0;
      const modal = document.querySelector('#story-viewer-modal');
      if (modal) renderViewerContent(modal);
    } else {
      // Finished all active stories
      closeStoryViewer();
    }
  } else if (direction < 0) {
    // Move to previous user's stories
    const prevGroupIndex = viewerState.groupIndex - 1;
    if (prevGroupIndex >= 0) {
      viewerState.groupIndex = prevGroupIndex;
      const prevGroup = viewerState.groups[prevGroupIndex];
      viewerState.storyIndex = Math.max(0, (prevGroup.stories?.length || 1) - 1);
      const modal = document.querySelector('#story-viewer-modal');
      if (modal) renderViewerContent(modal);
    } else {
      // Re-start first story
      viewerState.storyIndex = 0;
      const modal = document.querySelector('#story-viewer-modal');
      if (modal) renderViewerContent(modal);
    }
  }
}

function bindViewerEvents(modal) {
  const closeBtn = modal.querySelector('#story-close-btn');
  const prevBtn = modal.querySelector('#story-tap-prev');
  const nextBtn = modal.querySelector('#story-tap-next');
  const deleteBtn = modal.querySelector('#story-delete-btn');
  const stage = modal.querySelector('.story-viewer-stage');

  if (closeBtn) closeBtn.addEventListener('click', closeStoryViewer);
  if (prevBtn) prevBtn.addEventListener('click', () => advanceStory(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => advanceStory(1));

  // Press & hold to pause
  if (stage) {
    stage.addEventListener('mousedown', () => pauseStory(modal));
    stage.addEventListener('mouseup', () => resumeStory(modal));
    stage.addEventListener('touchstart', () => pauseStory(modal), { passive: true });
    stage.addEventListener('touchend', () => resumeStory(modal), { passive: true });
  }

  // Delete current story
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const group = viewerState.groups[viewerState.groupIndex];
      const story = group?.stories?.[viewerState.storyIndex];
      if (!story) return;

      if (!confirm('Delete this story?')) return;

      try {
        pauseStory(modal);
        await storyApi.deleteStory(story._id);
        showToast('Story deleted');

        // Remove from memory
        group.stories.splice(viewerState.storyIndex, 1);
        if (group.stories.length === 0) {
          viewerState.groups.splice(viewerState.groupIndex, 1);
          if (viewerState.groups.length === 0) {
            closeStoryViewer();
            return;
          }
          viewerState.storyIndex = 0;
        } else if (viewerState.storyIndex >= group.stories.length) {
          viewerState.storyIndex = group.stories.length - 1;
        }

        renderViewerContent(modal);
      } catch (err) {
        resumeStory(modal);
        showToast(err.message || 'Failed to delete story');
      }
    });
  }

  // Global Keydown Handler
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      closeStoryViewer();
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      advanceStory(1);
    } else if (e.key === 'ArrowLeft') {
      advanceStory(-1);
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  modal._keyHandler = handleKeyDown;
}

export function closeStoryViewer() {
  stopStoryTimer();
  document.body.classList.remove('story-viewer-open');
  const modal = document.querySelector('#story-viewer-modal');
  if (modal) {
    if (modal._keyHandler) {
      window.removeEventListener('keydown', modal._keyHandler);
    }
    modal.remove();
  }

  // Refresh story tray when closing viewer so rings update
  if (storyTrayElement) {
    renderStoriesTray(storyTrayElement);
  }
}
