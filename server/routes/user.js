import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Please login.' });
};

// Get current user profile
router.get('/profile', isAuthenticated, (req, res) => {
  res.json({ 
    success: true,
    user: req.user 
  });
});

// Update user profile
router.put('/profile', isAuthenticated, async (req, res) => {
  try {
    const { name, picture } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (picture) updateData.picture = picture;
    
    // Update user in database
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.json({ 
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update profile' 
    });
  }
});

// Get all users (admin only - for demo purposes)
router.get('/all', isAuthenticated, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ 
      success: true,
      count: users.length,
      users 
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users' 
    });
  }
});

// Delete user account
router.delete('/account', isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed after deletion' });
      }
      res.json({ 
        success: true,
        message: 'Account deleted successfully' 
      });
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete account' 
    });
  }
});

export default router;
