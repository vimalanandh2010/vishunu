# VELOVE — Phase 6 Security Review Report

**Date:** 2026-10-18  
**Reviewer:** Kiro (application security review pass)  
**Scope:** `instagram-clone/backend` — all controllers, middleware, models, routes, and configuration  
**Status:** All confirmed findings remediated. Remaining risks documented below.

---

## 1. Findings Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| F-01 | **Critical** | Hardcoded JWT secret fallback | ✅ Fixed |
| F-02 | **High** | No rate limit on password-reset endpoints | ✅ Fixed |
| F-03 | **High** | `urlencoded` body parser had no size limit | ✅ Fixed |
| F-04 | **High** | `.env` missing from backend `.gitignore` | ✅ Fixed |
| F-05 | **Medium** | `website` field accepted arbitrary strings | ✅ Fixed |
| F-06 | **Medium** | `xss-clean` installed but never mounted | ✅ Fixed |
| F-07 | **Medium** | Login rate limit was 100 req/15 min (too loose) | ✅ Fixed |
| F-08 | **Medium** | Socket.io `userId` taken from unauthenticated query string | ✅ Mitigated |
| F-09 | **Low** | `forgotPassword` leaked email existence | ✅ Fixed |
| F-10 | **Low** | `CastError` message leaked raw MongoDB ObjectId | ✅ Fixed |
| F-11 | **Low** | `/uploads` served without authentication | ✅ Accepted & documented |

---

## 2. Detailed Findings and Fixes

### F-01 — CRITICAL: Hardcoded JWT secret fallback
**Confirmed vulnerability.**  
Both `utils/generateToken.js` and `middleware/authMiddleware.js` used  
`process.env.JWT_SECRET || 'your_super_secret_jwt_key_here'` as a fallback.  
Any deployment that omits `JWT_SECRET` silently used a well-known public string,  
allowing an attacker to forge valid tokens for any user ID.

**Fix applied:**
- `generateToken.js`: throws `Error` immediately if `JWT_SECRET` is unset.
- `authMiddleware.js`: reads `JWT_SECRET` at module load time; calls `process.exit(1)` if missing, so the server refuses to start without the secret.
- No fallback string exists anywhere in the codebase.

**Files changed:** `utils/generateToken.js`, `middleware/authMiddleware.js`

---

### F-02 — HIGH: No rate limit on forgot-password / reset-password
**Confirmed vulnerability.**  
`POST /api/auth/forgotpassword` and `PUT /api/auth/resetpassword/:token` had  
no rate limiter, enabling unlimited email-flood and token-enumeration attacks.

**Fix applied:**  
New `passwordResetLimiter` (5 requests / 1 hour / IP) applied to both routes.

**Files changed:** `middleware/rateLimitMiddleware.js`, `routes/authRoutes.js`

---

### F-03 — HIGH: Unlimited urlencoded body size
**Confirmed vulnerability.**  
`express.urlencoded({ extended: true })` had no `limit`, defaulting to 100 kb  
in modern Express but relying on an undocumented default — not explicit policy.  
Combined with the 10 MB JSON limit, a crafted form POST could consume excessive memory.

**Fix applied:** `express.urlencoded({ extended: true, limit: '1mb' })`.

**Files changed:** `server.js`

---

### F-04 — HIGH: `.env` missing from backend `.gitignore`
**Confirmed vulnerability.**  
`instagram-clone/backend/.gitignore` only listed `server.log` and `uploads/`.  
A `git add .` from the backend directory would have committed the live `.env`  
(containing `MONGO_URI`, `JWT_SECRET`, Cloudinary keys, SMTP credentials).

**Fix applied:** Added `.env`, `.env.local`, `.env.production` to the backend `.gitignore`.

**Files changed:** `.gitignore`

---

### F-05 — MEDIUM: `website` field accepted any string
**Confirmed risk.**  
The `updateProfileValidator` trimmed the `website` field but performed no format  
check. A stored `javascript:` URI or other non-HTTP value could be rendered as a  
clickable link on the frontend, enabling stored XSS where the client doesn't  
sanitise `href` values.

**Fix applied:**  
Custom validator using `new URL()` — rejects anything that is not an `http:` or  
`https:` URL; empty string is still accepted to allow clearing the field.

**Files changed:** `utils/validators.js`

---

### F-06 — MEDIUM: `xss-clean` installed but never mounted
**Confirmed gap.**  
`xss-clean` appeared in `package.json` but was not imported or used in  
`server.js`, providing zero actual XSS sanitisation of incoming request bodies.

