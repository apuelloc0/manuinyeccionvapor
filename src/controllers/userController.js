import supabase from '../config/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/constants.js';
import { logActivity } from '../services/auditService.js';

export const list = async (req, res, next) => {
  try {
    const userRole = String(req.user?.role || '').toUpperCase(); // Acceso seguro a req.user.role
    let query = supabase.from('users').select('*');

    // En un sistema de una sola empresa, todos los usuarios pertenecen a la misma empresa.
    // No se necesita filtrar por workshop_id.
    // Si se desea filtrar por roles, se haría aquí.
    // Ejemplo: Si solo los administradores pueden ver todos los usuarios, y otros roles solo a sí mismos o a usuarios de menor jerarquía.
    // Por ahora, listamos todos los usuarios.

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Obtener bitácora de auditoría (Solo Admin) */
export const listLogs = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        *,
        users ( id, full_name, username )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

export const getOne = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

export const verifyUsername = async (req, res, next) => {
  try {
    const identifier = String(req.params.username || '').trim();
    let user;
    let error;
    if (identifier.includes('@')) {
      ({ data: user, error } = await supabase.from('users').select('id, security_questions, active').ilike('email', identifier).maybeSingle());
    } else {
      ({ data: user, error } = await supabase.from('users').select('id, security_questions, active').ilike('username', identifier).maybeSingle());
      if (!user) {
        ({ data: user, error } = await supabase.from('users').select('id, security_questions, active').ilike('email', identifier).maybeSingle());
      }
    }

    if (error || !user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    if (!user.active) {
      return res.status(403).json({ ok: false, message: 'Tu cuenta aún no ha sido aprobada por el administrador.' });
    }

    const questions = (user.security_questions || []).map((q) => ({ question: q.question }));
    res.json({ ok: true, userId: user.id, securityQuestions: questions });
  } catch (err) {
    next(err);
  }
};

export const verifySecurityAnswers = async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.body.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    const answers = req.body.answers || [];
    if (!Array.isArray(answers) || answers.length !== (user.security_questions || []).length) {
      return res.status(401).json({ ok: false, message: 'Respuestas incorrectas.' });
    }
    // Compare provided answers with stored hashes using bcrypt
    const compareResults = await Promise.all(
      answers.map(async (a) => {
        const stored = user.security_questions[a.index] && user.security_questions[a.index].answer;
        if (!stored) return false;
        try {
          return await bcrypt.compare(String(a.answer || ''), String(stored));
        } catch (e) {
          return false;
        }
      })
    );
    const allMatch = compareResults.every(Boolean);
    if (!allMatch) {
      return res.status(401).json({ ok: false, message: 'Respuestas incorrectas.' });
    }
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'reset' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );

    await supabase.from('users').update({ reset_token: resetToken }).eq('id', user.id);

    res.json({ ok: true, message: 'Respuestas correctas.', resetToken: resetToken });
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.body.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    if (!user.reset_token) {
      return res.status(400).json({ ok: false, message: 'Token de restablecimiento de contraseña no válido.' });
    }
    const decoded = jwt.verify(user.reset_token, process.env.JWT_SECRET);
    if (decoded.purpose !== 'reset') {
      return res.status(400).json({ ok: false, message: 'Token de restablecimiento de contraseña no válido.' });
    }

    const hashedPassword = await bcrypt.hash(req.body.newPassword, 12);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword, reset_token: null })
      .eq('id', user.id);

    if (updateError) throw updateError;

    res.json({ ok: true, message: 'Contraseña restablecida.' });
  } catch (err) {
    next(err);
  }
};

export const create = async (req, res, next) => {
  try {
    const userData = { ...req.body };
    
    // En un sistema de una sola empresa, no hay workshop_id a forzar o cuotas de usuarios.
    // El workshop_id se puede asignar a un valor fijo o eliminar si no es relevante.
    // Por ahora, asumimos que el workshop_id se manejará a nivel de base de datos o se eliminará.
    delete userData.workshop_id; // Eliminamos la propiedad si viene en el body para evitar conflictos

    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 12);
    }
    const { data, error } = await supabase.from('users').insert([userData]).select().single();
    if (error) throw error;
    const { password: _, ...userWithoutPassword } = data;
    res.status(201).json({ ok: true, data: userWithoutPassword, message: 'Usuario creado.' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ ok: false, message: 'El nombre de usuario ya existe.' });
    }
    next(err);
  }
};

