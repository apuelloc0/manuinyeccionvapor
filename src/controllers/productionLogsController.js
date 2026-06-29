import supabase from '../config/db.js';
import { logActivity } from '../services/auditService.js';

/**
 * Listar todos los registros diarios de producción.
 * @route GET /api/production-logs
 */
export const list = async (req, res, next) => {
  try {
    // Aquí podrías añadir filtros o paginación si fuera necesario en el futuro
    const { data, error } = await supabase
      .from('registros_diarios')
      .select(`
        *,
        pozos (
          numero,
          macollas (
            nombre
          )
        )
      `)
      .order('fecha', { ascending: false }) // Ordenar por fecha descendente
      .order('hora', { ascending: false }); // Luego por hora descendente

    if (error) throw error;

    // Calcular valores dinámicos en el servidor
    const computedData = (data || []).map(r => {
      const gv1_iny = Number(r.gv1_inyectado) || 0;
      const gv3_iny = Number(r.gv3_inyectado) || 0;
      const vapor_total = gv1_iny + gv3_iny;

      const calidades = [r.gv1_calidad, r.gv3_calidad].filter(c => c !== null && c !== undefined && c !== '');
      const calidad_promedio = calidades.length > 0
        ? calidades.reduce((a, b) => Number(a) + Number(b), 0) / calidades.length
        : 0;

      return {
        ...r,
        vapor_total,
        calidad_promedio
      };
    });

    res.json({ ok: true, data: computedData });
  } catch (err) {
    console.error('❌ [PRODUCTION_LOGS_LIST_ERROR]:', err.message);
    next(err);
  }
};

/**
 * Crear un nuevo registro diario de producción.
 * @route POST /api/production-logs
 */
export const create = async (req, res, next) => {
  try {
    const { user } = req; // Obtenemos el usuario autenticado del middleware
    const {
      pozo_id, titulo, fecha, hora, turno, operador_nombre,
      presion_cabezal, temp_cabezal, pres_rev_prod, temp_rev_prod, pres_rev_sup, temp_rev_sup, elongacion,
      tk1_nivel, tk2_nivel, tk3_nivel,
      gv1_presion, gv1_temp, gv1_calidad, gv1_flujo_agua, gv1_flujo_gas, gv1_inyectado,
      gv3_presion, gv3_temp, gv3_calidad, gv3_flujo_agua, gv3_flujo_gas, gv3_inyectado,
      ph_alimentacion, ph_retorno,
      bitacora, horas_perdidas, causa_downtime, estatus
    } = req.body;

    const newLog = {
      user_id: user.id, // Asociamos el registro al usuario que lo crea
      pozo_id,
      titulo,
      fecha,
      hora,
      turno,
      operador_nombre,
      presion_cabezal,
      temp_cabezal,
      pres_rev_prod,
      temp_rev_prod,
      pres_rev_sup,
      temp_rev_sup,
      elongacion,
      tk1_nivel,
      tk2_nivel,
      tk3_nivel,
      gv1_presion,
      gv1_temp,
      gv1_calidad,
      gv1_flujo_agua,
      gv1_flujo_gas,
      gv1_inyectado,
      gv3_presion,
      gv3_temp,
      gv3_calidad,
      gv3_flujo_agua,
      gv3_flujo_gas,
      gv3_inyectado,
      ph_alimentacion,
      ph_retorno,
      bitacora,
      horas_perdidas,
      causa_downtime,
      estatus
    };

    const { data, error } = await supabase
      .from('registros_diarios')
      .insert([newLog])
      .select()
      .single();

    if (error) throw error;

    // Calcular valores dinámicos para la respuesta
    const gv1_iny = Number(data.gv1_inyectado) || 0;
    const gv3_iny = Number(data.gv3_inyectado) || 0;
    const vapor_total = gv1_iny + gv3_iny;

    const calidades = [data.gv1_calidad, data.gv3_calidad].filter(c => c !== null && c !== undefined && c !== '');
    const calidad_promedio = calidades.length > 0
      ? calidades.reduce((a, b) => Number(a) + Number(b), 0) / calidades.length
      : 0;

    const createdRecord = {
      ...data,
      vapor_total,
      calidad_promedio
    };

    // Registrar actividad de auditoría
    logActivity({
      user_id: user.id,
      action: 'CREATE',
      table_name: 'registros_diarios',
      record_id: data.id,
      new_value: newLog,
    }).catch(err => console.error('⚠️ [AUDIT_ERROR]:', err.message));

    // Sincronizar a `steam_reports` si el registro se envía (estatus 'enviado')
    try {
      if (data.estatus === 'enviado') {
        const steamReport = {
          pozo_id: data.pozo_id,
          operador_id: data.user_id,
          fecha: data.fecha,
          hora: data.hora,
          // Normalizar turno a formato esperado por steam_reports ('Diurno'|'Nocturno')
          turno: data.turno === 'dia' ? 'Diurno' : data.turno === 'noche' ? 'Nocturno' : data.turno,
          vapor_producido_dia: Number(data.gv1_inyectado || 0) + Number(data.gv3_inyectado || 0),
          horas_efectivas: 24 - (Number(data.horas_perdidas) || 0),
          horas_perdidas: Number(data.horas_perdidas) || 0,
          causa_downtime: data.causa_downtime,
          sections_data: {},
          daily_log: data.bitacora || null,
          maintenance_checklist: {},
          status: 'sent'
        };

        const { data: sr, error: srErr } = await supabase.from('steam_reports').insert([steamReport]).select().single();
        if (srErr) console.error('⚠️ Error sincronizando a steam_reports:', srErr.message || srErr);
        else {
          // Auditoría de la creación sincronizada
          logActivity({
            user_id: user.id,
            action: 'CREATE',
            table_name: 'steam_reports',
            record_id: sr.id,
            new_value: sr,
          }).catch(e => console.error('⚠️ [AUDIT_ERROR steam_reports]:', e.message));
        }
      }
    } catch (syncErr) {
      console.error('⚠️ [SYNC_ERROR]:', syncErr.message || syncErr);
    }

    res.status(201).json({ ok: true, data: createdRecord, message: 'Registro diario creado exitosamente.' });
  } catch (err) {
    console.error('❌ [PRODUCTION_LOGS_CREATE_ERROR]:', err.message);
    next(err);
  }
};

