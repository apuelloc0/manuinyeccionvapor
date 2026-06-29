import { Router } from 'express';
import * as controller from '../controllers/reportController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

/** Solo personal autorizado puede generar reportes de comparación */
router.get('/production', authMiddleware, controller.getProductionReport);

// Ruta legacy para compatibilidad con clientes antiguos que usan `production-report` y params `start`/`end`
router.get('/production-report', authMiddleware, controller.getProductionReport);

// Export PDF for a date range
router.get('/production/export/pdf', authMiddleware, controller.exportProductionPdf);

export default router;