import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginValidator, forgotPasswordValidator, resetPasswordValidator } from '../validators/authValidators.js';

const router = Router();

router.post('/login', loginValidator, validate, auth.login);
router.post('/register', auth.register);
router.get('/me', authenticate, auth.me);

export default router;
