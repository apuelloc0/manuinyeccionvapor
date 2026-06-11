import supabase from '../config/db.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/constants.js';
import { logActivity } from '../services/auditService.js';

export const list = async (req, res, next) => {
  try {
    const userRole = String(req.user.role || '').toUpperCase();
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
    const { data: user, error } = await supabase
      .from('users')
      .select('id, security_questions, active')
      .ilike('username', req.params.username)
      .single();

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

    const normalized = (s) => String(s || '').toLowerCase().trim();
    const allMatch = req.body.answers.every(
      (a) =>
        user.security_questions[a.index] &&
        normalized(user.security_questions[a.index].answer) === normalized(a.answer)
    );
    if (!allMatch || req.body.answers.length !== user.security_questions.length) {
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
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado.' });
    }
    
    // Impedir autodesactivación (sigue siendo relevante para un solo Admin)
    if (req.body.active === false && user.id === req.user.id) {
      return res.status(400).json({ ok: false, message: 'No puede desactivar su propia cuenta.' });
    }
    
    // SEGURIDAD: Solo un ADMINISTRADOR puede asignar el rol ADMINISTRADOR
    if (req.body.role === ROLES.ADMINISTRADOR && req.user?.role !== ROLES.ADMINISTRADOR) {
      return res.status(403).json({
        ok: false,
        message: `No tiene permisos para asignar el rol de ${ROLES.ADMINISTRADOR}.`,
      });
    }

    // Protección del último ADMINISTRADOR activo
    if (user.role === ROLES.ADMINISTRADOR && user.active !== false) {
      const { count } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', ROLES.ADMINISTRADOR)
        // No hay filtro por workshop_id, ya que es una sola empresa
        .eq('active', true);

      // Si solo queda un administrador activo y se intenta desactivarlo o cambiar su rol
      if (count <= 1) {
        if (req.body.role != null && req.body.role !== ROLES.ADMINISTRADOR) {
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

    const updateData = { ...req.body };
    if (updateData.password && updateData.password.length >= 6) {
      updateData.password = await bcrypt.hash(updateData.password, 12);
    }

    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }
    
    // REGISTRO DE AUDITORÍA
    await logActivity({
      user_id: req.user.id, // El admin que realiza la acción
      action: 'UPDATE',
      table_name: 'users',
      record_id: updated.id,
      new_value: { active: updated.active, role: updated.role }
    });

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
