import express from 'express';
import userRoutes from './userRoutes.js';
import productionLogsRoutes from './productionLogsRoutes.js'; // Importamos las nuevas rutas
import macollaPozoRoutes from './macollaPozoRoutes.js';
import reportRoutes from './reportRoutes.js';
import steamReportRoutes from './steamReportRoutes.js';

const router = express.Router();

router.use('/users', userRoutes);
router.use('/production-logs', productionLogsRoutes); // Usamos las nuevas rutas
router.use('/', macollaPozoRoutes);
router.use('/report', reportRoutes);
router.use('/steam-reports', steamReportRoutes);
export default router;