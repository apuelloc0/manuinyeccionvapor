import { Router } from 'express';
import * as controller from '../controllers/macollaPozoController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Debug: log when this router receives a request
router.use((req, res, next) => {
	console.log('macollaPozoRoutes middleware - received path:', req.path);
	next();
});

// Autenticación aplicada por ruta para no interceptar rutas no relacionadas
// Rutas para Macollas
router.get('/macollas', authenticate, controller.listMacollas);
router.post('/macollas', authenticate, requireRole(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR), controller.createMacolla);
router.put('/macollas/:id', authenticate, requireRole(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR), controller.updateMacolla);
router.delete('/macollas/:id', authenticate, requireRole(ROLES.ADMINISTRADOR), controller.removeMacolla);

// Rutas para Pozos
router.get('/pozos', authenticate, controller.listPozos);
router.post('/pozos', authenticate, requireRole(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR), controller.createPozo);
router.put('/pozos/:id', authenticate, requireRole(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR), controller.updatePozo);
router.delete('/pozos/:id', authenticate, requireRole(ROLES.ADMINISTRADOR), controller.removePozo);

export default router;