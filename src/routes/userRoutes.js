import { Router } from 'express';
import * as controller from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Rutas de recuperación de cuenta (Públicas)
router.get('/verify/:username', controller.verifyUsername);
router.post('/verify-answers', controller.verifySecurityAnswers);
router.post('/reset-password', controller.resetPassword);

// Rutas de gestión (Privadas)
router.get('/', authenticate, requireRole(ROLES.ADMINISTRADOR), controller.list);
router.get('/:id', authenticate, controller.getOne);
router.patch('/:id', authenticate, requireRole(ROLES.ADMINISTRADOR), controller.update);

export default router;