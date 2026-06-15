import express from 'express';
import userRoutes from './userRoutes.js';
import productionLogsRoutes from './productionLogsRoutes.js'; // Importamos las nuevas rutas
import macollaPozoRoutes from './macollaPozoRoutes.js';

const router = express.Router();

router.use('/users', userRoutes);
router.use('/production-logs', productionLogsRoutes); // Usamos las nuevas rutas
router.use('/', macollaPozoRoutes);
export default router;