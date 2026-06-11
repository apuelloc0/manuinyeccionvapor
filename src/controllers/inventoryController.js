import supabase from '../config/db.js';
import { logActivity } from '../services/auditService.js';

/** Listar todos los repuestos */
export const list = async (req, res, next) => {
  try {
    let query = supabase.from('inventory').select('*');

    // En un sistema de una sola empresa, no se necesita filtrar por workshop_id.
    // Todos los ítems de inventario pertenecen a la única empresa.
    const { data, error } = await query
      .order('name', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Crear un nuevo repuesto */
export const create = async (req, res, next) => {
  try {
    const { code, name, category, stock, minStock, price, currency } = req.body;
    const { data, error } = await supabase
      .from('inventory')
      .insert([{ 
        code, 
        name, 
        category, // Podríamos definir categorías específicas para SteamTrack (ej. "Consumibles", "Repuestos GV", "Herramientas")
        currency: currency || 'COP',
        // workshop_id ya no es necesario o se asigna a un ID fijo de la única empresa
        stock: parseInt(stock) || 0, 
        min_stock: parseInt(minStock ?? 5) || 0, 
        price_usd: parseFloat(price) || 0,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) {
      console.error('❌ Error de Supabase al crear repuesto:', error);
      return res.status(400).json({ ok: false, message: error.message });
    }

    // Auditoría
    await logActivity({
      user_id: req.user.id,
      action: 'CREATE',
      table_name: 'inventory',
      record_id: data.id,
      new_value: data
    });

    res.status(201).json({ ok: true, data, message: 'Repuesto agregado.' });
  } catch (err) {
    next(err);
  }
};

/** Actualizar un repuesto existente */
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Obtenemos el estado actual antes de actualizar para la auditoría
    const { data: current } = await supabase.from('inventory').select('*').eq('id', id).single();
    if (!current) return res.status(404).json({ ok: false, message: 'Repuesto no encontrado.' });

    const { code, name, category, stock, minStock, price, currency } = req.body;
    
    // Construimos el objeto de actualización de forma segura para evitar NaN o undefined
    const updates = {};
    if (code !== undefined) updates.code = code;
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (currency !== undefined) updates.currency = currency || 'COP';
    if (stock !== undefined) updates.stock = parseInt(stock) || 0;
    if (minStock !== undefined) updates.min_stock = parseInt(minStock) || 0;
    if (price !== undefined) updates.price_usd = parseFloat(price) || 0;
    
    updates.updated_at = new Date();

    const { data, error } = await supabase.from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error de Supabase al actualizar repuesto:', error);
      return res.status(400).json({ ok: false, message: error.message });
    }

    // Auditoría: Registro de la actualización con valor anterior y nuevo
    await logActivity({
      user_id: req.user.id,
      action: 'UPDATE',
      table_name: 'inventory',
      record_id: id,
      old_value: current,
      new_value: data
    });

    res.json({ ok: true, data, message: 'Repuesto actualizado.' });
  } catch (err) {
    next(err);
  }
};

/** Eliminar un repuesto */
export const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase.from('inventory').delete().eq('id', id);

    if (error) throw error;

    // Auditoría: Registro de la eliminación
    await logActivity({
      user_id: req.user.id,
      action: 'DELETE',
      table_name: 'inventory',
      record_id: id
    });

    res.json({ ok: true, message: 'Repuesto eliminado.' });
  } catch (err) {
    next(err);
  }
};
