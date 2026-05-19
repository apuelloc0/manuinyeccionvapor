import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../../');
const uploadDir = process.env.UPLOAD_PATH || path.join(rootDir, 'uploads');
const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cambiamos a memoryStorage para que file.buffer esté disponible para Supabase
const storage = multer.memoryStorage();

/** Ruta pública relativa para guardar en DB (ej: /uploads/expedients/xxx.jpg) */
export const getPublicPath = (req, file) => {
  const sub = req.uploadFolder || req.query?.folder || 'files';
  return `/uploads/${sub}/${file.filename}`;
};

export const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter(req, file, cb) {
    cb(null, true);
  },
});

export const uploadSingle = (field = 'file', folder = 'files') =>
  (req, res, next) => {
    const m = upload.single(field);
    req.uploadFolder = folder;
    m(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, message: 'Archivo demasiado grande.' });
        }
        return next(err);
      }
      next();
    });
  };
