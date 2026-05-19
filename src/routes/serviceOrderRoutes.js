import { Router } from 'express';
import * as controller from '../controllers/serviceOrderController.js';
import { authenticate } from '../middleware/auth.js';
import { uploadSingle } from '../config/upload.js';

const router = Router();

router.use(authenticate);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.post('/upload-image', uploadSingle('image', 'peritaje'), controller.uploadImage);
router.post('/delete-image', controller.deleteImage);
router.patch('/:id', controller.update); // Esta es la ruta que permite el PATCH por ID
router.post('/:id/items', controller.addItem); // Ruta para que el técnico agregue repuestos
router.delete('/:id', controller.remove);

export default router;