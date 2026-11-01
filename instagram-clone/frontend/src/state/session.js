const SESSION_KEY = 'velove_user';

let currentUser = null;

/**
 * Loads current user from sessionStorage.
 */
export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    currentUser = raw ? JSON.parse(raw) : null;
  } catch {
    currentUser = null;
  }
  return currentUser;
}

/**
 * Saves or replaces the current user in memory and sessionStorage.
 */
export function saveSession(user) {
  currentUser = user;
  try {
    if (user) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch (err) {
    console.error('Failed to write session:', err);
  }
  return currentUser;
}

/**
 * Updates partial user fields in the active session.
 */
export function updateSessionUser(fields) {
  const current = getSessionUser() || {};
  const updated = { ...current, ...fields };
  return saveSession(updated);
}

/**
 * Clears active session data.
 */
export function clearSession() {
  currentUser = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Gets currently authenticated user.
 */
export function getSessionUser() {
  if (!currentUser) {
    loadSession();
  }
  return currentUser;
}

/**
 * Returns true if a user session is active.
 */
export function isAuthenticated() {
  const u = getSessionUser();
  return Boolean(u && (u._id || u.username));
}
