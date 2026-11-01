import { API_URL } from '../constants.js';

/**
 * Standard API request wrapper.
 * Ensures credentials: 'include', JSON formatting, and unified error handling.
 */
export async function request(endpoint, { method = 'GET', body, headers = {}, ...customOptions } = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  const reqHeaders = { ...headers };

  let reqBody = body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    reqHeaders['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }

  const options = {
    method,
    headers: reqHeaders,
    credentials: 'include',
    body: reqBody,
    ...customOptions,
  };

  try {
    const res = await fetch(url, options);
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => ({}));
    } else {
      data = await res.text().catch(() => '');
    }

    if (!res.ok || (data && typeof data === 'object' && data.success === false)) {
      const errMessage =
        data?.errors?.[0]?.message ||
        data?.message ||
        `HTTP error ${res.status}`;
      const err = new Error(errMessage);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (!err.status && err.name === 'TypeError') {
      err.message = 'Network error — please check your connection';
    }
    throw err;
  }
}

/* ============================ Domain API modules ============================ */

export const authApi = {
  register: (payload) =>
    request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) =>
    request('/auth/login', { method: 'POST', body: payload }),
  logout: () =>
    request('/auth/logout', { method: 'POST' }).catch(() => ({})),
  forgotPassword: (email) =>
    request('/auth/forgotpassword', { method: 'POST', body: { email } }),
  resetPassword: (token, password) =>
    request(`/auth/resetpassword/${token}`, { method: 'PUT', body: { password } }),
  verifyEmail: (token) =>
    request(`/auth/verify-email/${token}`),
};

export const userApi = {
  checkUsername: (username) =>
    request(`/user/username-available?username=${encodeURIComponent(username)}`),
  updateProfile: (data) =>
    request('/user/profile', { method: 'PUT', body: data }),
  getProfile: (username) =>
    request(`/user/profile/${encodeURIComponent(username)}`),
  getUserPosts: (username) =>
    request(`/posts/user/${encodeURIComponent(username)}`),
  search: (query) =>
    request(`/user/search?query=${encodeURIComponent(query)}`),
  getSuggested: () =>
    request('/user/suggested'),
  toggleFollow: (userId) =>
    request(`/user/follow/${userId}`, { method: 'POST' }),
  toggleBlock: (userId) =>
    request(`/user/block/${userId}`, { method: 'POST' }),
  reportUser: (userId, reason) =>
    request(`/user/report/${userId}`, { method: 'POST', body: { reason } }),
  updatePrivacy: (settings) =>
    request('/user/privacy', { method: 'PUT', body: settings }),
  getUserChatInfo: (userId) =>
    request(`/user/info/${userId}`),
};

export const postApi = {
  getFeed: (page = 1, limit = 10) =>
    request(`/posts/feed?page=${page}&limit=${limit}`),
  getPost: (postId) =>
    request(`/posts/${postId}`),
  createPost: (formData) =>
    request('/posts', { method: 'POST', body: formData }),
  updateCaption: (postId, caption) =>
    request(`/posts/${postId}`, { method: 'PUT', body: { caption } }),
  deletePost: (postId) =>
    request(`/posts/${postId}`, { method: 'DELETE' }),
  toggleLike: (postId) =>
    request(`/posts/like/${postId}`, { method: 'POST' }),
  getLikes: (postId) =>
    request(`/posts/${postId}/likes`),
  toggleSave: (postId) =>
    request(`/posts/save/${postId}`, { method: 'POST' }),
  getSavedPosts: () =>
    request('/posts/saved'),
};

export const commentApi = {
  getComments: (postId) =>
    request(`/comments/${postId}`),
  addComment: (postId, text, parentId = null) =>
    request(`/comments/${postId}`, { method: 'POST', body: { text, ...(parentId ? { parentId } : {}) } }),
  deleteComment: (commentId) =>
    request(`/comments/${commentId}`, { method: 'DELETE' }),
  toggleLike: (commentId) =>
    request(`/comments/like/${commentId}`, { method: 'POST' }),
};

export const storyApi = {
  getActiveStories: () =>
    request('/stories/active'),
  createStory: (formData) =>
    request('/stories', { method: 'POST', body: formData }),
  markViewed: (storyId) =>
    request(`/stories/view/${storyId}`, { method: 'POST' }),
  deleteStory: (storyId) =>
    request(`/stories/${storyId}`, { method: 'DELETE' }),
};

export const notificationApi = {
  getNotifications: () =>
    request('/notifications'),
  markAllRead: () =>
    request('/notifications/read', { method: 'PUT' }),
  markRead: (id) =>
    request(`/notifications/${id}/read`, { method: 'PUT' }),
  deleteNotification: (id) =>
    request(`/notifications/${id}`, { method: 'DELETE' }),
};

export const messageApi = {
  getConversations: () =>
    request('/messages/conversations'),
  getMessages: (conversationId, { before, limit } = {}) => {
    let url = `/messages/${conversationId}`;
    const params = new URLSearchParams();
    if (before) params.append('before', before);
    if (limit) params.append('limit', limit);
    if (params.toString()) url += `?${params.toString()}`;
    return request(url);
  },
  sendMessage: ({
    receiverId,
    conversationId,
    text,
    mediaFile,
    replyTo,
    isForwarded,
    voiceDuration,
    callDetails,
    fileName,
    fileSize,
  }) => {
    if (mediaFile) {
      const formData = new FormData();
      if (receiverId) formData.append('receiverId', receiverId);
      if (conversationId) formData.append('conversationId', conversationId);
      if (text) formData.append('text', text);
      formData.append('media', mediaFile);
      if (replyTo) formData.append('replyTo', JSON.stringify(replyTo));
      if (isForwarded) formData.append('isForwarded', 'true');
      if (voiceDuration) formData.append('voiceDuration', String(voiceDuration));
      if (fileName) formData.append('fileName', fileName);
      if (fileSize) formData.append('fileSize', fileSize);
      return request('/messages', { method: 'POST', body: formData });
    }
    return request('/messages', {
      method: 'POST',
      body: {
        ...(receiverId ? { receiverId } : {}),
        ...(conversationId ? { conversationId } : {}),
        text,
        replyTo,
        isForwarded,
        voiceDuration,
        callDetails,
        fileName,
        fileSize,
      },
    });
  },
  markRead: (conversationId) =>
    request(`/messages/${conversationId}/read`, { method: 'PUT' }),
  editMessage: (messageId, text) =>
    request(`/messages/${messageId}`, { method: 'PUT', body: { text } }),
  deleteMessage: (messageId, deleteFor = 'me') =>
    request(`/messages/${messageId}?deleteFor=${encodeURIComponent(deleteFor)}`, { method: 'DELETE' }),
  reactToMessage: (messageId, emoji) =>
    request(`/messages/${messageId}/react`, { method: 'POST', body: { emoji } }),
  updateSettings: (conversationId, settings) =>
    request(`/messages/conversations/${conversationId}/settings`, { method: 'PUT', body: settings }),
  getSharedMedia: (conversationId) =>
    request(`/messages/conversations/${conversationId}/media`),
};
