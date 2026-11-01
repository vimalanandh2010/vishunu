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
    // Select only the following array — no need to load the full User document
    const user = await User.findById(req.user.id).select('following').lean();
    const followingUsers = [...(user?.following || []), req.user.id];

    // Find stories (since TTL is active, expired stories are auto-deleted by MongoDB)
    const stories = await Story.find({ user: { $in: followingUsers } })
      .populate('user', 'username avatar fullName')
      .sort({ createdAt: 1 })
      .lean();

    // Group stories by user for easier client mapping
    const currentUserId = req.user.id;
    const grouped = {};
    stories.forEach((story) => {
      const uId = story.user._id.toString();
      if (!grouped[uId]) {
        grouped[uId] = {
          user: story.user,
          stories: [],
          hasUnviewed: false,
        };
      }
      const isViewed = (story.views || []).some((v) => v.toString() === currentUserId);
      if (!isViewed) {
        grouped[uId].hasUnviewed = true;
      }
      grouped[uId].stories.push({
        _id: story._id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        viewsCount: (story.views || []).length,
        isViewed,
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

    await Story.updateOne({ _id: story._id }, { $addToSet: { views: req.user.id } });

    res.json({ success: true, message: 'Story marked as viewed' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a story
// @route   DELETE /api/stories/:id
// @access  Private
export const deleteStory = async (req, res, next) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found or expired' });
    }

    if (story.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this story' });
    }

    await story.deleteOne();
    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (error) {
    next(error);
  }
};
