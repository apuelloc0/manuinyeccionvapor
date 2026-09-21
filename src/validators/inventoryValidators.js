import { body, param, query } from 'express-validator';
import { INVENTORY_CATEGORIES, MOVEMENT_TYPES } from '../models/Inventory.js';

/** Validación para crear un material de inventario */
export const createItemValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre del material es obligatorio.')
    .isLength({ max: 200 }).withMessage('El nombre no puede exceder 200 caracteres.'),
  body('code')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 }).withMessage('El código no puede exceder 50 caracteres.'),
  body('category')
    .trim()
    .notEmpty().withMessage('La categoría es obligatoria.')
    .isIn(INVENTORY_CATEGORIES).withMessage('Categoría no válida.'),
  body('stock')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('El stock debe ser un número mayor o igual a 0.'),
  body('min_stock')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('El stock mínimo debe ser un número mayor o igual a 0.'),
  body('ubicacion')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 }).withMessage('La ubicación no puede exceder 200 caracteres.'),
  body('descripcion')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 }).withMessage('La descripción no puede exceder 1000 caracteres.'),
];

/** Validación para actualizar un material existente */
export const updateItemValidator = [
  param('id').isUUID().withMessage('ID de material no válido.'),
  body('name')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 }).withMessage('El nombre no puede exceder 200 caracteres.'),
  body('code')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 }).withMessage('El código no puede exceder 50 caracteres.'),
  body('category')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(INVENTORY_CATEGORIES).withMessage('Categoría no válida.'),
  body('stock')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('El stock debe ser un número mayor o igual a 0.'),
  body('min_stock')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('El stock mínimo debe ser un número mayor o igual a 0.'),
  body('ubicacion')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 }).withMessage('La ubicación no puede exceder 200 caracteres.'),
  body('descripcion')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 }).withMessage('La descripción no puede exceder 1000 caracteres.'),
  body('activo')
    .optional()
    .isBoolean().withMessage('El campo activo debe ser booleano.'),
];

/** Validación para registrar un movimiento (entrada/salida/ajuste) */
export const createMovementValidator = [
  param('id').isUUID().withMessage('ID de material no válido.'),
  body('tipo')
    .trim()
    .notEmpty().withMessage('El tipo de movimiento es obligatorio.')
    .isIn(MOVEMENT_TYPES).withMessage('Tipo de movimiento no válido.'),
  body('cantidad')
    .notEmpty().withMessage('La cantidad es obligatoria.')
    .isFloat({ min: 0 }).withMessage('La cantidad debe ser un número mayor o igual a 0.'),
  body('motivo')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 }).withMessage('El motivo no puede exceder 200 caracteres.'),
  body('notas')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 }).withMessage('Las notas no pueden exceder 1000 caracteres.'),
];

/** Validación de parámetros UUID (reutilizable) */
export const idParamValidator = [
  param('id').isUUID().withMessage('ID no válido.'),
];

/** Validación de query de listado */
export const listQueryValidator = [
  query('search').optional({ values: 'falsy' }).trim(),
  query('category').optional({ values: 'falsy' }).trim(),
];
