import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';
import dotenv from 'dotenv';

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
  override: true,
});

// Use Cloudinary when real credentials are configured; otherwise fall back to
// local disk so the API is fully testable without cloud services.
const cloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloudinary_cloud_name' &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

// Store uploads next to the backend regardless of process cwd
const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');

// Build a fetchable web URL for an uploaded file. With Cloudinary, `path` is
// already an https URL; with disk storage, return a root-relative /uploads URL
// so it stays same-origin behind the frontend proxy (helmet CORP-safe).
export function fileUrl(req, file) {
  if (!file) return null;
  if (/^https?:\/\//i.test(file.path)) return file.path;
  return `/uploads/${encodeURIComponent(file.filename)}`;
}

const storage = cloudinaryConfigured
  ? new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'instagram_clone',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'webm'],
        resource_type: 'auto', // Auto-detect image vs video
      },
    })
  : (() => {
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      return multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) =>
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
      });
    })();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio (voice notes), and safe document attachments
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/zip' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/octet-stream'
    ) {
      cb(null, true);
    } else {
      // Allow general file extensions as fallback
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.mp3', '.wav', '.ogg', '.m4a', '.pdf', '.doc', '.docx', '.zip', '.txt'].includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Unsupported file type for upload.'), false);
      }
    }
  },
});

export default upload;
