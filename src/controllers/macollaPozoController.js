import supabase from '../config/db.js';
import { parseDateOnlyInput } from '../utils/dateOnly.js';

// ==========================================
// MACCOLLAS
// ==========================================

/** Listar todas las macollas */
export const listMacollas = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('macollas')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Crear una nueva macolla */
export const createMacolla = async (req, res, next) => {
  try {
    const { nombre, ubicacion } = req.body;
    const { data, error } = await supabase
      .from('macollas')
      .insert([{ nombre, ubicacion }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, data, message: 'Macolla creada exitosamente.' });
  } catch (err) {
    if (err.code === '23505') { // Código de error para violación de restricción UNIQUE
      return res.status(400).json({ ok: false, message: 'Ya existe una macolla con este nombre.' });
    }
    next(err);
  }
};

/** Actualizar una macolla existente */
export const updateMacolla = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nombre, ubicacion } = req.body;
    const { data, error } = await supabase
      .from('macollas')
      .update({ nombre, ubicacion, updated_at: new Date().toISOString() }) // Añadimos updated_at
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data, message: 'Macolla actualizada exitosamente.' });
  } catch (err) {
    if (err.code === '23505') { // Código de error para violación de restricción UNIQUE
      return res.status(400).json({ ok: false, message: 'Ya existe una macolla con este nombre.' });
    }
    next(err);
  }
};

/** Eliminar una macolla */
export const removeMacolla = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('macollas')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true, message: 'Macolla eliminada exitosamente.' });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// POZOS
// ==========================================

/** Listar pozos, opcionalmente filtrados por macolla_id */
export const listPozos = async (req, res, next) => {
  try {
    const { macollaId } = req.query;
    let query = supabase
      .from('pozos')
      .select(`
        *,
        macollas ( id, nombre )
      `);

    if (macollaId) query = query.eq('macolla_id', macollaId);

    const { data, error } = await query.order('numero', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Crear un nuevo pozo */
export const createPozo = async (req, res, next) => {
  try {
    const { macolla_id, numero, estatus, ciclo_inicio, ciclo_fin } = req.body;
    const { data, error } = await supabase
      .from('pozos')
      .insert([{ 
        macolla_id, 
        numero, 
        estatus, 
        ciclo_inicio: ciclo_inicio ? parseDateOnlyInput(ciclo_inicio) : null,
        ciclo_fin: ciclo_fin ? parseDateOnlyInput(ciclo_fin) : null,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, data, message: 'Pozo creado exitosamente.' });
  } catch (err) {
    if (err.code === '23505') { // Código de error para violación de restricción UNIQUE
      return res.status(400).json({ ok: false, message: 'Ya existe un pozo con este número en la macolla seleccionada.' });
    }
    next(err);
  }
};

/** Actualizar un pozo existente */
export const updatePozo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { macolla_id, numero, estatus, ciclo_inicio, ciclo_fin } = req.body;
    const updates = { updated_at: new Date().toISOString() }; // Añadimos updated_at

    if (macolla_id !== undefined) updates.macolla_id = macolla_id;
    if (numero !== undefined) updates.numero = numero;
    if (estatus !== undefined) updates.estatus = estatus;
    if (ciclo_inicio !== undefined) updates.ciclo_inicio = ciclo_inicio ? parseDateOnlyInput(ciclo_inicio) : null;
    if (ciclo_fin !== undefined) updates.ciclo_fin = ciclo_fin ? parseDateOnlyInput(ciclo_fin) : null;

    const { data, error } = await supabase
      .from('pozos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data, message: 'Pozo actualizado exitosamente.' });
  } catch (err) {
    if (err.code === '23505') { // Código de error para violación de restricción UNIQUE
      return res.status(400).json({ ok: false, message: 'Ya existe un pozo con este número en la macolla seleccionada.' });
    }
    next(err);
  }
};

/** Eliminar un pozo */
export const removePozo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('pozos')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ ok: true, message: 'Pozo eliminado exitosamente.' });
  } catch (err) {
    next(err);
  }
};