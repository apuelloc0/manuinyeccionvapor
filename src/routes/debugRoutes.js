import { Router } from 'express';
import * as controller from '../controllers/debugController.js';

const router = Router();

// Only used for local development diagnostics. Do NOT enable in production.
router.get('/registros', controller.registrosPublic);
router.get('/tendencia', controller.tendenciaDebug);

export default router;
