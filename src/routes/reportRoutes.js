import { Router } from 'express';
import * as controller from '../controllers/reportController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

/** Solo personal autorizado puede generar reportes de comparación */
router.get('/production', authMiddleware, controller.getProductionReport);

// Ruta legacy para compatibilidad con clientes antiguos que usan `production-report` y params `start`/`end`
router.get('/production-report', authMiddleware, controller.getProductionReport);

// Export PDF for a date range
// Export PDF for a date range
// En entornos de prueba locales puede ser útil desactivar autenticación para validar generación de PDF.
if (process.env.DISABLE_AUTH_FOR_TEST === 'true') {
	console.warn('WARNING: Auth disabled for report export (DISABLE_AUTH_FOR_TEST=true)');
	router.get('/production/export/pdf', controller.exportProductionPdf);
} else {
	router.get('/production/export/pdf', authMiddleware, controller.exportProductionPdf);
}

export default router;