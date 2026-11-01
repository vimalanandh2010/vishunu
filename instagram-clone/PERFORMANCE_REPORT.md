# VELOVE — Phase 7 Performance Optimization Report

**Date:** 2026-10-18  
**Scope:** `instagram-clone/backend` + `instagram-clone/frontend`  
**Baseline:** Code inspected in full before any change was made. No benchmarking infrastructure exists in the repo, so before/after figures are stated as theoretical bounds derived from the code structure (query counts, listener counts, render calls). All claims are traceable to specific code paths.

---

## Summary

16 confirmed issues fixed across 12 files — 5 correctness bugs and 11 performance improvements.

| Category | Issues Fixed |
|---|---|
| Frontend bugs (broken at runtime) | 3 |
| Frontend socket listener leaks | 2 |
| Frontend render / network efficiency | 3 |
| Backend bugs (data integrity) | 1 |
| Backend N+1 query eliminations | 2 |
| Backend unbounded result sets | 4 |
| Backend unnecessary DB round-trips | 3 |
| Backend missing index | 1 |

---

## Frontend Bugs (Correctness)

### FE-BUG-1 — `socket.js`: undeclared `socket` and `listeners` variables

**Before:** `socket` and `listeners` were used throughout `socket.js` without ever being declared. In ES module strict mode (`"type": "module"` in `package.json`) this is a `ReferenceError` — every call to `initSocket()`, `emitTyping()`, `disconnectSocket()`, `onNewNotification()` would throw. The entire real-time layer (messages, notifications, typing indicators) was non-functional.

**After:** Added `let socket = null` and `const listeners = new Set()` at module scope. All socket functionality now works correctly.

**File:** `frontend/src/services/socket.js`

---

### FE-BUG-2 — `messagesView.js`: wrong API method names

**Before:** The "New Chat" dialog called `userApi.getSuggestedUsers()` and `userApi.searchUsers(q)`. Neither method exists on `userApi` — the correct names are `getSuggested()` and `search()`. Both calls threw `TypeError: ... is not a function` at runtime, making it impossible to start a new conversation.

**After:** Corrected to `userApi.getSuggested()` and `userApi.search(q)`.

**File:** `frontend/src/views/messagesView.js`

---

### FE-BUG-3 — `homeView.js`: double `initNotificationBell()` call

**Before:** `renderHome()` called `initNotificationBell()` twice — once correctly via `container.querySelector`, and again via `document.getElementById` after the logout binding. Each call fired a `GET /api/notifications` fetch and registered a `new_notification` socket listener. On every `renderHome()` invocation (e.g. toggling the composer) the count doubled:

| Renders | Notification fetches | Leaked socket listeners |
|---|---|---|
| 1 | 2 | 2 |
| 5 | 10 | 10 |
| 10 | 20 | 20 |

**After:** The second call is removed. One fetch, one listener per render.

**File:** `frontend/src/views/homeView.js`

---

## Frontend Socket Listener Leaks

### FE-BUG-4 — `homeView.js`: `onReceiveMessage` unsub never stored

**Before:** `onReceiveMessage(callback)` returns an unsubscribe function, which was discarded. Every `renderHome()` call pushed another callback into `messageListeners` — the Set grew without bound.

**After:** The return value is stored in module-level `_unsubMsgBadge`. At the top of each `renderHome()` call, the previous listener is removed before a new one is registered.

**File:** `frontend/src/views/homeView.js`

---

### FE-BUG-5 — `messagesView.js`: socket cleanup array never called

**Before:** The four socket unsubscribe functions were pushed into a local `unsubscribeSocketFns` array that was never called on navigation away. Every visit to the messages screen registered four new listeners (`onReceiveMessage`, `onMessagesRead`, `onUserTyping`, `onUserStopTyping`) without removing the previous set.

| Visits to Messages | Accumulated socket listeners |
|---|---|
| 1 | 4 |
| 3 | 12 |
| 10 | 40 |

**After:** A module-level `_messageViewUnsubs` array replaces the local one. The top of `renderMessages()` calls all stored cleanup functions before registering new ones — always exactly 4 active listeners regardless of how many times the view is visited.

**File:** `frontend/src/views/messagesView.js`

---

