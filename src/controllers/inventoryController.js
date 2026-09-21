import supabase from '../config/db.js';
import { logActivity } from '../services/auditService.js';
import { INVENTORY_TABLE, INVENTORY_MOVEMENTS_TABLE } from '../models/Inventory.js';

// ==========================================
// INVENTARIO - Ajuste de valores seguros
// ==========================================

const toNumberOrZero = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
};

/**
 * Listar materiales de inventario.
 * Query params: ?search=texto&category=EPP&includeInactive=true
 */
export const listItems = async (req, res, next) => {
  try {
    const { search, category, includeInactive } = req.query;

    let query = supabase.from(INVENTORY_TABLE).select('*');

    // Por defecto solo activos
    if (String(includeInactive) !== 'true') {
      query = query.eq('activo', true);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (search) {
      // Busca por nombre o código (case-insensitive)
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }

    const { data, error } = await query.order('name', { ascending: true });
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Obtener un material por ID */
export const getItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, message: 'Material no encontrado.' });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Crear un nuevo material de inventario */
export const createItem = async (req, res, next) => {
  try {
    const { name, code, category, stock, min_stock, ubicacion, descripcion } = req.body;

    const payload = {
      name: name?.trim(),
      code: code?.trim() || null,
      category,
      stock: toNumberOrZero(stock),
      min_stock: toNumberOrZero(min_stock),
      ubicacion: ubicacion?.trim() || null,
      descripcion: descripcion?.trim() || null,
      activo: true,
    };

    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      user_id: req.user.id,
      action: 'CREATE',
      table_name: INVENTORY_TABLE,
      record_id: data.id,
      new_value: data,
    });

    res.status(201).json({ ok: true, data, message: 'Material registrado exitosamente.' });
  } catch (err) {
    next(err);
  }
};

/** Actualizar un material existente */
export const updateItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, category, stock, min_stock, ubicacion, descripcion, activo } = req.body;

    const { data: current } = await supabase
      .from(INVENTORY_TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (!current) return res.status(404).json({ ok: false, message: 'Material no encontrado.' });

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name?.trim();
    if (code !== undefined) updates.code = code?.trim() || null;
    if (category !== undefined) updates.category = category;
    if (stock !== undefined) updates.stock = toNumberOrZero(stock);
    if (min_stock !== undefined) updates.min_stock = toNumberOrZero(min_stock);
    if (ubicacion !== undefined) updates.ubicacion = ubicacion?.trim() || null;
    if (descripcion !== undefined) updates.descripcion = descripcion?.trim() || null;
    if (activo !== undefined) updates.activo = activo;

    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      user_id: req.user.id,
      action: 'UPDATE',
      table_name: INVENTORY_TABLE,
      record_id: id,
      old_value: current,
      new_value: data,
    });

    res.json({ ok: true, data, message: 'Material actualizado exitosamente.' });
  } catch (err) {
    next(err);
  }
};

/**
 * Desactivar (soft delete) un material.
 * No se borra para conservar el historial del kardex.
 */
export const removeItem = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: current } = await supabase
      .from(INVENTORY_TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (!current) return res.status(404).json({ ok: false, message: 'Material no encontrado.' });

    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logActivity({
      user_id: req.user.id,
      action: 'DELETE',
      table_name: INVENTORY_TABLE,
      record_id: id,
      old_value: current,
      new_value: data,
    });

    res.json({ ok: true, data, message: 'Material desactivado exitosamente.' });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// MOVIMIENTOS (KARDEX)
// ==========================================

/**
 * Registrar un movimiento (entrada / salida / ajuste) y actualizar el stock.
 * Reglas de stock:
 *   entrada -> stock + cantidad
 *   salida  -> stock - cantidad (no permite negativo)
 *   ajuste  -> el stock pasa a ser exactamente 'cantidad'
 */
export const createMovement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tipo, cantidad, motivo, notas } = req.body;

    const { data: item, error: itemError } = await supabase
      .from(INVENTORY_TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ ok: false, message: 'Material no encontrado.' });
    }

    const qty = toNumberOrZero(cantidad);
    const stockAnterior = toNumberOrZero(item.stock);
    let stockNuevo = stockAnterior;

    if (tipo === 'entrada') {
      stockNuevo = stockAnterior + qty;
    } else if (tipo === 'salida') {
      if (qty > stockAnterior) {
        return res.status(400).json({
          ok: false,
          message: `Stock insuficiente. Disponible: ${stockAnterior}.`,
        });
      }
      stockNuevo = stockAnterior - qty;
    } else if (tipo === 'ajuste') {
      stockNuevo = qty;
    }

    // Actualizar stock del material
    const { error: updateError } = await supabase
      .from(INVENTORY_TABLE)
      .update({ stock: stockNuevo, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) throw updateError;

    // Registrar movimiento en el kardex
    const { data: movement, error: movementError } = await supabase
      .from(INVENTORY_MOVEMENTS_TABLE)
      .insert([{
        item_id: id,
        tipo,
        cantidad: qty,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        motivo: motivo?.trim() || null,
        notas: notas?.trim() || null,
        user_id: req.user.id,
      }])
      .select()
      .single();

    if (movementError) throw movementError;

    await logActivity({
      user_id: req.user.id,
      action: tipo === 'entrada' ? 'CREATE' : 'UPDATE',
      table_name: INVENTORY_MOVEMENTS_TABLE,
      record_id: movement.id,
      new_value: { ...movement, material: item.name },
    });

    res.status(201).json({
      ok: true,
      data: { movement, stock: stockNuevo },
      message: 'Movimiento registrado exitosamente.',
    });
  } catch (err) {
    next(err);
  }
};

/** Listar movimientos recientes (global) */
export const listMovements = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const take = Math.min(Number(limit) || 50, 200);

    const { data, error } = await supabase
      .from(INVENTORY_MOVEMENTS_TABLE)
      .select(`
        *,
        inventory ( id, name, code, category ),
        users ( id, full_name, username )
      `)
      .order('created_at', { ascending: false })
      .limit(take);

    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Listar movimientos de un material específico (kardex por ítem) */
export const listItemMovements = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from(INVENTORY_MOVEMENTS_TABLE)
      .select(`
        *,
        users ( id, full_name, username )
      `)
      .eq('item_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};
