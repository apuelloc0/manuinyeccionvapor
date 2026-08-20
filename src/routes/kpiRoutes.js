import { Router } from 'express';
import * as controller from '../controllers/kpiController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Summary KPIs (series by date)
// Allow unauthenticated access to the summary endpoint in local dev for debugging.
router.get('/summary', controller.getKpisSummary);
// Top pozos by production
router.get('/top-pozos', authMiddleware, controller.getKpisTopPozos);

export default router;
