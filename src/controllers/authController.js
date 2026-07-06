import supabase from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ROLES } from '../config/constants.js';
import { logActivity } from '../services/auditService.js';

/**
 * Helper para validar el token de Cloudflare Turnstile (Protección contra bots)
 */
const verifyBotProtection = async (token) => {
  if (!token) return false;
  try {
    const formData = new URLSearchParams();
    formData.append('secret', process.env.TURNSTILE_SECRET_KEY);
    formData.append('response', token);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const outcome = await result.json();
    return outcome.success;
  } catch (err) {
    console.error('[SECURITY] Turnstile verification error:', err);
    return false;
  }
};

const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

/**
 * Registro de un nuevo usuario en el sistema SteamTrack.
 * Por defecto, los usuarios se registran como OPERADOR y requieren aprobación del ADMINISTRADOR.
 */
export const register = async (req, res, next) => {
  try {
    const { username, email, password, full_name, security_questions, captchaToken } = req.body;

    // Validación de Bot en producción
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TURNSTILE === 'true') {
      const isHuman = await verifyBotProtection(captchaToken);
      if (!isHuman) return res.status(400).json({ ok: false, message: 'Fallo en verificación de seguridad. Intente de nuevo.' });
    }

    const normalizedUsername = username ? String(username).toLowerCase().trim() : '';
    const normalizedEmail = email ? String(email).toLowerCase().trim() : '';

    if (!normalizedUsername && !normalizedEmail) {
      return res.status(400).json({ ok: false, message: 'Se requiere nombre de usuario o correo electrónico.' });
    }

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, message: 'El correo electrónico no tiene un formato válido.' });
    }

    // Verificar si ya existe usuario con ese username o email
    const orFilterParts = [];
    if (normalizedUsername) orFilterParts.push(`username.eq.${normalizedUsername}`);
    if (normalizedEmail) orFilterParts.push(`email.eq.${normalizedEmail}`);
    const orFilter = orFilterParts.join(',');

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id')
      .or(orFilter)
      .maybeSingle();

    if (existingUserError) throw existingUserError;
    if (existingUser) {
      return res.status(400).json({ ok: false, message: 'Ya existe una cuenta con ese usuario o correo electrónico.' });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // Determinar el rol inicial. Por defecto, OPERADOR.
    const { count: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true });
    const assignedRole = userCount === 0 ? ROLES.ADMINISTRADOR : ROLES.OPERADOR;

    // Crear el Usuario
    const insertData = {
      username: normalizedUsername || null,
      email: normalizedEmail || null,
      full_name,
      password: hashedPassword,
      role: assignedRole,
      active: userCount === 0,
      security_questions
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([insertData])
      .select()
      .single();

    if (userError) {
      if (userError.code === '23505') {
        return res.status(400).json({ ok: false, message: 'Ya existe una cuenta asociada a este correo electrónico o usuario.' });
      }
      console.error('❌ [AUTH_REGISTER_ERROR]:', userError.message);
      throw userError;
    }

    const successMessage = userCount === 0 
      ? `Cuenta de ${assignedRole} creada y activada automáticamente.` 
      : `Registro exitoso. Tu cuenta como ${assignedRole} está pendiente de aprobación por el administrador.`;

    res.status(201).json({ ok: true, message: successMessage });
  } catch (err) {
    next(err);
  }
};

/**
 * Inicio de sesión (Login)
 */
export const login = async (req, res, next) => {
  try {
    const { username, email, password, captchaToken } = req.body;

    const identifier = String(username || email || '').toLowerCase().trim();

    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TURNSTILE === 'true') {
      const isHuman = await verifyBotProtection(captchaToken);
      if (!isHuman) return res.status(400).json({ ok: false, message: 'Seguridad: Por favor verifique que no es un robot.' });
    }

    // 1. Buscar usuario por username o email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .single();

    if (error || !user) {
      console.error('[LOGIN_ERROR] Usuario no encontrado:', username);
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
    }

    // SEGURIDAD: Bloquear acceso si la cuenta está explícitamente desactivada
    // Si es null, permitimos el paso por ser cuenta antigua
    if (user.active === false) { 
      return res.status(401).json({ 
        ok: false, 
        message: 'Tu cuenta está desactivada o pendiente de aprobación. Contacta al administrador.' 
      });
    }

    // 2. Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
    }

    // 3. Generar Token JWT
    // Normalizamos el rol a mayúsculas y enviamos ambos formatos de ID por compatibilidad
    const userRole = String(user.role || '').toUpperCase();

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ ok: true, token, user: { id: user.id, username: user.username, email: user.email || null, role: userRole, full_name: user.full_name, active: user.active } });
  } catch (err) {
    next(err);
  }
};

/** Obtener datos del usuario actual autenticado */
export const me = async (req, res) => {
  res.json({ ok: true, user: req.user });
};