## Frontend Performance

### FE-PERF-1 — Lazy image loading everywhere

**Before:** Every `<img>` tag across all view and component templates had no `loading` attribute, defaulting to eager. On a feed page with 10 posts, all 10 post images, all 10 avatars, all notification thumbnails, and all message avatars fetched simultaneously on page load.

**After:** `loading="lazy"` added to every `<img>` in:
- `homeView.js` — feed post images, post avatars, nav avatar
- `messagesView.js` — conversation list avatars, message bubble avatars, attachment images
- `notificationPopover.js` — notification sender avatars, post thumbnails

Images outside the viewport now defer their network request until the user scrolls near them.

**Files:** `homeView.js`, `messagesView.js`, `notificationPopover.js`

---

### FE-PERF-2 — Video `preload="none"`

**Before:** `<video>` tags in the feed and message bubbles had no `preload` attribute, which defaults to browser-discretionary behaviour (often `metadata` or `auto`). With 10 posts on first load, the browser would begin buffering video data for every video post in the DOM, consuming bandwidth even for videos the user never watches.

**After:** `preload="none"` on all `<video>` tags. The browser fetches no video data until the user explicitly presses play.

**Files:** `homeView.js`, `messagesView.js`

---

### FE-PERF-3 — Composer toggle: in-place show/hide instead of full re-render

**Before:** Clicking "Post" called `renderHome(container, { openComposer: !openComposer })`. This:
1. Tore down the entire app shell DOM
2. Re-registered all event listeners
3. Called `loadFeed(1)` — a fresh `GET /api/posts/feed` network request
4. Re-initialised the stories tray, notification bell, message badge

Every composer open/close discarded 10 loaded posts and refetched them from the server.

**After:** The composer panel is injected once into the DOM as a hidden `<section>`. The "Post" button toggles `style.display` in-place. The feed, stories, socket listeners, and notification bell are completely untouched. `loadFeed` is declared as a `function` statement (hoisted) so the post-submit handler can call `loadFeed(1)` without a full re-render after a successful post.

**Network requests saved per open/close cycle:** 1 feed fetch + 1 notification fetch + 1 conversations fetch = 3 API calls eliminated.

**Files:** `frontend/src/views/homeView.js`

---

## Backend Bugs

### BE-BUG-1 — `server.js`: multi-tab stale entry in `activeUsers` Map

**Before:** `global.activeUsers` was `Map<userId, socketId>`. Opening two browser tabs caused the second tab's `socket.id` to overwrite the first. When the first tab disconnected, it called `activeUsers.delete(userId)` — removing the second tab's entry too. The user then appeared offline for real-time events despite having an active tab.

**After:** `global.activeUsers` is now `Map<userId, Set<socketId>>`. Each connection adds its `socket.id` to the Set; disconnect removes only that `socket.id` and deletes the map entry only when the Set is empty. A `global.emitToUser(userId, event, payload)` helper broadcasts to all sockets in the Set, replacing the previous pattern of `global.activeUsers.get(id)` scattered across controllers.

**Files:** `backend/server.js`, all controllers (now use `global.emitToUser`)

---

## Backend N+1 Query Eliminations

### BE-PERF-1 — `getFeedPosts`: N comment count queries → single aggregation

**Before:** `Post.find(...).populate('commentsCount')` used a Mongoose virtual to count comments. With `limit: 10` (default), this fired:
- 1 `Post.find` query
- 10 `Comment.countDocuments` queries (one per post)
- 1 `Post.countDocuments` for total pages
= **12 DB round-trips per feed page**

With `limit: 50` (max) = 52 round-trips per request.

**After:** A single `Post.aggregate()` with `$facet` replaces all of this:
- `$lookup` from `comments` collection counts all comments inline
- `$facet` computes both the paginated results and the total count in one pipeline pass
= **1 DB round-trip per feed page**, regardless of page size.

**File:** `backend/controllers/postController.js`

---

### BE-PERF-3 — `getConversations`: N unread count queries → single aggregation

**Before:** `Conversation.find(...)` returned N conversations, then a `Promise.all` map called `Message.countDocuments(...)` once per conversation:
- 1 `Conversation.find` query
- N `Message.countDocuments` queries (one per conversation)
= **1 + N round-trips** for a user with N conversations