/**
 * Actualizar un registro diario de producción.
 * @route PUT /api/production-logs/:id
 */
export const update = async (req, res, next) => {
  try {
    const { user } = req; // usuario autenticado
    const { id } = req.params;
    const payload = req.body;

    // Restringir qué campos pueden actualizarse si se desea (por ahora permitimos la mayoría)
    const allowedFields = [
      'titulo','fecha','hora','turno','operador_nombre','presion_cabezal','temp_cabezal','pres_rev_prod','temp_rev_prod','pres_rev_sup','temp_rev_sup','elongacion',
      'tk1_nivel','tk2_nivel','tk3_nivel','gv1_presion','gv1_temp','gv1_calidad','gv1_flujo_agua','gv1_flujo_gas','gv1_inyectado',
      'gv3_presion','gv3_temp','gv3_calidad','gv3_flujo_agua','gv3_flujo_gas','gv3_inyectado','ph_alimentacion','ph_retorno',
      'bitacora','horas_perdidas','causa_downtime','estatus','pozo_id'
    ];

    const updateData = {};
    for (const k of Object.keys(payload || {})) {
      if (allowedFields.includes(k)) updateData[k] = payload[k];
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ ok: false, message: 'No hay campos válidos para actualizar.' });
    }

    const { data: existing, error: findErr } = await supabase.from('registros_diarios').select().eq('id', id).single();
    if (findErr || !existing) {
      return res.status(404).json({ ok: false, message: 'Registro no encontrado.' });
    }

    const { data, error } = await supabase.from('registros_diarios').update(updateData).eq('id', id).select().single();
    if (error) throw error;

    // Calcular valores dinámicos para la respuesta
    const gv1_iny = Number(data.gv1_inyectado) || 0;
    const gv3_iny = Number(data.gv3_inyectado) || 0;
    const vapor_total = gv1_iny + gv3_iny;
    const calidades = [data.gv1_calidad, data.gv3_calidad].filter(c => c !== null && c !== undefined && c !== '');
    const calidad_promedio = calidades.length > 0 ? calidades.reduce((a, b) => Number(a) + Number(b), 0) / calidades.length : 0;

    const updatedRecord = { ...data, vapor_total, calidad_promedio };

    // Auditoría de la actualización
    logActivity({
      user_id: user.id,
      action: 'UPDATE',
      table_name: 'registros_diarios',
      record_id: id,
      old_value: existing,
      new_value: updateData,
    }).catch(e => console.error('⚠️ [AUDIT_ERROR UPDATE]:', e.message));

    res.json({ ok: true, data: updatedRecord, message: 'Registro actualizado correctamente.' });
  } catch (err) {
    console.error('❌ [PRODUCTION_LOGS_UPDATE_ERROR]:', err.message || err);
    next(err);
  }
};