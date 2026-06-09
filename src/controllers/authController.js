import supabase from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ROLES } from '../config/constants.js';

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
    const { username, password, full_name, security_questions, captchaToken } = req.body;

    const normalizedEmail = String(username || '').toLowerCase().trim();

    // Validación de Bot en producción
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TURNSTILE === 'true') { // <-- CAMBIO AQUÍ
      const isHuman = await verifyBotProtection(captchaToken);
      if (!isHuman) return res.status(400).json({ ok: false, message: 'Fallo en verificación de seguridad. Intente de nuevo.' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, message: 'El correo electrónico no tiene un formato válido.' });
    }

    // Verificar si el usuario ya existe
    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id')
      .eq('username', normalizedEmail)
      .maybeSingle();

    if (existingUserError) throw existingUserError;
    if (existingUser) {
      return res.status(400).json({ ok: false, message: 'Ya existe un usuario con este correo electrónico.' });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // Determinar el rol inicial. Por defecto, OPERADOR.
    // Si es el primer usuario en el sistema, se le asigna ADMINISTRADOR.
    const { count: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true });
    const assignedRole = userCount === 0 ? ROLES.ADMINISTRADOR : ROLES.OPERADOR;

    // Crear el Usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([{
        username: normalizedEmail,
        full_name,
        password: hashedPassword,
        role: assignedRole,
        active: false, // Por defecto, la cuenta requiere aprobación de un administrador existente
        security_questions // Guardamos las preguntas de seguridad
      }])
      .select()
      .single();

    if (userError) throw userError;

    res.status(201).json({ 
      ok: true, 
      message: `Cuenta creada exitosamente como ${assignedRole}. Requiere aprobación del administrador.`
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Inicio de sesión (Login)
 */
export const login = async (req, res, next) => {
  try {
    const { username, password, captchaToken } = req.body;

    const normalizedEmail = String(username || '').toLowerCase().trim();

    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_TURNSTILE === 'true') { // <-- CAMBIO AQUÍ
      const isHuman = await verifyBotProtection(captchaToken);
      if (!isHuman) return res.status(400).json({ ok: false, message: 'Seguridad: Por favor verifique que no es un robot.' });
    }

    // 1. Buscar usuario (con email normalizado) sin joins a workshops
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', normalizedEmail)
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
    // El token ahora solo contendrá userId y role, ya no workshop_id
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
  } catch (err) {
    next(err);
  }
};

/** Obtener datos del usuario actual autenticado */
export const me = async (req, res) => {
  res.json({ ok: true, user: req.user });
};