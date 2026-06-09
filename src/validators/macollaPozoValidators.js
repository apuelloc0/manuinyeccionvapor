import { body, param } from 'express-validator';

// Validadores para Macollas
export const createMacollaValidator = [
  body('nombre')
    .notEmpty().withMessage('El nombre de la macolla es requerido.')
    .isString().withMessage('El nombre de la macolla debe ser una cadena de texto.')
    .isLength({ max: 100 }).withMessage('El nombre de la macolla no puede exceder los 100 caracteres.'),
  body('ubicacion')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('La ubicación debe ser una cadena de texto.')
    .isLength({ max: 255 }).withMessage('La ubicación no puede exceder los 255 caracteres.'),
];

export const updateMacollaValidator = [
  param('id')
    .isUUID().withMessage('ID de macolla inválido.'),
  body('nombre')
    .optional()
    .notEmpty().withMessage('El nombre de la macolla es requerido.')
    .isString().withMessage('El nombre de la macolla debe ser una cadena de texto.')
    .isLength({ max: 100 }).withMessage('El nombre de la macolla no puede exceder los 100 caracteres.'),
  body('ubicacion')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('La ubicación debe ser una cadena de texto.')
    .isLength({ max: 255 }).withMessage('La ubicación no puede exceder los 255 caracteres.'),
];

// Validadores para Pozos
export const createPozoValidator = [
  body('macolla_id')
    .isUUID().withMessage('ID de macolla inválido.'),
  body('numero')
    .notEmpty().withMessage('El número de pozo es requerido.')
    .isString().withMessage('El número de pozo debe ser una cadena de texto.')
    .isLength({ max: 50 }).withMessage('El número de pozo no puede exceder los 50 caracteres.'),
  body('estatus')
    .isIn(['En inyección', 'En espera', 'En mantenimiento']).withMessage('Estatus de pozo inválido. Debe ser "En inyección", "En espera" o "En mantenimiento".'),
  body('ciclo_inicio').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Formato de fecha de inicio de ciclo inválido (YYYY-MM-DD).').toDate(),
  body('ciclo_fin').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Formato de fecha de fin de ciclo inválido (YYYY-MM-DD).').toDate(),
];

export const updatePozoValidator = [
  param('id').isUUID().withMessage('ID de pozo inválido.'),
  body('macolla_id').optional().isUUID().withMessage('ID de macolla inválido.'),
  body('numero')
    .optional()
    .notEmpty().withMessage('El número de pozo es requerido.')
    .isString().withMessage('El número de pozo debe ser una cadena de texto.')
    .isLength({ max: 50 }).withMessage('El número de pozo no puede exceder los 50 caracteres.'),
  body('estatus')
    .optional()
    .isIn(['En inyección', 'En espera', 'En mantenimiento']).withMessage('Estatus de pozo inválido. Debe ser "En inyección", "En espera" o "En mantenimiento".'),
  body('ciclo_inicio').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Formato de fecha de inicio de ciclo inválido (YYYY-MM-DD).').toDate(),
  body('ciclo_fin').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Formato de fecha de fin de ciclo inválido (YYYY-MM-DD).').toDate(),
];