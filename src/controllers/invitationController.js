import supabase from '../config/db.js';
import { randomBytes } from 'crypto';

/**
 * Crea un snapshot completo de los datos del taller antes de borrarlo para portabilidad.
 */
const archiveWorkshopData = async (workshopId) => {
  try {
    // 1. Obtener datos básicos del taller
    const { data: workshop } = await supabase.from('workshops').select('*').eq('id', workshopId).single();
    if (!workshop) return;

    // 2. Recolectar datos relacionados en paralelo (Snapshot integral para cumplimiento y soporte)
    const [clients, vehicles, inventory, orders, staff, payments, suggestions] = await Promise.all([
      supabase.from('clients').select('*').eq('workshop_id', workshopId),
      supabase.from('vehicles').select('*').eq('workshop_id', workshopId),
      supabase.from('inventory').select('*').eq('workshop_id', workshopId),
      supabase.from('service_orders').select('*, order_items(*)').eq('workshop_id', workshopId),
      supabase.from('users').select('full_name, username, role').eq('workshop_id', workshopId),
      supabase.from('platform_payments').select('*').eq('workshop_id', workshopId),
      supabase.from('suggestions').select('*').eq('workshop_id', workshopId)
    ]);

    const backup = {
      workshop_info: workshop,
      clients: clients.data || [],
      vehicles: vehicles.data || [],
      inventory: inventory.data || [],
      orders: orders.data || [],
      staff: staff.data || [],
      payments: payments.data || [],
      suggestions: suggestions.data || [],
      exported_at: new Date().toISOString()
    };

    // 3. Guardar en el histórico de la plataforma
    await supabase.from('workshop_archives').insert([{
      workshop_id: workshopId,
      workshop_name: workshop.name,
      owner_email: staff.data?.find(u => u.role === 'ADMINISTRADOR')?.username || null,
      backup_data: backup
    }]);
  } catch (err) {
    console.error('⚠️ Falló el archivado preventivo del taller:', err);
  }
};

/**
 * Genera una clave única para un nuevo dueño de taller.
 * Formato: Licencia hexadecimal segura de 32 caracteres.
 */
export const generateOwnerCode = async (req, res, next) => {
  try {
    const { email, name } = req.body || {};

    // Generamos una licencia segura de 32 caracteres (16 bytes hex)
    const code = randomBytes(16).toString('hex').toUpperCase();

    const { data, error } = await supabase
      .from('invitation_codes')
      .insert([{ 
        code,
        is_used: false,
        created_at: new Date(),
        recipient_email: email || null,
        recipient_name: name || null
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ 
      ok: true, 
      code: data.code, 
      message: 'Código de invitación para dueño generado con éxito.' 
    });
  } catch (err) {
    next(err);
  }
};

/** 
 * Valida y marca como usada una licencia durante el registro.
 * Esta función debe ser llamada desde el controlador de registro de talleres.
 */
export const validateAndUseCode = async (code, workshopId) => {
  // 1. Verificar si el código existe y no ha sido usado
  const { data, error } = await supabase
    .from('invitation_codes')
    .select('*')
    .eq('code', code)
    .eq('is_used', false)
    .single();

  if (error || !data) {
    throw new Error('La licencia no es válida o ya ha sido utilizada.');
  }

  // 2. Marcar como usada vinculándola al taller
  const { error: updateError } = await supabase
    .from('invitation_codes')
    .update({ 
      is_used: true, 
      used_by_workshop_id: workshopId,
      used_at: new Date() 
    })
    .eq('id', data.id);

  if (updateError) throw updateError;
  return true;
};

/** Eliminar un código de invitación */
export const removeCode = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Verificar si la licencia existe
    const { data: codeData, error: fetchError } = await supabase
      .from('invitation_codes')
      .select('is_used, used_by_workshop_id')
      .eq('id', id)
      .single();

    if (fetchError || !codeData) {
      return res.status(404).json({ ok: false, message: 'Licencia no encontrada.' });
    }

    // 2. Si la licencia está en uso, realizar limpieza total (SaaS Purge)
    if (codeData.is_used && codeData.used_by_workshop_id) {
      // RESPALDO: Guardamos los datos antes de destruir
      await archiveWorkshopData(codeData.used_by_workshop_id);

      // Primero quitamos la relación de la licencia para evitar el error de FK
      await supabase.from('invitation_codes').update({ used_by_workshop_id: null, is_used: false }).eq('id', id);
      
      await supabase.from('users').delete().eq('workshop_id', codeData.used_by_workshop_id);
      await supabase.from('workshops').delete().eq('id', codeData.used_by_workshop_id);
    }

    const { error } = await supabase
      .from('invitation_codes')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true, message: 'Licencia y datos asociados eliminados correctamente.' });
  } catch (err) {
    next(err);
  }
};

/** Eliminar un taller directamente */
export const deleteWorkshop = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // RESPALDO: Guardamos los datos antes de destruir
    await archiveWorkshopData(id);

    // Desvincular cualquier licencia antes de borrar el taller
    await supabase.from('invitation_codes').delete().eq('used_by_workshop_id', id);

    // Limpiar personal vinculado
    await supabase.from('users').delete().eq('workshop_id', id);
    
    // Eliminar el taller
    const { error } = await supabase
      .from('workshops')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true, message: 'Taller y personal eliminados permanentemente.' });
  } catch (err) {
    next(err);
  }
};

