import { Router } from 'express';
import * as controller from '../controllers/inventoryController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createItemValidator,
  updateItemValidator,
  createMovementValidator,
  idParamValidator,
  listQueryValidator,
} from '../validators/inventoryValidators.js';

const router = Router();

// Todas las rutas de inventario requieren autenticación y permiso de gestión
// (Administrador y Gerente). El resto de roles no tiene acceso.
router.use(authenticate, requirePermission('INVENTARIO_GESTION'));

// ---- Movimientos globales (debe ir antes de /:id) ----
router.get('/movements', controller.listMovements);

// ---- Materiales ----
router.get('/', ...listQueryValidator, validate, controller.listItems);
router.post('/', ...createItemValidator, validate, controller.createItem);

// ---- Material por ID ----
router.get('/:id', ...idParamValidator, validate, controller.getItem);
router.put('/:id', ...updateItemValidator, validate, controller.updateItem);
router.delete('/:id', ...idParamValidator, validate, controller.removeItem);

// ---- Movimientos de un material ----
router.post('/:id/movement', ...createMovementValidator, validate, controller.createMovement);
router.get('/:id/movements', ...idParamValidator, validate, controller.listItemMovements);

export default router;
