import { body } from 'express-validator';

export const loginValidator = [
  // Allow login by username OR email
  body().custom((_, { req }) => {
    const username = req.body.username ? String(req.body.username).trim() : '';
    const email = req.body.email ? String(req.body.email).trim() : '';
    if (!username && !email) throw new Error('Usuario o correo requerido');
    return true;
  }),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

export const forgotPasswordValidator = [
  // Allow identifier as username or email
  body().custom((_, { req }) => {
    const username = req.body.username ? String(req.body.username).trim() : '';
    const email = req.body.email ? String(req.body.email).trim() : '';
    if (!username && !email) throw new Error('Usuario o correo requerido');
    return true;
  }),
  body('answers').isArray().withMessage('Respuestas deben ser un array'),
];

export const resetPasswordValidator = [
  body('resetToken').notEmpty().withMessage('Token requerido'),
  body('newPassword').isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
];
