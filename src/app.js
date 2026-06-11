import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';

const app = express();

// Middleware para registrar peticiones en la terminal
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Middlewares globales de seguridad y procesamiento
app.use(helmet());
app.use(cors());
app.use(express.json());

// Definición de rutas base
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/inventory', inventoryRoutes);

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