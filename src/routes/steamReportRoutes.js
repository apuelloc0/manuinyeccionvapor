import { Router } from 'express';
import * as controller from '../controllers/steamReportController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createSteamReportValidator, updateSteamReportValidator } from '../validators/steamReportValidators.js';

const router = Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/registro', controller.getLinkedRegistro);

router.post('/', requirePermission('OPERACIONES_CARGA'), createSteamReportValidator, validate, controller.create);
router.put('/:id', requirePermission('OPERACIONES_VALIDAR'), updateSteamReportValidator, validate, controller.update);
router.delete('/:id', requirePermission('CONFIGURACION'), controller.remove);

export default router;