**Fix applied:** Imported and mounted `xss-clean` after `mongoSanitize` in the middleware chain.

**Files changed:** `server.js`

---

### F-07 — MEDIUM: Login/register rate limit too permissive
**Confirmed risk.**  
`authLimiter` allowed 100 requests per 15 minutes — enough to try ~6 passwords  
per second against a single account before being blocked. Modern credential-stuffing  
tools operate well within that budget.

**Fix applied:**
- `loginLimiter`: 10 requests / 15 min / IP (login and its own route only).
- `registerLimiter`: 5 requests / 1 hour / IP (prevents mass account creation).
- `passwordResetLimiter`: 5 requests / 1 hour / IP (see F-02).
- The old `authLimiter` export is kept as an alias to `loginLimiter` for  
  backward-compat with any future imports.

**Files changed:** `middleware/rateLimitMiddleware.js`, `routes/authRoutes.js`

---

### F-08 — MEDIUM: Socket.io `userId` from unauthenticated query string
**Confirmed risk (mitigated, not fully eliminated).**  
The Socket.io `connection` handler read `socket.handshake.query.userId` without  
validation. A client could supply any string, polluting `global.activeUsers` with  
garbage keys or mapping their socket to another user's ID to receive that user's  
real-time events (new message notifications, typing indicators).

**Fix applied:**
- `userId` is now validated as a 24-character hex string (MongoDB ObjectId format)  
  before being stored in `activeUsers`. Non-conforming values are silently discarded.
- A code comment documents the remaining architectural risk: the socket layer  
  does not verify that the supplied ID matches a real authenticated session.  
  All data-mutating operations remain gated by the HTTP JWT middleware on REST routes.

**Remaining risk:** A user can still map their socket to another user's real ObjectId  
and receive their notifications. Full mitigation requires validating the socket  
connection against a JWT (e.g. passing the cookie during the Socket.io handshake  
and verifying it in an `io.use()` middleware). This is noted in "Remaining Risks" below.

**Files changed:** `server.js`

---

### F-09 — LOW: `forgotPassword` leaked email existence
**Confirmed information disclosure.**  
`POST /api/auth/forgotpassword` returned `404 User not found with that email`  
when the email was not registered, allowing enumeration of which email addresses  
have accounts.

**Fix applied:** Both the "not found" branch and the success branch now return  
the same `200` response: *"If that email is registered, a password reset link has been sent."*

**Files changed:** `controllers/authController.js`

---

### F-10 — LOW: `CastError` leaked raw MongoDB ObjectId
**Confirmed information disclosure.**  
The `errorHandler` returned `Resource not found with id of <raw_value>`, echoing  
user-supplied input back in error responses (minor reflected information leakage).

**Fix applied:** Message simplified to `"Resource not found"` with no dynamic content.

**Files changed:** `middleware/errorMiddleware.js`

---

### F-11 — LOW: `/uploads` served without authentication
**Confirmed, accepted risk.**  
Local-disk uploads are served as static files via `express.static`, making them  
accessible to anyone who knows or guesses the filename. This mirrors the behaviour  
of Cloudinary public URLs.

**Decision:** Accepted. Media on this platform is intended to be viewable; filenames  
are generated as `<timestamp>-<random>`, making casual guessing impractical.  
A code comment has been added to document the decision and the migration path  
(signed Cloudinary URLs or an authenticated `/api` route) for private-account media.

**Files changed:** `server.js` (comment only)

---

## 3. Confirmed Clean Areas

The following areas were inspected and found to have no significant issues:

