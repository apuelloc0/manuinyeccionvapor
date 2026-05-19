import { Router } from 'express';
import * as invitation from '../controllers/invitationController.js';
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js';

const router = Router();

// Todas las rutas de invitación requieren estar logueado
router.use(authenticate);

// Protegemos las rutas para que solo el administrador global de la plataforma (tú) acceda
// Nota: Asegúrate de que tu usuario tenga este permiso o ajusta el rol a uno único
// ¡ADVERTENCIA!: No uses 'ADMINISTRADOR' aquí si quieres evitar que dueños de talleres generen sus propias llaves.
// Se recomienda crear un rol 'SUPER_ADMIN' en la base de datos solo para tu usuario.
router.post('/generate', requireRole('SUPER_ADMIN'), invitation.generateOwnerCode);
router.get('/', requireRole('SUPER_ADMIN'), invitation.listCodes);
router.get('/archives', requireRole('SUPER_ADMIN'), invitation.listArchives);
router.delete('/:id', requireRole('SUPER_ADMIN'), invitation.removeCode);
router.get('/workshops', requireRole('SUPER_ADMIN'), invitation.listWorkshops);
// Permitimos ADMINISTRADOR para que puedan usar la página de Configuración
router.patch('/workshops/:id', requireRole('SUPER_ADMIN', 'ADMINISTRADOR'), invitation.updateWorkshop);
router.delete('/workshops/:id', requireRole('SUPER_ADMIN'), invitation.deleteWorkshop);
router.get('/stats', requireRole('SUPER_ADMIN'), invitation.getSaasStats);
router.get('/platform-payments', requireRole('SUPER_ADMIN'), invitation.listSubscriptionPayments);
router.post('/platform-payments', requireRole('SUPER_ADMIN'), invitation.addSubscriptionPayment);

// Rutas para Sugerencias (Feedback)
router.post('/suggestions', invitation.createSuggestion);
router.get('/suggestions', requireRole('SUPER_ADMIN'), invitation.listSuggestions);

export default router;