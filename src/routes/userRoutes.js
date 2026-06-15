import express from 'express';
import { list, getOne, create, update, remove, verifyUsername, verifySecurityAnswers, resetPassword, listLogs } from '../controllers/userController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = express.Router();

// Public routes (e.g., for password recovery)
router.get('/verify-username/:username', verifyUsername);
router.post('/verify-security-answers', verifySecurityAnswers);
router.post('/reset-password', resetPassword);

// Rutas protegidas - Requieren token válido y rol de Administrador
router.use(authenticate);
router.use(requireRole(ROLES.ADMINISTRADOR));

router.get('/', list); 
router.get('/audit', listLogs); 
router.get('/:id', getOne); 
router.post('/', create); 
router.patch('/:id', update); 
router.delete('/:id', remove); 

export default router;