import { body, param } from 'express-validator';
import { ROLES } from '../config/constants.js';

export const createUserValidator = [
  // Allow either username or email; require at least one
  body().custom((_, { req }) => {
    const username = req.body.username ? String(req.body.username).trim() : '';
    const email = req.body.email ? String(req.body.email).trim() : '';
    if (!username && !email) throw new Error('Usuario o correo requerido');
    return true;
  }),
  body('username').optional().trim().notEmpty().withMessage('Usuario inválido'),
  // Username rules: 3-32 chars, letters/numbers/dot/underscore/hyphen
  body('username')
    .optional()
    .matches(/^[a-zA-Z0-9._-]{3,32}$/)
    .withMessage('El nombre de usuario debe tener entre 3 y 32 caracteres y solo puede contener letras, números, puntos, guiones bajos o guiones.'),
  body('email').optional().isEmail().withMessage('Correo con formato inválido'),
  body('password').isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
  body('role').isIn(Object.values(ROLES)).withMessage('Rol inválido'),
  body('fullName').optional().trim(),
  body('securityQuestions')
    .isArray({ min: 2, max: 2 })
    .withMessage('Debe registrar exactamente 2 preguntas de seguridad'),
  body('securityQuestions.*.question')
    .trim()
    .notEmpty()
    .withMessage('La pregunta de seguridad es requerida'),
  body('securityQuestions.*.answer')
    .trim()
    .notEmpty()
    .withMessage('La respuesta de seguridad es requerida'),
  // Also accept snake_case key from frontend
  body('security_questions')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Debe registrar exactamente 2 preguntas de seguridad'),
  body('security_questions.*.question').optional().trim().notEmpty(),
  body('security_questions.*.answer').optional().trim().notEmpty(),
];

export const updateUserValidator = [
  // ID param may be a UUID or string; ensure it's present
  param('id').notEmpty().withMessage('ID de usuario requerido'),
  body('username').optional().trim().notEmpty(),
  body('username')
    .optional()
    .matches(/^[a-zA-Z0-9._-]{3,32}$/)
    .withMessage('El nombre de usuario debe tener entre 3 y 32 caracteres y solo puede contener letras, números, puntos, guiones bajos o guiones.'),
  body('email').optional().isEmail(),
  body('password').optional().isLength({ min: 6 }),
  body('role').optional().isIn(Object.values(ROLES)),
  body('fullName').optional().trim(),
  body('active').optional().isBoolean(),
  body('securityQuestions').optional().isArray({ min: 2 }),
  body('securityQuestions.*.question').optional().trim().notEmpty(),
  body('securityQuestions.*.answer').optional().trim().notEmpty(),
  // Also accept snake_case
  body('security_questions').optional().isArray({ min: 2 }),
  body('security_questions.*.question').optional().trim().notEmpty(),
  body('security_questions.*.answer').optional().trim().notEmpty(),
];
