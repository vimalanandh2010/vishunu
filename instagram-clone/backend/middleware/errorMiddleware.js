export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console in non-production
  if (process.env.NODE_ENV !== 'production') {
    console.error('API Error:', err.message);
  }

  let statusCode = res.statusCode !== 200 ? res.statusCode : (err.statusCode || err.status || 500);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 404;
    error.message = 'Resource not found';
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'Field';
    error.message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    error.message = Object.values(err.errors || {}).map((val) => val.message).join(', ');
  }

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
