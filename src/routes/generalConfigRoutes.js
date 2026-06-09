import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';
import * as general from '../controllers/generalConfigController.js';
import { uploadSingle } from '../config/upload.js';

const router = Router();

router.get('/public', general.getPublicInfo);

router.use(authenticate);
router.use(requireRole(ROLES.ADMINISTRADOR));

router.get('/', general.getConfig);
router.put('/', general.updateConfig);
router.post('/logo', uploadSingle('file', 'institution-logo'), general.uploadLogo);

export default router;
