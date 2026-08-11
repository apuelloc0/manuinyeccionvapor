import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import apiRoutes from './routes/index.js'; // Importamos el router principal

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

// Serve static assets from back/public after CORS middleware so static files
// include the CORS headers. This avoids browser CORS errors when the frontend
// (possibly served from a different origin) requests these assets.
app.use(express.static(publicDir));

// Provide explicit aliases for common header paths (some clients request
// `/templates/encabezado.PNG` or `/template/encabezado.png` with different
// casing). Serve the canonical `public/template/encabezado.png` file for
// these routes to avoid 404s.
const sendEncabezado = (req, res) => {
  const filePath = path.join(publicDir, 'template', 'encabezado.png');
  return res.sendFile(filePath, (err) => {
    if (err) {
      console.warn('Could not send encabezado file:', err);
      res.status(err.status || 404).end();
    }
  });
};

app.get(['/templates/encabezado.PNG', '/templates/encabezado.png', '/template/encabezado.PNG', '/template/encabezado.png'], sendEncabezado);

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