import supabase from '../config/db.js';
import { CLIENTS_TABLE } from '../models/Client.js';

/** Listar clientes con filtros de búsqueda */
export const list = async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = supabase
      .from(CLIENTS_TABLE)
      .select('*')
      .eq('active', true);

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,id_number.ilike.%${search}%`);
    }

    const { data, error } = await query.order('last_name', { ascending: true });
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Obtener un cliente y sus vehículos asociados */
export const getOne = async (req, res, next) => {
  try {
    const { data: client, error } = await supabase
      .from(CLIENTS_TABLE)
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !client) {
      return res.status(404).json({ ok: false, message: 'Cliente no encontrado.' });
    }

    res.json({ ok: true, data: client });
  } catch (err) {
    next(err);
  }
};

/** Crear cliente */
export const create = async (req, res, next) => {
  try {
    const { id_number } = req.body;

    // Verificar si el ID (Cédula/RIF) ya existe
    if (id_number) {
      const { data: existing, error: checkError } = await supabase
        .from(CLIENTS_TABLE)
        .select('id, first_name, last_name')
        .eq('id_number', id_number)
        .maybeSingle(); // Usamos maybeSingle para que no lance error si no existe

      if (checkError) throw checkError;
      
      if (existing) {
        return res.status(400).json({ 
          ok: false, 
          message: `El número de identificación ${id_number} ya está registrado a nombre de ${existing.first_name} ${existing.last_name}.` 
        });
      }
    }

    const clientData = { ...req.body };
    console.log('DEBUG [CLIENT_CREATE]: Datos a insertar:', JSON.stringify(clientData, null, 2));

    const { data, error } = await supabase
      .from(CLIENTS_TABLE)
      .insert([clientData])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, data, message: 'Cliente registrado correctamente.' });
  } catch (err) {
    next(err);
  }
};

/** Actualizar cliente */
export const update = async (req, res, next) => {
  try {
    let query = supabase.from(CLIENTS_TABLE).update(req.body);

    const { data, error } = await query
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data, message: 'Datos del cliente actualizados.' });
  } catch (err) {
    next(err);
  }
};

/** Desactivar cliente (Soft delete) */
export const remove = async (req, res, next) => {
  try {
    let query = supabase.from(CLIENTS_TABLE).update({ active: false });

    const { error } = await query.eq('id', req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: 'Cliente desactivado del sistema.' });
  } catch (err) {
    next(err);
  }
};
