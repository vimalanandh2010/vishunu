import { isAuthenticated } from './state/session.js';

let routeHandler = null;

/**
 * Pushes a new hash entry onto the history stack.
 */
export function pushHash(hash) {
  try {
    const currentCount = history.state?.velove || 0;
    history.pushState({ velove: currentCount + 1 }, '', hash);
  } catch {
    // fallback if pushState fails
    location.hash = hash;
  }
}

/**
 * Replaces the current state in history without adding a new entry.
 */
export function replaceHash(hash) {
  try {
    const currentCount = history.state?.velove || 0;
    history.replaceState({ velove: currentCount }, '', hash);
  } catch {
    location.hash = hash;
  }
}

/**
 * Clears hash back to current pathname.
 */
export function clearHash() {
  try {
    history.replaceState({ velove: 0 }, '', location.pathname);
  } catch {
    location.hash = '';
  }
}

/**
 * Navigates backward in history, or executes fallback callback.
 */
export function goBack(fallback) {
  if ((history.state?.velove || 0) > 0) {
    history.back();
  } else if (typeof fallback === 'function') {
    fallback();
  }
}

/**
 * Parses the current location hash into structured route data.
 */
export function parseRoute(hash = location.hash) {
  const cleanHash = hash.trim();

  const mPost = cleanHash.match(/^#\/post\/([a-f0-9]{24})$/i);
  if (mPost) {
    return { name: 'postDetail', params: { postId: mPost[1] } };
  }

  const mProf = cleanHash.match(/^#\/profile\/([^/]+)$/);
  if (mProf) {
    return { name: 'profile', params: { username: decodeURIComponent(mProf[1]) } };
  }

  const mChatInfo = cleanHash.match(/^#\/messages\/info\/([a-f0-9]{24})(?:\/([a-f0-9]{24}))?$/i);
  if (mChatInfo) {
    return { name: 'chatInfo', params: { userId: mChatInfo[1], conversationId: mChatInfo[2] || null } };
  }

  const mMsg = cleanHash.match(/^#\/messages(?:\/([a-f0-9]{24}))?$/i);
  if (mMsg) {
    return { name: 'messages', params: { conversationId: mMsg[1] || null } };
  }

  const mReset = cleanHash.match(/^#\/reset-password\/([^/]+)$/);
  if (mReset) {
    return { name: 'resetPassword', params: { token: mReset[1] } };
  }

  const mVerify = cleanHash.match(/^#\/verify-email\/([^/]+)$/);
  if (mVerify) {
    return { name: 'verifyEmail', params: { token: mVerify[1] } };
  }

  const mOnb = cleanHash.match(/^#\/onboarding(?:\/([1-3]))?$/);
  if (mOnb) {
    return { name: 'onboarding', params: { step: parseInt(mOnb[1] || '1', 10) } };
  }

  if (cleanHash === '#/saved') {
    return { name: 'saved', params: {} };
  }

  if (cleanHash === '#/random-connect') {
    return { name: 'random-connect', params: {} };
  }

  if (cleanHash === '#/random-chat') {
    return { name: 'randomTextChat', params: {} };
  }

  if (cleanHash === '#/random-video') {
    return { name: 'randomVideoChat', params: {} };
  }

  if (cleanHash === '' || cleanHash === '#/' || cleanHash === '#/home') {
    return { name: 'home', params: {} };
  }

  return { name: 'unknown', hash: cleanHash };
}

/**
 * Registers the central route listener.
 */
export function initRouter(handler) {
  routeHandler = handler;

  const onHashOrPop = () => {
    if (typeof routeHandler === 'function') {
      const parsed = parseRoute();
      routeHandler(parsed);
    }
  };

  window.addEventListener('hashchange', onHashOrPop);
  window.addEventListener('popstate', onHashOrPop);

  // Return function to execute current route
  return () => onHashOrPop();
}
