import express from 'express';
import { list, getOne, create, update, remove, verifyUsername, verifySecurityAnswers, resetPassword, listLogs } from '../controllers/userController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { adminMiddleware } from '../middleware/adminMiddleware.js';

const router = express.Router();

// Public routes (e.g., for password recovery)
router.get('/verify-username/:username', verifyUsername);
router.post('/verify-security-answers', verifySecurityAnswers);
router.post('/reset-password', resetPassword);

// Authenticated routes (some require admin)
router.get('/', authMiddleware, adminMiddleware, list); // List all users (Admin only)
router.get('/audit', authMiddleware, adminMiddleware, listLogs); // List audit logs (Admin only)
router.get('/:id', authMiddleware, adminMiddleware, getOne); // Get single user (Admin only)
router.post('/', authMiddleware, adminMiddleware, create); // Create user (Admin only)
router.patch('/:id', authMiddleware, adminMiddleware, update); // Update user (Admin only)
router.delete('/:id', authMiddleware, adminMiddleware, remove); // Delete user (Admin only)

// Note: The 'create' route for users might also be a public 'signup' route,
// but for now, we'll assume admin creates users.

export default router;