| Area | Finding |
|------|---------|
| **Password hashing** | bcryptjs with salt factor 10; `select: false` on schema field; `matchPassword` method is correct |
| **JWT cookie flags** | `httpOnly: true`, `sameSite: 'strict'`, `secure` gated on `NODE_ENV === 'production'` |
| **CORS** | Single allowlisted origin from env; `credentials: true` |
| **Helmet** | Mounted as first middleware |
| **mongo-sanitize** | Mounted globally; strips `$` and `.` from all request bodies |
| **Post ownership** | `updatePost` and `deletePost` both check `post.user.toString() !== req.user.id` before acting |
| **Comment ownership** | `deleteComment` allows comment owner OR post owner; correctly checks both |
| **Message authorization** | `getMessages`, `sendMessage`, `markConversationRead` all verify participant membership |
| **Notification ownership** | `markNotificationRead` and `deleteNotification` check `notification.receiver` |
| **Story ownership** | `deleteStory` checks `story.user.toString() !== req.user.id` |
| **ObjectId validation** | `validateObjectId` middleware applied consistently on all routes with `:id` / `:conversationId` |
| **Input validation** | `express-validator` applied on register, login, comment, post, message, profile, and password-reset routes |
| **NoSQL injection** | `mongoSanitize` + `express-validator` type-checking; regex inputs are escaped before use in `searchUsers` |
| **Sensitive fields in responses** | `password` field has `select: false`; API responses explicitly enumerate only safe fields |
| **Error logging** | Stack traces omitted in production (`NODE_ENV === 'production'` guard) |
| **Reset token storage** | Token stored as SHA-256 hash (`createHash('sha256')`), raw token sent by email only |
| **Reset token expiry** | 10-minute TTL enforced via `$gt: Date.now()` on every lookup |
| **Logout** | Cookie overwritten with expired value; no server-side session to invalidate (stateless JWT) |
| **Story TTL** | MongoDB TTL index (`expires: 86400`) handles automatic deletion |
| **Upload MIME filter** | `multer` `fileFilter` restricts to `image/*` and `video/*` MIME types |
| **Upload size** | 15 MB limit enforced in multer config |
| **Environment secrets** | All credentials read from `process.env`; `.env.example` contains only placeholder values |

---

## 4. Remaining Risks (Not Fixed in This Pass)

These are architectural limitations that require more significant changes and are documented here for a future sprint.

### R-01 — Socket.io authentication (Medium)
The Socket.io handshake does not validate a JWT. The current mitigation (ObjectId  
format check) prevents garbage injection but not impersonation. To fully close this,  
add an `io.use()` middleware that verifies the JWT cookie (or an `auth` token passed  
via `socket.io` `auth` option) and attaches the real `userId`.

### R-02 — No account lockout after failed logins (Medium)
IP-based rate limiting is in place, but a distributed attack from many IPs can  
still make many attempts against a single account. A per-account failed-login counter  
with a temporary lock would complement the IP limiter.

### R-03 — Email verification not enforced (Low)
Users can log in and use the full API without verifying their email. The  
`isEmailVerified` field exists but is never checked by `protect` middleware.  
Consider blocking sensitive actions (posting, messaging) for unverified accounts.

### R-04 — Password minimum length is 6 characters (Low)
The current minimum is functional but below current NIST SP 800-63B guidance  
(minimum 8, recommend 15+). Consider raising to 8 and adding a `zxcvbn`-style  
strength check on the client.

### R-05 — No Content-Security-Policy tuning (Low)
Helmet is mounted with its defaults. For production, the CSP header should be  
explicitly configured to allow only the application's own origins and CDN, rather  
than relying on Helmet's permissive defaults.

### R-06 — Token revocation on password change (Low)
After `resetPassword`, existing JWTs remain valid until they expire (30 days).  
Adding a `passwordChangedAt` timestamp to the User model and checking it in  
`protect` would invalidate all tokens issued before a password reset.

### R-07 — Dependency vulnerability scanning (Informational)
`xss-clean` (0.1.4) is unmaintained (last published 2020). It is now wired in and  
functional, but consider replacing it with the actively maintained `sanitize-html`  
or relying solely on strict input validation and output encoding on the client side.  
Run `npm audit` before each release and address any high/critical advisories.

---

## 5. Files Changed in This Review

| File | Change |
|------|--------|
| `middleware/authMiddleware.js` | Removed hardcoded secret fallback; added startup guard |
| `utils/generateToken.js` | Throws on missing `JWT_SECRET` |
| `middleware/rateLimitMiddleware.js` | Added `loginLimiter`, `registerLimiter`, `passwordResetLimiter` |
| `routes/authRoutes.js` | Wired new per-route limiters |
| `server.js` | `urlencoded` limit; mounted `xss-clean`; socket userId validation + comments |
| `utils/validators.js` | URL protocol validation on `website` field |
| `controllers/authController.js` | Uniform `forgotPassword` response |
| `middleware/errorMiddleware.js` | Sanitised `CastError` message |
| `.gitignore` | Added `.env`, `.env.local`, `.env.production` |

---

> **Disclaimer:** This report reflects a point-in-time static review of the source code.  
> It does not substitute for dynamic testing, penetration testing, or ongoing dependency  
> monitoring. No application should be considered completely secure.
