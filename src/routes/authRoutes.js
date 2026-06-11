import { Router } from 'express';
import * as controller from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/** Rutas públicas de autenticación */
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticate, controller.me);

export default router;