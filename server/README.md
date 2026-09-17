# vlove Server

Backend server for vlove application with Google OAuth authentication.

## Features

- 🔐 Google OAuth 2.0 Authentication
- 🚀 Express.js REST API
- 🔒 Session management
- 👤 User profile management
- 🌐 CORS enabled

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
- PORT
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- CALLBACK_URL
- SESSION_SECRET
- CLIENT_URL

3. Start the server:

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## API Endpoints

### Authentication
- `GET /auth/google` - Initiate Google OAuth flow
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/logout` - Logout user
- `GET /auth/status` - Check authentication status

### User
- `GET /api/user/profile` - Get current user profile (protected)
- `PUT /api/user/profile` - Update user profile (protected)

## Environment Variables

| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 5000) |
| GOOGLE_CLIENT_ID | Google OAuth Client ID |
| GOOGLE_CLIENT_SECRET | Google OAuth Client Secret |
| CALLBACK_URL | OAuth callback URL |
| SESSION_SECRET | Session secret key |
| CLIENT_URL | Frontend client URL |
| MONGODB_URI | MongoDB connection string (optional) |

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - http://localhost:5000/auth/google/callback
6. Copy Client ID and Client Secret to `.env`

## Security Notes

- Never commit `.env` file to version control
- Change SESSION_SECRET in production
- Use HTTPS in production
- Enable secure cookies in production

## Tech Stack

- Node.js
- Express.js
- Passport.js
- Google OAuth 2.0
- Express Session
