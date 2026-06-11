import { ROLES } from '../config/constants.js';

export const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === ROLES.ADMINISTRADOR) {
    next();
  } else {
    res.status(403).json({ ok: false, message: 'Acceso denegado. Se requiere rol de Administrador.' });
  }
};