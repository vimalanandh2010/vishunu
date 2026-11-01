import http from 'http';

const BASE_URL = 'http://localhost:5000';

// Helper to make HTTP requests
function request(path, { method = 'GET', body, headers = {}, cookie = '' } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    if (cookie) reqHeaders['Cookie'] = cookie;

    let payload = null;
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      { method, headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          const setCookie = res.headers['set-cookie'];
          resolve({ status: res.status, statusCode: res.statusCode, data: parsed, cookies: setCookie });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function extractTokenCookie(cookies) {
  if (!cookies) return '';
  for (const c of cookies) {
    if (c.startsWith('token=')) {
      return c.split(';')[0];
    }
  }
  return '';
}

async function runTests() {
  console.log('--- STARTING BACKEND ARCHITECTURE & RELIABILITY TEST SUITE ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    console.log('1. Health Check & Root:');
    const health = await request('/');
    assert(health.statusCode === 200 && health.data.status === 'ok', 'Health check returns status ok (200)');

    // 2. Authentication Protection
    console.log('\n2. Authentication Protection (401 Unauthorized):');
    const unauthedMe = await request('/api/auth/me');
    assert(unauthedMe.statusCode === 401 && unauthedMe.data.success === false, 'GET /api/auth/me returns 401 without token');

    const unauthedFeed = await request('/api/posts/feed');
    assert(unauthedFeed.statusCode === 401, 'GET /api/posts/feed returns 401 without token');

    // 3. User A & User B creation / login
    console.log('\n3. User Registration & Session:');
    const ts = Date.now();
    const userAData = {
      username: `user_a_${ts}`,
      email: `user_a_${ts}@test.com`,
      fullName: 'User A',
      password: 'Password123!',
    };
    const regA = await request('/api/auth/register', { method: 'POST', body: userAData });
    assert(regA.statusCode === 201 && regA.data.success === true, 'User A registered successfully');
    const cookieA = extractTokenCookie(regA.cookies);
    const userAId = regA.data.user._id;
    assert(Boolean(cookieA), 'Token cookie issued for User A');

    const userBData = {
      username: `user_b_${ts}`,
      email: `user_b_${ts}@test.com`,
      fullName: 'User B',
      password: 'Password123!',
    };
    const regB = await request('/api/auth/register', { method: 'POST', body: userBData });
    assert(regB.statusCode === 201 && regB.data.success === true, 'User B registered successfully');
    const cookieB = extractTokenCookie(regB.cookies);
    const userBId = regB.data.user._id;

    // 4. Input Validation & Schema Checks
    console.log('\n4. Input Validation & Parameter Sanitization:');
    const invalidReg = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'a', email: 'notanemail', password: '123' },
    });
    assert(invalidReg.statusCode === 400 && invalidReg.data.errors?.length > 0, 'Invalid registration payload rejected with 400 and validation errors list');

    // Check invalid ObjectId handling
    const invalidIdPost = await request('/api/posts/not-a-valid-object-id', { cookie: cookieA });
    assert(invalidIdPost.statusCode === 400 && invalidIdPost.data.message.includes('Invalid'), 'Malformed ObjectId rejected with 400 before DB query');

    // Check missing resource
    const missingPost = await request('/api/posts/507f1f77bcf86cd799439011', { cookie: cookieA });
    assert(missingPost.statusCode === 404, 'Non-existent post returns 404 Not Found');

    // 5. Post creation & comment validation
    console.log('\n5. Content Operations & Validation:');
    // Create a post for User A via mock multipart boundary
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const postBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="caption"',
      '',
      'Hello from automated test post!',
      `--${boundary}`,
      'Content-Disposition: form-data; name="media"; filename="test.png"',
      'Content-Type: image/png',
      '',
      'fakepngcontent',
      `--${boundary}--`,
    ].join('\r\n');

    const createPostRes = await new Promise((resolve) => {
      const req = http.request(
        new URL('/api/posts', BASE_URL),
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Cookie': cookieA,
            'Content-Length': Buffer.byteLength(postBody),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(data) }));
        }
      );
      req.write(postBody);
      req.end();
    });

    assert(createPostRes.statusCode === 201 && createPostRes.data.success, 'User A created post successfully');
    const postId = createPostRes.data.post?._id;

    // Validate comment: empty comment rejection
    const emptyComment = await request(`/api/comments/${postId}`, {
      method: 'POST',
      body: { text: '' },
      cookie: cookieB,
    });
    assert(emptyComment.statusCode === 400, 'Empty comment rejected with 400 validation error');

    // Valid comment by User B
    const validComment = await request(`/api/comments/${postId}`, {
      method: 'POST',
      body: { text: 'Great test post!' },
      cookie: cookieB,
    });
    assert(validComment.statusCode === 201 && validComment.data.comment?.text === 'Great test post!', 'User B added valid comment');

    // 6. Authorization checks (403 Forbidden)
    console.log('\n6. Authorization Checks (403 Forbidden):');
    // User B attempts to edit User A's post
    const forbiddenEdit = await request(`/api/posts/${postId}`, {
      method: 'PUT',
      body: { caption: 'Hacked caption!' },
      cookie: cookieB,
    });
    assert(forbiddenEdit.statusCode === 403, 'User B editing User A post returns 403 Forbidden');

    // User B attempts to delete User A's post
    const forbiddenDelete = await request(`/api/posts/${postId}`, {
      method: 'DELETE',
      cookie: cookieB,
    });
    assert(forbiddenDelete.statusCode === 403, 'User B deleting User A post returns 403 Forbidden');

    // 7. Atomic Concurrency & Idempotency
    console.log('\n7. Atomic Concurrency & Idempotency:');
    // Run two concurrent likes on User A's post from User B
    const [like1, like2] = await Promise.all([
      request(`/api/posts/like/${postId}`, { method: 'POST', cookie: cookieB }),
      request(`/api/posts/like/${postId}`, { method: 'POST', cookie: cookieB }),
    ]);
    const postDetailAfterLike = await request(`/api/posts/${postId}`, { cookie: cookieA });
    assert(
      postDetailAfterLike.data.post?.likes?.length === 1,
      'Concurrent like requests do not duplicate like entries (count is exactly 1)'
    );

    // Follow User A by User B
    const userAProfile = await request(`/api/user/profile/${userAData.username}`, { cookie: cookieB });
    assert(userAProfile.data.profile?._id === userAId, 'User A profile retrieved successfully');

    const followRes = await request(`/api/user/follow/${userAId}`, { method: 'POST', cookie: cookieB });
    assert(followRes.statusCode === 200 && followRes.data.isFollowing === true, 'User B follows User A atomically');

    // 8. Bookmarks & Saved Posts
    console.log('\n8. Bookmarks & Saved Posts:');
    const saveRes1 = await request(`/api/posts/save/${postId}`, { method: 'POST', cookie: cookieB });
    assert(saveRes1.statusCode === 200 && saveRes1.data.isSaved === true, 'User B saves post (isSaved: true)');

    const savedPostsRes = await request('/api/posts/saved', { cookie: cookieB });
    assert(
      savedPostsRes.statusCode === 200 &&
      Array.isArray(savedPostsRes.data.posts) &&
      savedPostsRes.data.posts.some((p) => p._id === postId),
      'GET /api/posts/saved returns bookmarked post'
    );

    const unsaveRes = await request(`/api/posts/save/${postId}`, { method: 'POST', cookie: cookieB });
    assert(unsaveRes.statusCode === 200 && unsaveRes.data.isSaved === false, 'User B unsaves post (isSaved: false)');

    const savedPostsResAfter = await request('/api/posts/saved', { cookie: cookieB });
    assert(
      savedPostsResAfter.statusCode === 200 &&
      !savedPostsResAfter.data.posts.some((p) => p._id === postId),
      'GET /api/posts/saved confirms post removed'
    );

    // Re-save post for further profile checks
    await request(`/api/posts/save/${postId}`, { method: 'POST', cookie: cookieB });

    // Check feed pagination bounds
    console.log('\n9. Feed Pagination Bounds:');
    const feedRes = await request('/api/posts/feed?page=1&limit=10', { cookie: cookieB });
    assert(feedRes.statusCode === 200 && Array.isArray(feedRes.data.posts), 'GET /api/posts/feed returns paginated post list');

    // 10. Stories Lifecycle & Permissions
    console.log('\n10. Stories Lifecycle & Permissions:');
    // User A uploads a story
    const storyBoundary = '----WebKitFormBoundaryStoryUpload123';
    const storyPayload = [
      `--${storyBoundary}`,
      'Content-Disposition: form-data; name="media"; filename="story.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fake-jpeg-data',
      `--${storyBoundary}--`,
    ].join('\r\n');

    const createStoryRes = await new Promise((resolve) => {
      const req = http.request(
        new URL('/api/stories', BASE_URL),
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${storyBoundary}`,
            'Cookie': cookieA,
            'Content-Length': Buffer.byteLength(storyPayload),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(data) }));
        }
      );
      req.write(storyPayload);
      req.end();
    });

    assert(createStoryRes.statusCode === 201 && createStoryRes.data.success === true, 'User A creates story (201 Created)');
    const storyId = createStoryRes.data.story?._id;

    // User B fetches active stories (User B follows User A)
    const activeStoriesRes = await request('/api/stories/active', { cookie: cookieB });
    assert(
      activeStoriesRes.statusCode === 200 &&
      Array.isArray(activeStoriesRes.data.groupedStories) &&
      activeStoriesRes.data.groupedStories.some((g) => g.stories?.some((s) => s._id === storyId)),
      'User B retrieves active stories containing User A story'
    );

    // User B marks story as viewed
    const markViewRes = await request(`/api/stories/view/${storyId}`, { method: 'POST', cookie: cookieB });
    assert(markViewRes.statusCode === 200 && markViewRes.data.success === true, 'User B marks story as viewed (200 OK)');

    // Verify story now reports isViewed: true for User B
    const activeStoriesAfterView = await request('/api/stories/active', { cookie: cookieB });
    const userAStoryGroup = activeStoriesAfterView.data.groupedStories.find((g) =>
      g.stories?.some((s) => s._id === storyId)
    );
    const storyItem = userAStoryGroup?.stories?.find((s) => s._id === storyId);
    assert(storyItem?.isViewed === true, 'Active stories correctly indicates isViewed: true for User B');

    // User B attempts to delete User A's story (403 Forbidden)
    const forbiddenStoryDelete = await request(`/api/stories/${storyId}`, { method: 'DELETE', cookie: cookieB });
    assert(forbiddenStoryDelete.statusCode === 403, 'User B deleting User A story returns 403 Forbidden');

    // User A deletes their own story (200 OK)
    const ownStoryDelete = await request(`/api/stories/${storyId}`, { method: 'DELETE', cookie: cookieA });
    assert(ownStoryDelete.statusCode === 200 && ownStoryDelete.data.success === true, 'User A deletes own story (200 OK)');

    // Deleted story returns 404
    const deletedStoryCheck = await request(`/api/stories/view/${storyId}`, { method: 'POST', cookie: cookieB });
    assert(deletedStoryCheck.statusCode === 404, 'Accessing deleted story returns 404 Not Found');

    // 11. Notifications Center Lifecycle & Authorization
    console.log('\n11. Notifications Center Lifecycle & Authorization:');
    const notifsRes = await request('/api/notifications', { cookie: cookieA });
    assert(
      notifsRes.statusCode === 200 &&
      Array.isArray(notifsRes.data.notifications) &&
      notifsRes.data.notifications.length > 0 &&
      notifsRes.data.unreadCount > 0,
      'User A retrieves notifications from User B interactions with positive unreadCount'
    );

    const firstNotif = notifsRes.data.notifications[0];
    const notifId = firstNotif._id;

    // Mark single notification as read
    const markOneRes = await request(`/api/notifications/${notifId}/read`, { method: 'PUT', cookie: cookieA });
    assert(markOneRes.statusCode === 200 && markOneRes.data.success === true, 'Mark single notification as read (200 OK)');

    // Mark all notifications as read
    const markAllRes = await request('/api/notifications/read', { method: 'PUT', cookie: cookieA });
    assert(markAllRes.statusCode === 200 && markAllRes.data.success === true, 'Mark all notifications as read (200 OK)');

    const notifsAfterAllRead = await request('/api/notifications', { cookie: cookieA });
    assert(notifsAfterAllRead.data.unreadCount === 0, 'Notifications unreadCount is now 0');

    // User B attempts to delete User A's notification (403 Forbidden)
    const forbiddenNotifDelete = await request(`/api/notifications/${notifId}`, { method: 'DELETE', cookie: cookieB });
    assert(forbiddenNotifDelete.statusCode === 403, 'User B deleting User A notification returns 403 Forbidden');

    // User A deletes notification (200 OK)
    const ownNotifDelete = await request(`/api/notifications/${notifId}`, { method: 'DELETE', cookie: cookieA });
    assert(ownNotifDelete.statusCode === 200 && ownNotifDelete.data.success === true, 'User A deletes notification (200 OK)');

    // Deleting non-existent notification returns 404
    const notFoundNotifDelete = await request(`/api/notifications/${notifId}`, { method: 'DELETE', cookie: cookieA });
    assert(notFoundNotifDelete.statusCode === 404, 'Deleting already-deleted notification returns 404 Not Found');

    // 12. Threaded Comments & Replies Lifecycle
    console.log('\n12. Threaded Comments & Replies Lifecycle:');
    // User B adds top-level comment to User A's post
    const commentRes = await request(`/api/comments/${postId}`, {
      method: 'POST',
      body: { text: 'Incredible post!' },
      cookie: cookieB,
    });
    assert(
      commentRes.statusCode === 201 &&
      commentRes.data.success === true &&
      commentRes.data.comment.text === 'Incredible post!' &&
      !commentRes.data.comment.parent,
      'User B adds top-level comment to User A post (201 Created)'
    );

    const rootCommentId = commentRes.data.comment._id;

    // User A replies to User B's comment
    const replyRes = await request(`/api/comments/${postId}`, {
      method: 'POST',
      body: { text: 'Thank you @' + userBData.username + '!', parentId: rootCommentId },
      cookie: cookieA,
    });
    assert(
      replyRes.statusCode === 201 &&
      replyRes.data.success === true &&
      replyRes.data.comment.parent === rootCommentId,
      'User A replies to User B comment with parentId (201 Created)'
    );

    const replyCommentId = replyRes.data.comment._id;

    // Replying with non-existent parentId returns 404
    const notFoundParentRes = await request(`/api/comments/${postId}`, {
      method: 'POST',
      body: { text: 'Orphan reply', parentId: '507f1f77bcf86cd799439011' },
      cookie: cookieB,
    });
    assert(notFoundParentRes.statusCode === 404, 'Replying with non-existent parentId returns 404 Not Found');

    // Replying with invalid mongoId returns 400
    const invalidParentRes = await request(`/api/comments/${postId}`, {
      method: 'POST',
      body: { text: 'Bad reply', parentId: 'not-an-id' },
      cookie: cookieB,
    });
    assert(invalidParentRes.statusCode === 400, 'Replying with invalid parentId format returns 400 Bad Request');

    // User B receives reply notification from User A
    const userBNotifs = await request('/api/notifications', { cookie: cookieB });
    const replyNotif = userBNotifs.data.notifications.find(
      (n) => n.type === 'comment' && n.comment?._id === replyCommentId
    );
    assert(!!replyNotif, 'User B receives comment notification for reply from User A');

    // User B likes User A's reply
    const likeCommentRes = await request(`/api/comments/like/${replyCommentId}`, {
      method: 'POST',
      cookie: cookieB,
    });
    assert(
      likeCommentRes.statusCode === 200 &&
      likeCommentRes.data.isLiked === true &&
      likeCommentRes.data.likesCount === 1,
      'User B likes comment (200 OK, isLiked=true, likesCount=1)'
    );

    // User B unlikes User A's reply
    const unlikeCommentRes = await request(`/api/comments/like/${replyCommentId}`, {
      method: 'POST',
      cookie: cookieB,
    });
    assert(
      unlikeCommentRes.statusCode === 200 &&
      unlikeCommentRes.data.isLiked === false &&
      unlikeCommentRes.data.likesCount === 0,
      'User B unlikes comment (200 OK, isLiked=false, likesCount=0)'
    );

    // Unauthorized delete: User B cannot delete User A's reply on post
    // Note: post owner is User A, comment author is User A, User B is neither
    const unauthDeleteRes = await request(`/api/comments/${replyCommentId}`, {
      method: 'DELETE',
      cookie: cookieB,
    });
    assert(unauthDeleteRes.statusCode === 403, 'Unauthorized user cannot delete another user comment (403 Forbidden)');

    // Cascading deletion: User B deletes root comment, which should also delete the child reply
    const deleteRootRes = await request(`/api/comments/${rootCommentId}`, {
      method: 'DELETE',
      cookie: cookieB,
    });
    assert(deleteRootRes.statusCode === 200, 'User B deletes root comment (200 OK)');

    // Verify post comments list is now empty (both root and reply removed)
    const commentsListRes = await request(`/api/comments/${postId}`, { cookie: cookieA });
    assert(
      commentsListRes.statusCode === 200 &&
      Array.isArray(commentsListRes.data.comments) &&
      !commentsListRes.data.comments.some((c) => c._id === rootCommentId || c._id === replyCommentId),
      'Cascading deletion removed root comment and its threaded reply'
    );

    // 13. Direct Messaging & Real-Time Read Receipts Lifecycle
    console.log('\n13. Direct Messaging & Real-Time Read Receipts Lifecycle:');

    // Validation: messaging oneself is rejected
    const selfMsgRes = await request('/api/messages', {
      method: 'POST',
      body: { receiverId: userAId, text: 'Self message' },
      cookie: cookieA,
    });
    assert(selfMsgRes.statusCode === 400, 'Messaging oneself returns 400 Bad Request');

    // Validation: empty message without media is rejected
    const emptyMsgRes = await request('/api/messages', {
      method: 'POST',
      body: { receiverId: userBId, text: '   ' },
      cookie: cookieA,
    });
    assert(emptyMsgRes.statusCode === 400, 'Empty message without media returns 400 Bad Request');

    // User A sends message to User B (initiates conversation)
    const sendMsgRes = await request('/api/messages', {
      method: 'POST',
      body: { receiverId: userBId, text: 'Hello User B!' },
      cookie: cookieA,
    });
    assert(
      sendMsgRes.statusCode === 201 &&
      sendMsgRes.data.success === true &&
      sendMsgRes.data.message.text === 'Hello User B!',
      'User A sends message to User B (201 Created)'
    );

    const convId = sendMsgRes.data.message.conversation;

    // User B fetches conversations and sees 1 unread message
    const userBConvsRes = await request('/api/messages/conversations', { cookie: cookieB });
    const convForB = userBConvsRes.data.conversations.find((c) => String(c._id) === String(convId));
    assert(
      userBConvsRes.statusCode === 200 &&
      convForB &&
      convForB.unreadCount === 1 &&
      convForB.lastMessage.text === 'Hello User B!',
      'User B retrieves conversations with unreadCount: 1'
    );

    // User B reads messages in conversation
    const getMessagesRes = await request(`/api/messages/${convId}`, { cookie: cookieB });
    assert(
      getMessagesRes.statusCode === 200 &&
      Array.isArray(getMessagesRes.data.messages) &&
      getMessagesRes.data.messages.length === 1 &&
      getMessagesRes.data.messages[0].readBy.map((id) => (id._id || id).toString()).includes(userBId),
      'User B retrieves message history and marks as read'
    );

    // User B conversations unreadCount is now 0
    const userBConvsAfterRead = await request('/api/messages/conversations', { cookie: cookieB });
    const convForBAfter = userBConvsAfterRead.data.conversations.find((c) => String(c._id) === String(convId));
    assert(convForBAfter.unreadCount === 0, 'User B conversation unreadCount is now 0');

    // User B replies in existing conversation
    const replyMsgRes = await request('/api/messages', {
      method: 'POST',
      body: { conversationId: convId, text: 'Hey User A! Glad to connect.' },
      cookie: cookieB,
    });
    assert(
      replyMsgRes.statusCode === 201 &&
      replyMsgRes.data.success === true &&
      replyMsgRes.data.message.text === 'Hey User A! Glad to connect.',
      'User B replies in conversation (201 Created)'
    );

    // User A explicitly marks conversation read via PUT endpoint
    const markReadRes = await request(`/api/messages/${convId}/read`, { method: 'PUT', cookie: cookieA });
    assert(markReadRes.statusCode === 200 && markReadRes.data.success === true, 'User A marks conversation as read (200 OK)');

    // Accessing non-existent conversation returns 404
    const notFoundConv = await request('/api/messages/507f1f77bcf86cd799439011', { cookie: cookieA });
    assert(notFoundConv.statusCode === 404, 'Accessing non-existent conversation returns 404 Not Found');

    // Accessing with invalid ID returns 400
    const badConvId = await request('/api/messages/not-valid-id', { cookie: cookieA });
    assert(badConvId.statusCode === 400, 'Accessing with invalid ID format returns 400 Bad Request');

    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n14. Password Recovery & Security Lifecycle:');

    // forgotpassword — missing email field
    const fpNoEmail = await request('/api/auth/forgotpassword', { method: 'POST', body: {} });
    assert(fpNoEmail.statusCode === 400 && Array.isArray(fpNoEmail.data.errors), 'POST /api/auth/forgotpassword rejects missing email with 400 + errors array');

    // forgotpassword — invalid email format
    const fpBadEmail = await request('/api/auth/forgotpassword', { method: 'POST', body: { email: 'not-an-email' } });
    assert(fpBadEmail.statusCode === 400, 'POST /api/auth/forgotpassword rejects invalid email format with 400');

    // forgotpassword — email not in system (uniform 200 to prevent account enumeration)
    const fpUnknown = await request('/api/auth/forgotpassword', { method: 'POST', body: { email: 'ghost@nobody.test' } });
    assert(fpUnknown.statusCode === 200 && fpUnknown.data.success === true, 'POST /api/auth/forgotpassword returns 200 for unknown email (anti-enumeration)');

    // resetpassword — missing password field
    const rpNoBody = await request('/api/auth/resetpassword/sometoken123', { method: 'PUT', body: {} });
    assert(rpNoBody.statusCode === 400 && Array.isArray(rpNoBody.data.errors), 'PUT /api/auth/resetpassword/:token rejects missing password with 400 + errors array');

    // resetpassword — password too short
    const rpShort = await request('/api/auth/resetpassword/sometoken123', { method: 'PUT', body: { password: 'abc' } });
    assert(rpShort.statusCode === 400, 'PUT /api/auth/resetpassword/:token rejects password < 6 chars with 400');

    // resetpassword — invalid/expired token
    const rpBadToken = await request('/api/auth/resetpassword/aaaa1111bbbb2222cccc3333', { method: 'PUT', body: { password: 'newpassword123' } });
    assert(rpBadToken.statusCode === 400, 'PUT /api/auth/resetpassword/:token returns 400 for invalid/expired token');

    // verify-email — invalid token
    const veInvalid = await request('/api/auth/verify-email/invalidtoken999');
    assert(veInvalid.statusCode === 400, 'GET /api/auth/verify-email/:token returns 400 for invalid token');

    // Logout
    console.log('\n15. Clean Logout (Session Invalidation):');
    const logoutRes = await request('/api/auth/logout', { method: 'POST', cookie: cookieA });
    assert(logoutRes.statusCode === 200 && logoutRes.data.success === true, 'POST /api/auth/logout succeeds cleanly');

    console.log(`\n==============================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==============================================\n`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
