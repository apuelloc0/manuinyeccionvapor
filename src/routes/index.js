import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import clientRoutes from './clientRoutes.js';
import inventoryRoutes from './inventoryRoutes.js'; // Asegúrate de importar esto
import generalConfigRoutes from './generalConfigRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import reportRoutes from './reportRoutes.js'; // Importamos las rutas de reportes
import macollaPozoRoutes from './macollaPozoRoutes.js'; // Nuevo: Módulo 4 - Datos Maestros
import steamReportRoutes from './steamReportRoutes.js'; // Nuevo

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/general-config', generalConfigRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes); // Añadimos las rutas de reportes
router.use('/macollas-pozos', macollaPozoRoutes); // Módulo 4 - Datos Maestros
router.use('/steam-reports', steamReportRoutes); // Módulo 4

export default router;