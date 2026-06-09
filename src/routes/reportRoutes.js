import { Router } from 'express';
import * as report from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);
router.use(requirePermission('REPORTES_FULL'));

// Futuras rutas para SteamTrack (Módulo 3)
// router.get('/operaciones-diarias', report.dailyOperations);
// router.get('/produccion-vapor', report.steamProduction);
// router.get('/mantenimiento', report.maintenance);

export default router;
