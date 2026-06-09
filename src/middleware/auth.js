import jwt from 'jsonwebtoken';
import { PERMISSIONS } from '../config/constants.js';
import supabase from '../config/db.js';
import { USERS_TABLE } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ ok: false, message: 'Acceso denegado. Token requerido.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const { data: user, error } = await supabase
      .from(USERS_TABLE)
      .select('id, username, full_name, role, active') // Simplificamos la selección
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ ok: false, message: 'Usuario no encontrado.' });
    }
    if (user.active === false) {
      return res.status(401).json({ ok: false, message: 'Cuenta desactivada. Contacte a la administración.' });
    }

    // El objeto req.user ahora es directamente el usuario de la DB
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, message: 'Sesión expirada.' });
    }
    return res.status(401).json({ ok: false, message: 'Token inválido.' });
  }
};

/**
 * Requiere uno de los roles indicados para la acción.
 * permissionKey: clave de PERMISSIONS (ej: 'ESTUDIANTES_REGISTRO')
 */
export const requirePermission = (permissionKey) => {
  return (req, res, next) => {
    const allowed = PERMISSIONS[permissionKey];
    if (!allowed || !allowed.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permiso para realizar esta acción.',
      });
    }
    next();
  };
};

/** Requiere uno de los roles indicados */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permiso para esta sección.',
      });
    }
    next();
  };
};
