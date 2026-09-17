import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists in database
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        // Check if email already exists (user might have signed up with email/password)
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Update existing user with Google info
          user.googleId = profile.id;
          user.provider = 'google';
          user.picture = profile.photos[0].value;
          user.isVerified = true;
          user.lastLogin = new Date();
          await user.save();
          console.log('✅ User linked with Google:', user.email);
        } else {
          // Create new user
          user = await User.create({
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            picture: profile.photos[0].value,
            provider: 'google',
            isVerified: true,
            lastLogin: new Date()
          });
          console.log('✅ New Google user created:', user.email);
        }
      } else {
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        console.log('✅ Google user logged in:', user.email);
      }
      
      return done(null, user);
    } catch (error) {
      console.error('❌ Google OAuth error:', error);
      return done(error, null);
    }
  }
));

// Serialize user - store user ID in session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user - retrieve user from database by ID
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