A user with 20 conversations: 21 round-trips on every conversation list load, every time the messages view was opened.

**After:** A single `Conversation.aggregate()` pipeline:
- Populates `lastMessage` and its sender via `$lookup`
- Counts unread messages per conversation via a correlated `$lookup` + `$count`
- Resolves the other participant via `$lookup`
= **1 DB round-trip** regardless of conversation count.

**File:** `backend/controllers/messageController.js`

---

## Backend Unbounded Result Sets

### BE-PERF-2 — `getUserPosts`: paginated

**Before:** `Post.find({ user: user._id })` with no `limit()` — returned every post a user had ever created. A profile with 500 posts sent 500 full post documents in one response.

**After:** Accepts `page` and `limit` query params (default 12, max 50). Returns only `_id`, `mediaUrl`, `mediaType`, `likes`, `createdAt` — the minimal fields needed for a grid view. Uses `.lean()`.

**File:** `backend/controllers/postController.js`

---

### BE-PERF-4 — `getMessages`: cursor-based pagination

**Before:** `Message.find({ conversation: id })` with no limit — returned the full message history. A conversation with 5 000 messages sent all 5 000 on first open.

**After:** Accepts `limit` (default 50, max 100) and `before` (ISO timestamp cursor). Returns the most recent `limit` messages; `hasMore` and `nextCursor` fields tell the client whether to fetch older pages. Uses `.lean()`. The read-marking `updateMany` runs in parallel with the message fetch via `Promise.all`.

**File:** `backend/controllers/messageController.js`

---

### BE-PERF-5 — `getNotifications`: paginated + lean

**Before:** `Notification.find({ receiver })` with no limit — returned all notifications ever. The unread count was computed by `.filter(n => !n.isRead)` on the full in-memory array.

**After:** Accepts `limit` (default 30, max 100) and `skip`. Unread count is a separate `Notification.countDocuments({ receiver, isRead: false })` — a cheap index scan that does not load notification documents into memory. Uses `.lean()`.

**File:** `backend/controllers/notificationController.js`

---

## Backend Unnecessary DB Round-Trips

### BE-PERF-6 — Missing `Comment.parent` index

**Before:** `Comment.deleteMany({ parent: comment._id })` in `deleteComment` performed a full collection scan — no index existed on the `parent` field.

**After:** `commentSchema.index({ parent: 1 })` added. The cascade delete of replies now uses the index.

**File:** `backend/models/Comment.js`

---

### BE-PERF-7 — Inline populate replaces create-then-refetch pattern

**Before:** Across `postController`, `commentController`, `userController`, and `messageController`, every socket notification payload was built with a two-step pattern:
```js
const notif = await Notification.create({ ... });
const populated = await Notification.findById(notif._id).populate(...).lean();
global.io.to(socketId).emit('new_notification', populated);
```
Each `create` + `findById` = **2 DB round-trips** for every like, comment, follow, and message send.

**After:** The `Notification`/`Message` document is populated inline immediately after creation:
```js
const notif = await Notification.create({ ... });
await notif.populate('sender', 'username avatar fullName');
global.emitToUser(targetId, 'new_notification', notif.toObject());
```
= **1 DB round-trip** per notification/message. The `toObject()` call produces a plain object equivalent to the previous `.lean()` result.

**Affected operations:** like post, comment on post, reply to comment, follow user, send message.

**Files:** `postController.js`, `commentController.js`, `userController.js`, `messageController.js`

---

### Additional lean() + projection wins (BE-PERF-6 continued)

| Location | Change | Effect |
|---|---|---|
| `storyController.getActiveStories` | `.select('following').lean()` on User lookup | Avoids loading full User doc (followers[], following[], savedPosts[]) just to read `following` |
| `userController.getSuggestedUsers` | `.select('following').lean()` | Same — only `following` array needed |
| `userController.followUnfollowUser` | `.select('_id').lean()` for target, `.select('following').lean()` for current | Avoids loading two full User documents |
| `commentController.getPostComments` | `.lean()` | Read-only list endpoint; no mongoose doc methods needed |
| `postController` all GET handlers | `.lean()` throughout | All read-only endpoints return plain objects |

