
import supabase from '../config/db.js';
import { parseDateOnlyInput } from '../utils/dateOnly.js';
import { ROLES } from '../config/constants.js';
import { logActivity } from '../services/auditService.js';

/** Listar reportes con filtros (Fecha, Pozo, Estatus) */
export const list = async (req, res, next) => {
  try {
    const { pozoId, status, startDate, endDate } = req.query;

    let query = supabase
      .from('steam_reports')
      .select(`
        *,
        pozos (
          id, numero, estatus,
          macollas ( id, nombre )
        ),
        users!operador_id ( id, full_name )
      `);

    if (pozoId) query = query.eq('pozo_id', pozoId);
    if (status) query = query.eq('status', status);
    if (startDate) query = query.gte('fecha', startDate);
    if (endDate) query = query.lte('fecha', endDate);

    const { data, error } = await query.order('fecha', { ascending: false }).order('hora', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Detalle de un reporte específico */
export const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('steam_reports')
      .select(`
        *,
        pozos (
          id, numero, estatus, ciclo_inicio, ciclo_fin, vapor_acumulado_ton,
          macollas ( id, nombre, ubicacion )
        ),
        users!operador_id ( id, full_name )
      `)
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ ok: false, message: 'Reporte no encontrado.' });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Buscar el registro_diario asociado a un steam_report (por pozo+fecha+hora) */
export const getLinkedRegistro = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: report, error: rErr } = await supabase.from('steam_reports').select('pozo_id, fecha, hora').eq('id', id).single();
    if (rErr || !report) return res.status(404).json({ ok: false, message: 'Reporte no encontrado.' });

    // Intento 1: coincidencia exacta pozo + fecha + hora
    let { data: regs, error: regsErr } = await supabase
      .from('registros_diarios')
      .select('id')
      .eq('pozo_id', report.pozo_id)
      .eq('fecha', report.fecha)
      .eq('hora', report.hora)
      .limit(1);

    if (regsErr) throw regsErr;

    // Intento 2: si no hay coincidencia exacta, buscar por pozo + fecha
    if (!regs || regs.length === 0) {
      const r2 = await supabase.from('registros_diarios').select('id').eq('pozo_id', report.pozo_id).eq('fecha', report.fecha).limit(1);
      regs = r2.data;
      regsErr = r2.error;
    }

    // Intento 3: buscar por fecha + hora (ignorar pozo)
    if ((!regs || regs.length === 0) && report.hora) {
      const r3 = await supabase.from('registros_diarios').select('id').eq('fecha', report.fecha).eq('hora', report.hora).limit(1);
      regs = r3.data;
      regsErr = r3.error;
    }

    // Intento 4: buscar por fecha solamente
    if (!regs || regs.length === 0) {
      const r4 = await supabase.from('registros_diarios').select('id').eq('fecha', report.fecha).limit(1);
      regs = r4.data;
      regsErr = r4.error;
    }

    if (regsErr) throw regsErr;
    if (!regs || regs.length === 0) return res.status(404).json({ ok: false, message: 'Registro original no encontrado.' });

    res.json({ ok: true, data: regs[0] });
  } catch (err) {
    next(err);
  }
};

/** Crear reporte diario (Secciones A, B y C) */
export const create = async (req, res, next) => {
  try {
    const { 
      pozo_id, fecha, hora, turno, 
      vapor_producido_dia, horas_efectivas, horas_perdidas, causa_downtime,
      sections_data, daily_log, maintenance_checklist, status 
    } = req.body;

    const reportData = {
      pozo_id,
      operador_id: req.user.id, // Trazabilidad: ID automático del usuario activo
      fecha: parseDateOnlyInput(fecha),
      hora,
      turno,
      vapor_producido_dia: Number(vapor_producido_dia) || 0,
      horas_efectivas: Number(horas_efectivas) || 0,
      horas_perdidas: Number(horas_perdidas) || 0,
      causa_downtime,
      sections_data,
      daily_log,
      maintenance_checklist,
      status: status || 'draft'
    };

    const { data, error } = await supabase
      .from('steam_reports')
      .insert([reportData])
      .select()
      .single();

    if (error) throw error;

    // Si el reporte se envía formalmente, actualizamos el pozo
    if (data.status === 'sent') {
      await updateWellAccumulatedSteam(pozo_id, data.vapor_producido_dia);
    }

    // Auditoría global
    await logActivity({
      user_id: req.user.id,
      action: 'CREATE',
      table_name: 'steam_reports',
      record_id: data.id,
      new_value: data
    });

    res.status(201).json({ ok: true, data, message: 'Reporte registrado exitosamente.' });
  } catch (err) {
    next(err);
  }
};

/** Actualizar reporte (con Historial de Cambios  Sección D) */
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    const { data: current, error: fetchError } = await supabase.from('steam_reports').select('*').eq('id', id).single();
    if (fetchError || !current) return res.status(404).json({ ok: false, message: 'Reporte no encontrado.' });

    // Auditoría: Registrar cambios si es Supervisor o Admin (Uso de constantes para evitar errores)
    if (req.user && [ROLES.SUPERVISOR, ROLES.ADMINISTRADOR].includes(req.user.role)) { // Aseguramos que req.user exista
      const changes = [];
      const trackedFields = ['vapor_producido_dia', 'horas_efectivas', 'horas_perdidas', 'causa_downtime'];
      
      trackedFields.forEach(field => {
        if (updates[field] !== undefined && String(updates[field]) !== String(current[field])) { // Comparación más robusta
          changes.push({ field, old: current[field], new: updates[field] });
        }
      });

      if (changes.length > 0) {
        updates.edit_history = [
          ...(current.edit_history || []),
          { modified_by: req.user.full_name, timestamp: new Date().toISOString(), changes }
        ];
      }
    }

    if (updates.fecha) updates.fecha = parseDateOnlyInput(updates.fecha);
    updates.updated_at = new Date();

    const { data, error } = await supabase.from('steam_reports').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // Auditoría global
    await logActivity({
      user_id: req.user.id,
      action: 'UPDATE',
      table_name: 'steam_reports',
      record_id: data.id,
      old_value: current,
      new_value: data
    });

    // Sincronizar vapor acumulado si el reporte cambió de borrador a enviado o si cambió el valor
    if (current.status === 'draft' && data.status === 'sent') {
      await updateWellAccumulatedSteam(data.pozo_id, data.vapor_producido_dia);
    } else if (current.status === 'sent' && updates.vapor_producido_dia !== undefined) {
      const diff = Number(updates.vapor_producido_dia) - Number(current.vapor_producido_dia);
      if (diff !== 0) await updateWellAccumulatedSteam(data.pozo_id, diff); // Corrección de operador
    }

    res.json({ ok: true, data, message: 'Reporte actualizado.' });
  } catch (err) {
    next(err);
  }
};

/** Helper: Actualizar vapor acumulado en la tabla de pozos */
async function updateWellAccumulatedSteam(pozoId, amount) {
  const { data: well } = await supabase.from('pozos').select('vapor_acumulado_ton').eq('id', pozoId).single();
  if (!well) return;
  const newTotal = (Number(well.vapor_acumulado_ton) || 0) + Number(amount); // Corrección de operador
  await supabase.from('pozos').update({ vapor_acumulado_ton: newTotal }).eq('id', pozoId);
}

export const remove = async (req, res, next) => {
  const { error } = await supabase.from('steam_reports').delete().eq('id', req.params.id);
  if (error) return next(error);
  res.json({ ok: true, message: 'Reporte eliminado.' });
};
