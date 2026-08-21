import express from 'express';
import userRoutes from './userRoutes.js';
import productionLogsRoutes from './productionLogsRoutes.js'; // Importamos las nuevas rutas
import macollaPozoRoutes from './macollaPozoRoutes.js';
import reportRoutes from './reportRoutes.js';
import kpiRoutes from './kpiRoutes.js';
import steamReportRoutes from './steamReportRoutes.js';
import debugRoutes from './debugRoutes.js';

const router = express.Router();

router.use('/users', userRoutes);
router.use('/production-logs', productionLogsRoutes); // Usamos las nuevas rutas
router.use('/', macollaPozoRoutes);
router.use('/report', reportRoutes);
router.use('/kpis', kpiRoutes);
router.use('/steam-reports', steamReportRoutes);
// Mount debug routes only in non-production environments
if (process.env.NODE_ENV !== 'production') {
	router.use('/debug', debugRoutes);
}
export default router;