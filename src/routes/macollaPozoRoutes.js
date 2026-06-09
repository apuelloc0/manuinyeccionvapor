import { Router } from 'express';
import * as controller from '../controllers/macollaPozoController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createMacollaValidator, updateMacollaValidator, createPozoValidator, updatePozoValidator } from '../validators/macollaPozoValidators.js';

const router = Router();

router.use(authenticate);

// Rutas para Macollas
router.get('/macollas', controller.listMacollas);
router.post('/macollas', requirePermission('OPERACIONES_VALIDAR'), createMacollaValidator, validate, controller.createMacolla);
router.put('/macollas/:id', requirePermission('OPERACIONES_VALIDAR'), updateMacollaValidator, validate, controller.updateMacolla);
router.delete('/macollas/:id', requirePermission('OPERACIONES_VALIDAR'), controller.removeMacolla);

// Rutas para Pozos
router.get('/pozos', controller.listPozos);
router.post('/pozos', requirePermission('OPERACIONES_VALIDAR'), createPozoValidator, validate, controller.createPozo);
router.put('/pozos/:id', requirePermission('OPERACIONES_VALIDAR'), updatePozoValidator, validate, controller.updatePozo);
router.delete('/pozos/:id', requirePermission('OPERACIONES_VALIDAR'), controller.removePozo);

export default router;