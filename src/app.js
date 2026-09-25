import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/index.js'; // Importamos el router principal
import telegramRoutes from './routes/telegramRoutes.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

// Si el servidor está detrás de un proxy (nginx, cloudflare), confía en el proxy
app.set('trust proxy', 1);

// Middleware para registrar peticiones en la terminal
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Middlewares globales de seguridad y procesamiento
app.use(helmet());
app.use(cors());
app.use(express.json());

// Note: static assets for UI are served by the frontend build.
// The backend no longer serves the `/template` header asset to avoid
// duplication and possible cross-origin issues. Frontend should include
// `encabezado.png` in its `front/src/assets` so it is available in production.

// ========== Rate limiting ==========
// Limiter para rutas de autenticación (protege contra fuerza bruta)
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 6, // límite de 6 peticiones por IP por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intente nuevamente más tarde.' },
});

// Limiter global para la API pública
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // límite de 200 peticiones por IP por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes. Intente de nuevo en unos minutos.' },
});


// Definición de rutas base
// Webhook de Telegram: se monta ANTES del rate limit (Telegram no debe ser limitado)
app.use('/api/telegram', telegramRoutes);

// Aplicamos rate limiters: authLimiter a rutas de autenticación, apiLimiter al resto
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', apiLimiter, apiRoutes); // Montamos el router principal bajo /api

// Manejador de rutas no encontradas (404)
app.use((req, res) => {
  console.warn(`⚠️ [404] Ruta no encontrada: ${req.method} ${req.url}`);
  res.status(404).json({ ok: false, message: 'Ruta API no encontrada' });
});

app.use((err, req, res, next) => {
  console.error('❌ [SERVER ERROR]:', err);
  res.status(500).json({ ok: false, message: 'Error interno del servidor' });
});

export default app;