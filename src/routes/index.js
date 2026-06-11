import express from 'express';
import userRoutes from './userRoutes.js';
// Import other route files as they are created
// import inventoryRoutes from './inventoryRoutes.js';
// import steamReportRoutes from './steamReportRoutes.js';

const router = express.Router();

router.use('/users', userRoutes);
// router.use('/inventory', inventoryRoutes);
// router.use('/steam-reports', steamReportRoutes);

export default router;