export const update = async (req, res, next) => {
  try {
    console.log('🔧 [USER_UPDATE_REQUEST]', { userId: req.user?.id, paramsId: req.params.id, body: req.body });
    const adminId = req.user?.id || req.user?.userId;
    const requesterRole = String(req.user?.role || '').toUpperCase();

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }
    
    if (req.body.active === false && user.id === adminId) {
      return res.status(400).json({ ok: false, message: 'No puede desactivar su propia cuenta.' });
    }
    
    // Preparamos los datos para la actualización y para el log de auditoría
    const updateData = {};
    const oldValuesForLog = {};
    const newValuesForLog = {};

    // Normalizamos roles para comparación y guardado
    const incomingRole = req.body.role ? String(req.body.role) : user.role; // Usar el rol existente si no se proporciona uno nuevo
    const newRoleUpper = incomingRole.toUpperCase();
    const adminRoleConst = String(ROLES.ADMINISTRADOR).toUpperCase();

    if (req.body.role && newRoleUpper === adminRoleConst && requesterRole !== adminRoleConst) {
      return res.status(403).json({
        ok: false,
        message: `No tiene permisos para asignar el rol de ${adminRoleConst}.`,
      });
    }
    if (String(user.role).toUpperCase() === adminRoleConst && user.active !== false) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', user.role) // Buscamos por el valor exacto que tiene en DB
        .eq('active', true);

      if (count <= 1) {
        if (req.body.role && newRoleUpper !== adminRoleConst) {
          return res.status(400).json({
            ok: false,
            message: 'Debe existir al menos un usuario con rol Administrador activo.',
          });
        }
        if (req.body.active === false) {
          return res.status(400).json({
            ok: false,
            message: 'No se puede desactivar al único Administrador activo.',
          });
        }
      }
    }
    
    // Construir updateData y old/new values para el log
    if (req.body.role !== undefined && user.role !== req.body.role) {
      updateData.role = req.body.role;
      oldValuesForLog.role = user.role;
      newValuesForLog.role = req.body.role;
    }
    // Email change: normalize and check duplicates
    if (req.body.email !== undefined && String(req.body.email).trim() !== String(user.email || '').trim()) {
      const normalizedEmail = String(req.body.email).toLowerCase().trim();
      // Validate basic email format
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(normalizedEmail)) {
        return res.status(400).json({ ok: false, message: 'Formato de correo inválido.' });
      }
      // Check duplicates
      const { data: existing, error: existingErr } = await supabase.from('users').select('id').ilike('email', normalizedEmail).maybeSingle();
      if (existingErr) throw existingErr;
      if (existing && String(existing.id) !== String(user.id)) {
        return res.status(400).json({ ok: false, message: 'El correo electrónico ya está en uso por otro usuario.' });
      }
      updateData.email = normalizedEmail;
      oldValuesForLog.email = user.email;
      newValuesForLog.email = normalizedEmail;
    }
    if (req.body.active !== undefined && user.active !== req.body.active) {
      updateData.active = req.body.active;
      oldValuesForLog.active = user.active;
      newValuesForLog.active = req.body.active;
    }
    if (req.body.full_name !== undefined && user.full_name !== req.body.full_name) {
      updateData.full_name = req.body.full_name;
      oldValuesForLog.full_name = user.full_name;
      newValuesForLog.full_name = req.body.full_name;
    }

    // Username change: normalize to lowercase and record for audit
    if (req.body.username !== undefined && String(req.body.username).trim() !== String(user.username).trim()) {
      const normalizedUsername = String(req.body.username).toLowerCase().trim();
      updateData.username = normalizedUsername;
      oldValuesForLog.username = user.username;
      newValuesForLog.username = normalizedUsername;
    }

    // Security questions change (requires current password when user edits their own profile)
    if (req.body.security_questions !== undefined) {
      const questions = req.body.security_questions;
      if (!Array.isArray(questions) || questions.length !== 2) {
        return res.status(400).json({ ok: false, message: 'Se requieren exactamente 2 preguntas de seguridad.' });
      }

      // If the requester is the same user (self-update), require currentPassword
      const requesterId = String(req.user?.id || req.user?.userId);
      const targetId = String(req.params.id);
      if (requesterId === targetId) {
        const currentPassword = String(req.body.currentPassword || '');
        if (!currentPassword) return res.status(400).json({ ok: false, message: 'Contraseña actual requerida para cambiar preguntas de seguridad.' });
        const validPwd = await bcrypt.compare(currentPassword, user.password);
        if (!validPwd) return res.status(401).json({ ok: false, message: 'Contraseña actual incorrecta.' });
      }

      // Validate structure and hash answers
      const hashed = [];
      for (const q of questions) {
        if (!q || typeof q.question !== 'string' || !q.question.trim()) {
          return res.status(400).json({ ok: false, message: 'Pregunta inválida.' });
        }
        if (!q.answer || !String(q.answer).trim()) {
          return res.status(400).json({ ok: false, message: 'Respuesta inválida.' });
        }
        const h = await bcrypt.hash(String(q.answer).trim(), 12);
        hashed.push({ question: q.question.trim(), answer: h });
      }

      updateData.security_questions = hashed;
      // Invalidate any reset tokens
      updateData.reset_token = null;
      // Do NOT add security_questions to audit log per request
    }

    const { password } = req.body;
    if (password && password.length >= 6) {
      updateData.password = await bcrypt.hash(password, 12);
      oldValuesForLog.password = '***** (anterior)';
      newValuesForLog.password = '***** (cambiada)';
    }

    // Si no hay cambios reales, no hacemos la actualización en DB
    if (Object.keys(updateData).length === 0) {
      const { password: _, ...userWithoutPassword } = user; // Devolvemos el usuario original sin password
      return res.json({ ok: true, data: userWithoutPassword, message: 'No hay cambios para actualizar.' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single(); // Usamos single porque esperamos un resultado

    console.log('🔧 [USER_UPDATE_DEBUG] updateData:', updateData);
    console.log('🔧 [USER_UPDATE_DEBUG] oldValuesForLog:', oldValuesForLog);
    console.log('🔧 [USER_UPDATE_DEBUG] newValuesForLog:', newValuesForLog);
    console.log('🔧 [USER_UPDATE_DEBUG] db result:', { updated, updateError });

    if (updateError) {
      console.error('❌ [USER_UPDATE_DB_ERROR]:', updateError);
      return res.status(400).json({ 
        ok: false, 
        message: 'Error al actualizar en base de datos. Verifique si el valor del rol es permitido.',
        details: updateError.message 
      });
    }
    
    // Solo logueamos si hubo cambios y tenemos un adminId
    if (adminId && Object.keys(newValuesForLog).length > 0) {
      logActivity({
        user_id: adminId,
        action: 'UPDATE',
        table_name: 'users',
        record_id: updated.id,
        old_value: oldValuesForLog,
        new_value: newValuesForLog
      }).catch(err => console.error('⚠️ [AUDIT_ERROR]:', err.message));
    }

    const { password: _, ...updatedWithoutPassword } = updated;
    res.json({ ok: true, data: updatedWithoutPassword, message: 'Usuario actualizado.' });
  } catch (err) {
    console.error('❌ [USER_UPDATE] Excepción crítica:', err);
    if (err.code === '23505') {
      return res.status(400).json({ ok: false, message: 'Este correo electrónico ya está en uso por otro usuario.' });
    }
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }

    // Protección del último ADMINISTRADOR activo
    if (user.role === ROLES.ADMINISTRADOR) {
      const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', ROLES.ADMINISTRADOR);
      if (count <= 1) {
        return res.status(400).json({ ok: false, message: `No se puede eliminar al último ${ROLES.ADMINISTRADOR} activo.` });
      }
    }

    // En un sistema de una sola empresa, no hay talleres que eliminar.
    // La lógica de eliminar empleados de un taller y el taller mismo es SaaS-específica.
    // Si se elimina un administrador, solo se elimina ese usuario.
    // Si se desea una lógica de "último administrador", ya está cubierta arriba.
    // Si se elimina un usuario, no afecta a otros usuarios ni a la "empresa" en sí.
    // Se asume que la tabla 'workshops' ya no es relevante o se maneja de otra forma.

    await supabase.from('users').delete().eq('id', req.params.id);
    res.json({ ok: true, message: 'Usuario eliminado.' });
  } catch (err) {
    next(err);
  }
};
