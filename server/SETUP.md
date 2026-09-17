# vlove Server Setup Guide

## MongoDB Setup

### Option 1: Local MongoDB (Recommended for Development)

1. **Install MongoDB:**
   - Download from: https://www.mongodb.com/try/download/community
   - Install and start MongoDB service

2. **Verify MongoDB is running:**
   ```bash
   mongosh
   ```

3. **Your connection string is already configured:**
   ```
   mongodb://localhost:27017/vlove
   ```

### Option 2: MongoDB Atlas (Cloud - Free Tier)

1. **Create account:**
   - Go to: https://www.mongodb.com/cloud/atlas
   - Sign up for free

2. **Create a cluster:**
   - Click "Build a Database"
   - Choose FREE tier (M0)
   - Select your region
   - Create cluster

3. **Setup database access:**
   - Go to "Database Access"
   - Add new database user
   - Create username and password

4. **Setup network access:**
   - Go to "Network Access"
   - Add IP Address
   - Click "Allow Access from Anywhere" (0.0.0.0/0)

5. **Get connection string:**
   - Go to "Database"
   - Click "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database password

6. **Update .env file:**
   ```
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/vlove?retryWrites=true&w=majority
   ```

## Installation & Running

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Environment Variables
Make sure your `.env` file has:
```
PORT=5000
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
CALLBACK_URL=http://localhost:5000/auth/google/callback
SESSION_SECRET=vlove_secret_key_change_in_production
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/vlove
```

### 3. Start the Server

**Development mode (with auto-restart):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### 4. Verify Connection

Open your browser and go to: http://localhost:5000

You should see:
```json
{
  "message": "vlove API Server",
  "version": "1.0.0",
  "status": "running",
  "database": "MongoDB connected"
}
```

## Testing the API

### Check Auth Status
```bash
curl http://localhost:5000/auth/status
```

### Test Signup
```bash
curl -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

### Test Google OAuth
Open in browser: http://localhost:5000/auth/google

## Troubleshooting

### MongoDB Connection Error
- Make sure MongoDB is running locally
- Check if port 27017 is available
- Try restarting MongoDB service

### Port Already in Use
```bash
# Kill process on port 5000 (Windows)
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Kill process on port 5000 (Mac/Linux)
lsof -i :5000
kill -9 <PID>
```

### Google OAuth Not Working
- Verify CLIENT_ID and CLIENT_SECRET in .env
- Check authorized redirect URIs in Google Console
- Make sure callback URL matches exactly

## Database Collections

The server will automatically create these collections:
- **users** - User accounts (email/password + Google OAuth)

## Security Notes

⚠️ **Before deploying to production:**
1. Change SESSION_SECRET to a strong random string
2. Install bcrypt and hash passwords: `npm install bcrypt`
3. Enable HTTPS and set `cookie.secure = true`
4. Whitelist specific origins in CORS config
5. Add rate limiting: `npm install express-rate-limit`
6. Add input validation: `npm install express-validator`

## Next Steps

1. Start the server: `npm run dev`
2. Start the frontend: `cd ../client/cupid && npm run dev`
3. Test signup and Google OAuth
4. Check MongoDB Compass or Atlas to see users being created
