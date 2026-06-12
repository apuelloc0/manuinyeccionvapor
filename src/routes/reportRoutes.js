import { Router } from 'express';
import * as controller from '../controllers/reportController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

/** Solo personal autorizado puede generar reportes de comparación */
router.get('/production', authMiddleware, controller.getProductionReport);

export default router;