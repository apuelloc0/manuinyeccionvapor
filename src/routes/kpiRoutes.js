import { Router } from 'express';
import * as controller from '../controllers/kpiController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Summary KPIs (series by date)
router.get('/summary', authMiddleware, controller.getKpisSummary);
// Top pozos by production
router.get('/top-pozos', authMiddleware, controller.getKpisTopPozos);

export default router;
