import express from 'express';
import { list, getOne, create, update, remove, verifyUsername, verifySecurityAnswers, resetPassword, listLogs } from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rateLimitSecurityQuestions } from '../middleware/rateLimit.js';
import { ROLES } from '../config/constants.js';

const router = express.Router();

// Public routes (e.g., for password recovery)
router.get('/verify-username/:username', verifyUsername);
router.post('/verify-security-answers', verifySecurityAnswers);
router.post('/reset-password', resetPassword);

// Rutas protegidas - Requieren token válido y rol de Administrador
router.use(authenticate);

// Allow authenticated users to update their own profile
router.patch('/me', rateLimitSecurityQuestions({ windowMs: 15 * 60 * 1000, maxAttempts: 5 }), (req, res, next) => {
	// Allow authenticated user to update their own profile
	req.params.id = req.user?.id;
	return update(req, res, next);
});

// Admin-only routes from here
router.use(requireRole(ROLES.ADMINISTRADOR));

router.get('/', list); 
router.get('/audit', listLogs); 
router.get('/:id', getOne); 
router.post('/', create); 
router.patch('/:id', update); 
router.delete('/:id', remove); 

export default router;