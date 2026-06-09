import { body, param } from 'express-validator';

// Validadores para la creación de un reporte de vapor
export const createSteamReportValidator = [
  body('pozo_id')
    .isUUID().withMessage('ID de pozo inválido.'),
  body('fecha')
    .isISO8601().withMessage('Formato de fecha inválido (YYYY-MM-DD).')
    .toDate(), // Convierte a objeto Date
  body('hora')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Formato de hora inválido (HH:MM).'),
  body('turno')
    .isIn(['Diurno', 'Nocturno']).withMessage('Turno inválido. Debe ser "Diurno" o "Nocturno".'),
  body('vapor_producido_dia')
    .isFloat({ min: 0 }).withMessage('Vapor producido por día debe ser un número positivo.'),
  body('horas_efectivas')
    .isFloat({ min: 0, max: 24 }).withMessage('Horas efectivas deben estar entre 0 y 24.'),
  body('horas_perdidas')
    .isFloat({ min: 0, max: 24 }).withMessage('Horas perdidas deben estar entre 0 y 24.'),
  body('causa_downtime')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Causa de downtime debe ser texto.'),
  body('sections_data')
    .isObject().withMessage('Los datos de secciones deben ser un objeto JSON válido.'),
  body('daily_log')
    .optional({ nullable: true, checkFalsy: true })
    .isString().withMessage('Bitácora diaria debe ser texto.'),
  body('maintenance_checklist')
    .optional({ nullable: true, checkFalsy: true })
    .isObject().withMessage('El checklist de mantenimiento debe ser un objeto JSON válido.'),
  body('status')
    .isIn(['draft', 'sent']).withMessage('Estado inválido. Debe ser "draft" o "sent".'),
];

// Validadores para la actualización de un reporte de vapor
export const updateSteamReportValidator = [
  param('id')
    .isUUID().withMessage('ID de reporte inválido.'),
  body('pozo_id')
    .optional().isUUID().withMessage('ID de pozo inválido.'),
  body('fecha')
    .optional().isISO8601().withMessage('Formato de fecha inválido (YYYY-MM-DD).')
    .toDate(),
  body('hora')
    .optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Formato de hora inválido (HH:MM).'),
  body('turno')
    .optional().isIn(['Diurno', 'Nocturno']).withMessage('Turno inválido. Debe ser "Diurno" o "Nocturno".'),
  body('vapor_producido_dia')
    .optional().isFloat({ min: 0 }).withMessage('Vapor producido por día debe ser un número positivo.'),
  body('horas_efectivas')
    .optional().isFloat({ min: 0, max: 24 }).withMessage('Horas efectivas deben estar entre 0 y 24.'),
  body('horas_perdidas')
    .optional().isFloat({ min: 0, max: 24 }).withMessage('Horas perdidas deben estar entre 0 y 24.'),
  body('causa_downtime')
    .optional({ nullable: true, checkFalsy: true }).isString().withMessage('Causa de downtime debe ser texto.'),
  body('sections_data')
    .optional().isObject().withMessage('Los datos de secciones deben ser un objeto JSON válido.'),
  body('daily_log')
    .optional({ nullable: true, checkFalsy: true }).isString().withMessage('Bitácora diaria debe ser texto.'),
  body('maintenance_checklist')
    .optional({ nullable: true, checkFalsy: true }).isObject().withMessage('El checklist de mantenimiento debe ser un objeto JSON válido.'),
  body('status')
    .optional().isIn(['draft', 'sent']).withMessage('Estado inválido. Debe ser "draft" o "sent".'),
];