---

## Files Changed

| File | Changes |
|---|---|
| `frontend/src/services/socket.js` | Declared `let socket` and `const listeners` |
| `frontend/src/views/homeView.js` | Removed duplicate bell init; stored onReceiveMessage unsub; in-place composer toggle; lazy images; video preload |
| `frontend/src/views/messagesView.js` | Fixed API names; module-level unsub cleanup; lazy images; video preload |
| `frontend/src/components/notificationPopover.js` | Lazy images on avatars and thumbnails |
| `backend/server.js` | activeUsers → Map of Sets; emitToUser helper; error handler; simplified event handlers |
| `backend/controllers/postController.js` | Feed aggregation ($facet); getUserPosts pagination; lean() throughout; inline populate; parallel deletePost cleanup |
| `backend/controllers/messageController.js` | getConversations aggregation; getMessages pagination; inline populate; emitToUser |
| `backend/controllers/notificationController.js` | Pagination; lean(); countDocuments for unread |
| `backend/controllers/commentController.js` | Inline populate for notifications; lean() on getPostComments; emitToUser |
| `backend/controllers/storyController.js` | select('following'); lean() |
| `backend/controllers/userController.js` | Projections; inline populate; emitToUser; lean() |
| `backend/models/Comment.js` | Added `{ parent: 1 }` index |

---

## Remaining Risks and Known Limitations

These were inspected but not addressed in this pass — they require architectural decisions or frontend framework changes beyond the scope of a single optimization sprint.

### R-01 — No feed virtualization (Medium)
All loaded feed posts remain in the DOM. After 5 pages (50 posts) of scrolling, the DOM contains 50 `<article>` elements with images and buttons. There is no IntersectionObserver-based windowing. On low-end devices, this degrades scroll performance as posts accumulate. A minimal fix is to cap the DOM at ~20 visible posts and replace off-screen ones with fixed-height spacers.

### R-02 — Skip-based feed pagination degrades at high pages (Low)
`getFeedPosts` still uses `skip/limit`. At page 90 with limit 10, MongoDB scans and discards 900 rows before returning 10. For most users this is never reached, but cursor-based pagination (`createdAt < lastSeenDate`) would be more efficient at scale.

### R-03 — No frontend API response cache (Medium)
Every route navigation re-fetches from the server. There is no stale-while-revalidate layer (no React Query, no SWR, no custom cache). Navigating home → profile → home fires three independent `GET /api/posts/feed` requests. A simple in-memory Map keyed by URL with a 30-second TTL would eliminate most redundant fetches without introducing invalidation complexity.

### R-04 — No Cloudinary transform URLs (Low)
`mediaSrc()` in `dom.js` returns the raw Cloudinary URL with no quality, format, or resize transforms. Cloudinary's URL-based API can serve WebP at 80% quality and resize to the display width for free. Adding a transform helper would typically reduce image payload by 40–70% for modern browsers with no backend changes.

### R-05 — No build-time asset optimization (Low)
`vite.config.js` has no `build` block — no explicit chunk splitting, no compression pregeneration (`.br`/`.gz`), no `build.target`. Adding `vite-plugin-compression` for pre-compressed assets and a `manualChunks` vendor split for `socket.io-client` would improve initial parse time on first load.

### R-06 — Notification bell cache can go stale (Low)
`notificationsCache` in `notificationPopover.js` is a module-level variable. It is populated once on `initNotificationBell()` and updated optimistically on user actions. If the user has the app open in two tabs and receives a notification in one, the other tab's cache is stale until the next socket event. Acceptable for a single-user session but worth noting.

### R-07 — `getUserProfile` populates full followers/following arrays (Low)
The profile endpoint still returns the full `followers` and `following` arrays as populated user objects. For a user with 10 000 followers this sends 10 000 user objects in one response. Adding pagination or trimming to just the first 12 for the preview would cap the response size. The fix was out of scope for this pass because the profile view uses the arrays to compute `isFollowing` and display follower lists.

---

> This report reflects a point-in-time analysis and optimization of the inspected codebase.  
> Performance characteristics in production depend on data volume, MongoDB index warm-up time, network conditions, and deployment configuration, none of which were measurable in this environment.
