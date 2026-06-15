import { Router } from 'express';
import * as controller from '../controllers/productionLogsController.js';
import { authenticate } from '../middleware/auth.js'; // Asume que tienes un middleware de autenticación
import { requirePermission } from '../middleware/auth.js'; // Si usas permisos más granulares

const router = Router();

// Todas las rutas de registros de producción requieren autenticación
router.use(authenticate);

router.get('/', controller.list);
router.post('/', requirePermission('OPERACIONES_CARGA'), controller.create); // Solo usuarios con permiso de carga pueden crear

export default router;