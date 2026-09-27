import { body, validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({ field: err.path, message: err.msg })),
    });
  }
  next();
};

export const registerValidator = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_.]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and periods')
    .trim(),
  body('fullName')
    .notEmpty()
    .withMessage('Full name is required')
    .trim(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  handleValidationErrors,
];

export const loginValidator = [
  body('emailOrUsername')
    .notEmpty()
    .withMessage('Please enter your email or username')
    .trim(),
  body('password')
    .notEmpty()
    .withMessage('Please enter your password'),
  handleValidationErrors,
];

export const commentValidator = [
  body('text')
    .notEmpty()
    .withMessage('Comment text cannot be empty')
    .isLength({ max: 1000 })
    .withMessage('Comment text cannot exceed 1000 characters')
    .trim(),
  handleValidationErrors,
];

export const updateProfileValidator = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_.]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and periods')
    .trim(),
  body('fullName')
    .optional()
    .notEmpty()
    .withMessage('Full name cannot be empty')
    .trim(),
  body('bio')
    .optional()
    .isLength({ max: 150 })
    .withMessage('Bio cannot exceed 150 characters')
    .trim(),
  body('website')
    .optional()
    .trim(),
  handleValidationErrors,
];
