import { Router } from 'express';
import * as controller from '../controllers/macollaPozoController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Todas las rutas de macollas y pozos requieren autenticación
router.use(authenticate);

// Rutas para Macollas
router.get('/macollas', controller.listMacollas);
router.post('/macollas', requireRole(ROLES.ADMINISTRADOR), controller.createMacolla);
router.put('/macollas/:id', requireRole(ROLES.ADMINISTRADOR), controller.updateMacolla);
router.delete('/macollas/:id', requireRole(ROLES.ADMINISTRADOR), controller.removeMacolla);

// Rutas para Pozos
router.get('/pozos', controller.listPozos);
router.post('/pozos', requireRole(ROLES.ADMINISTRADOR), controller.createPozo);
router.put('/pozos/:id', requireRole(ROLES.ADMINISTRADOR), controller.updatePozo);
router.delete('/pozos/:id', requireRole(ROLES.ADMINISTRADOR), controller.removePozo);

export default router;