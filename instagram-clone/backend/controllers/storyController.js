import Story from '../models/Story.js';
import User from '../models/User.js';
import { fileUrl } from '../middleware/uploadMiddleware.js';

// @desc    Create a new story
// @route   POST /api/stories
// @access  Private
export const createStory = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image or video for your story' });
    }

    const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    const story = await Story.create({
      user: req.user.id,
      mediaUrl: fileUrl(req, req.file),
      mediaType,
    });

    const populatedStory = await Story.findById(story._id).populate('user', 'username avatar fullName');

    res.status(201).json({ success: true, story: populatedStory });
  } catch (error) {
    next(error);
  }
};

// @desc    Get active stories of self and followed users
// @route   GET /api/stories/active
// @access  Private
export const getActiveStories = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const followingUsers = [...user.following, req.user.id];

    // Find stories (since TTL is active, expired stories are auto-deleted by MongoDB)
    const stories = await Story.find({ user: { $in: followingUsers } })
      .populate('user', 'username avatar fullName')
      .sort({ createdAt: 1 });

    // Group stories by user for easier client mapping
    const grouped = {};
    stories.forEach((story) => {
      const uId = story.user._id.toString();
      if (!grouped[uId]) {
        grouped[uId] = {
          user: story.user,
          stories: [],
        };
      }
      grouped[uId].stories.push({
        _id: story._id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        views: story.views,
        createdAt: story.createdAt,
      });
    });

    res.json({ success: true, count: stories.length, groupedStories: Object.values(grouped) });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark a story as viewed by user
// @route   POST /api/stories/view/:id
// @access  Private
export const markStoryAsViewed = async (req, res, next) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found or expired' });
    }

    if (!story.views.includes(req.user.id)) {
      story.views.push(req.user.id);
      await story.save();
    }

    res.json({ success: true, message: 'Story marked as viewed' });
  } catch (error) {
    next(error);
  }
};