/** Listar todos los respaldos históricos */
export const listArchives = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workshop_archives')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};
/** Listar todos los códigos generados para control administrativo */
export const listCodes = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('invitation_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Listar todos los talleres registrados en la plataforma */
export const listWorkshops = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workshops')
      .select(`
        *,
        invitation_codes(code),
        owner:users!inner(full_name, username)
      `)
      .eq('owner.role', 'ADMINISTRADOR') // Filtra para obtener solo el administrador del taller
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Supabase devuelve la relación aliada como un array, incluso si es un solo registro.
    // Normalizamos para que 'owner' sea un objeto o null.
    const workshopsWithNormalizedOwner = data.map(ws => ({
      ...ws,
      owner: ws.owner && ws.owner.length > 0 ? ws.owner[0] : null
    }));
    res.json({ ok: true, data: workshopsWithNormalizedOwner });
  } catch (err) {
    next(err);
  }
};

/** Actualizar estado de un taller (Suscripción, Pago, etc) */
export const updateWorkshop = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { payment_status, subscription_plan, name, address, phone, tax_rate } = req.body;

    // SEGURIDAD SaaS: Si es un Admin de taller, solo puede editar SU taller
    if (req.user.role !== 'SUPER_ADMIN' && req.user.workshop_id !== id) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para modificar este taller.' });
    }

    // Solo el Super Admin puede cambiar el estado de pago o el plan
    const updateFields = { name, address, phone, tax_rate };
    if (req.user.role === 'SUPER_ADMIN') {
      if (payment_status) updateFields.payment_status = payment_status;
      if (subscription_plan) updateFields.subscription_plan = subscription_plan;
    }

    // Limpiar campos undefined para no sobreescribir datos existentes con NULL
    Object.keys(updateFields).forEach(key => updateFields[key] === undefined && delete updateFields[key]);

    const { data, error } = await supabase
      .from('workshops')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data, message: 'Taller actualizado correctamente.' });
  } catch (err) {
    next(err);
  }
};

/** Listar todos los pagos de suscripción recibidos por la plataforma */
export const listSubscriptionPayments = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('platform_payments')
      .select('*, workshops(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Registrar un nuevo pago de suscripción de un taller */
export const addSubscriptionPayment = async (req, res, next) => {
  try {
    const { workshop_id, amount, reference, notes } = req.body;

    // 1. Registrar el pago en el historial
    const { data, error } = await supabase
      .from('platform_payments')
      .insert([{ workshop_id, amount, reference, notes }])
      .select()
      .single();

    if (error) throw error;

    // 2. SaaS Logic: Reactivar taller automáticamente tras recibir pago
    await supabase
      .from('workshops')
      .update({ payment_status: 'active' })
      .eq('id', workshop_id);

    res.status(201).json({ ok: true, data, message: 'Pago registrado con éxito.' });
  } catch (err) {
    next(err);
  }
};

/** Obtener métricas de negocio consolidables para el Super Admin */
export const getSaasStats = async (req, res, next) => {
  try {
    // 1. Conteo de talleres y cálculo de MRR (Simulado según el plan)
    const { data: workshops, error: wsError } = await supabase
      .from('workshops')
      .select('subscription_plan, created_at, payment_status');
    
    if (wsError) throw wsError;

    const totalWorkshops = workshops.length;
    const activeWorkshops = workshops.filter(w => w.payment_status === 'active').length;
    const suspendedWorkshops = workshops.filter(w => w.payment_status === 'suspended').length;

    // MRR REAL: Suma de pagos registrados en los últimos 30 días
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: realPayments } = await supabase
      .from('platform_payments')
      .select('amount')
      .gt('created_at', thirtyDaysAgo);
    
    const mrr = realPayments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

    // 2. Tasa de conversión de invitaciones
    const { data: invites, error: invError } = await supabase
      .from('invitation_codes')
      .select('is_used');
    
    if (invError) throw invError;
    
    const totalInvites = invites.length;
    const usedInvites = invites.filter(i => i.is_used).length;
    const conversionRate = totalInvites > 0 ? ((usedInvites / totalInvites) * 100).toFixed(1) : 0;

    // 3. Salud del Sistema: Usuarios "activos" (vistos en las últimas 24h)
    // Nota: Esto asume que tienes una columna 'updated_at' que se actualiza al navegar
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: activeUsers, error: userError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gt('updated_at', oneDayAgo);

    if (userError) throw userError;

    // 4. Gráfico de crecimiento: Talleres por mes
    const growthData = workshops.reduce((acc, ws) => {
      const date = new Date(ws.created_at);
      const month = date.toLocaleString('es-ES', { month: 'short' });
      const year = date.getFullYear();
      const label = `${month} ${year}`;
      
      const existing = acc.find(item => item.name === label);
      if (existing) {
        existing.talleres += 1;
      } else {
        acc.push({ name: label, talleres: 1, sortDate: date });
      }
      return acc;
    }, []);

    // Ordenar cronológicamente
    const sortedGrowth = growthData
      .sort((a, b) => a.sortDate - b.sortDate)
      .map(({ name, talleres }) => ({ name, talleres }));

    res.json({
      ok: true,
      data: {
        kpis: {
          totalWorkshops,
          activeWorkshops,
          suspendedWorkshops,
          mrr,
          conversionRate,
          activeUsers
        },
        growth: sortedGrowth
      }
    });
  } catch (err) {
    next(err);
  }
};

/** 
 * Crear una nueva sugerencia o reporte de feedback 
 */
export const createSuggestion = async (req, res, next) => {
  try {
    const { type, content } = req.body;
    
    const { data, error } = await supabase
      .from('suggestions')
      .insert([{
        workshop_id: req.user.workshop_id,
        user_id: req.user.userId,
        type,
        content
      }]);

    if (error) throw error;
    res.status(201).json({ ok: true, message: '¡Gracias por tu feedback!' });
  } catch (err) {
    next(err);
  }
};

/**
 * Listar sugerencias para el Super Admin
 */
export const listSuggestions = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('suggestions')
      .select('*, workshops(name), users(full_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};