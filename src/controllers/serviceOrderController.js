import supabase from '../config/db.js';

/** Listar órdenes con información relacionada */
export const list = async (req, res, next) => {
  try {
    const { status, technicianId, clientId } = req.query;
    
    // Hacemos un join con vehicles, clients y el nombre del técnico (users)
    let query = supabase
      .from('service_orders')
      .select(`
        *,
        vehicles(*),
        clients(*),
        technician:users!technician_id(full_name),
        order_items(*)
      `);

    // SEGURIDAD SaaS: Filtrar por taller
    // El Super Admin solo ve órdenes si especifica un taller (Soporte)
    // o si busca registros huérfanos (null) para limpieza de datos.
    if (req.user.role === 'SUPER_ADMIN') {
      const filterWsId = req.query.workshopId || req.query.workshop_id;
      query = filterWsId ? query.eq('workshop_id', filterWsId) : query.is('workshop_id', null);
    } else {
      query = query.eq('workshop_id', req.user.workshop_id);
    }

    if (status) query = query.eq('status', status);
    if (technicianId) query = query.eq('technician_id', technicianId);
    if (clientId) query = query.eq('client_id', clientId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Obtener detalle de una orden y sus repuestos/servicios */
export const getOne = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('service_orders')
      .select(`
        *,
        vehicles(*),
        clients(*),
        technician:users!technician_id(full_name),
        items:order_items(*)
      `)
      .eq('id', id)
      .single();

    if (error || !data) return res.status(404).json({ ok: false, message: 'Orden no encontrada' });

    // SEGURIDAD SaaS: Verificar pertenencia
    if (req.user.role !== 'SUPER_ADMIN' && data.workshop_id !== req.user.workshop_id) {
      return res.status(403).json({ ok: false, message: 'Acceso denegado.' });
    }

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
};

/** Crear nueva orden */
export const create = async (req, res, next) => {
  try {
    const { client_id, vehicle_id, diagnosis, fault_description, status, technician_id, fuel_level, reception_checklist, images } = req.body;
    
    // Validación básica preventiva
    if (!client_id || !vehicle_id) {
      return res.status(400).json({ 
        ok: false, 
        message: "client_id y vehicle_id son obligatorios y deben ser UUIDs válidos." 
      });
    }

    const { data, error } = await supabase
      .from('service_orders')
      .insert([{
        client_id,
        vehicle_id,
        workshop_id: req.user.workshop_id,
        diagnosis,
        fault_description,
        fuel_level,
        reception_checklist,
        images: images || [],
        status: status || 'INGRESADO',
        technician_id,
        created_at: new Date(),
        updated_at: new Date()
      }])
      .select(`
        *,
        vehicles(*),
        clients(*),
        technician:users!technician_id(full_name),
        order_items(*)
      `)
      .single();

    if (error) {
      console.error('❌ Error de Supabase al crear orden:', error);
      return res.status(error.code === 'PGRST116' ? 404 : 400).json({ ok: false, message: error.message });
    }

    res.status(201).json({ ok: true, data, message: 'Orden de servicio creada.' });
  } catch (err) {
    next(err); 
  }
};

/** Actualizar estado o diagnóstico */
export const update = async (req, res, next) => {
  try {
    const { 
      client_id, vehicle_id, diagnosis, fault_description, 
      status, technician_id, fuel_level, reception_checklist, images
    } = req.body;

    const updateData = {
      client_id, vehicle_id, diagnosis, fault_description,
      status, technician_id, fuel_level, reception_checklist, images,
      updated_at: new Date()
    };

    // SEGURIDAD SaaS: Solo el Administrador puede marcar la orden como ENTREGADO
    if (status) {
      const upperStatus = status.toUpperCase();
      if (upperStatus === 'ENTREGADO' && !['ADMINISTRADOR', 'SUPER_ADMIN'].includes(req.user.role)) {
        return res.status(403).json({ ok: false, message: 'Solo un administrador puede marcar la orden como entregada al cliente.' });
      }
    }

    // Eliminar campos undefined para evitar errores de columna o sobrescritura accidental
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    let query = supabase
      .from('service_orders')
      .update(updateData);

    // SEGURIDAD SaaS: Solo puede actualizar órdenes de su taller
    if (req.user.role !== 'SUPER_ADMIN') {
      query = query.eq('workshop_id', req.user.workshop_id);
    }

    const { data, error } = await query
      .eq('id', req.params.id)
      .select(`
        *,
        vehicles(*),
        clients(*),
        technician:users!technician_id(full_name),
        order_items(*)
      `)
      .single();

    if (error) {
      console.error('❌ Error de Supabase al actualizar orden:', error);
      return res.status(400).json({ ok: false, message: error.message });
    }

    res.json({ ok: true, data, message: 'Orden actualizada.' });
  } catch (err) {
    next(err);
  }
};

/** Agregar un repuesto a la orden y descontar stock */
export const addItem = async (req, res, next) => {
  try {
    const { id } = req.params; // order_id
    const { part_id, quantity } = req.body;

    // 1. Obtener información del repuesto (precio y stock)
    let partQuery = supabase.from('inventory').select('*').eq('id', part_id);
    
    if (req.user.role !== 'SUPER_ADMIN') {
      partQuery = partQuery.eq('workshop_id', req.user.workshop_id);
    }

    const { data: part, error: partError } = await partQuery.single();

    // 1.1 Verificar que la orden exista y pertenezca al taller
    if (!req.user.workshop_id && req.user.role !== 'SUPER_ADMIN') {
      console.error('❌ Error: El usuario no tiene un workshop_id asociado en su sesión.');
      return res.status(403).json({ ok: false, message: 'Tu sesión no tiene un taller vinculado. Por favor, cierra sesión y vuelve a entrar.' });
    }

    const { data: orderCheck, error: checkError } = await supabase.from('service_orders').select('workshop_id').eq('id', id).single();
    
    // Si la orden no tiene workshop_id (datos antiguos), permitimos la operación para no bloquear.
    const isOwner = !orderCheck?.workshop_id || orderCheck.workshop_id === req.user.workshop_id;

    if (checkError || !orderCheck || (req.user.role !== 'SUPER_ADMIN' && !isOwner)) {
      return res.status(403).json({ ok: false, message: 'Acceso denegado a esta orden.' });
    }

    if (partError || !part) return res.status(404).json({ ok: false, message: 'Repuesto no encontrado' });
    if (part.stock < quantity) return res.status(400).json({ ok: false, message: 'Stock insuficiente en inventario' });

    // 2. Registrar el ítem en la orden
    const { error: itemError } = await supabase
      .from('order_items')
      .insert([{
        order_id: id,
        part_id,
        description: part.name,
        quantity,
        price: part.price_usd || part.price || 0, // CORRECCIÓN: Compatibilidad con diferentes nombres de columna de precio
        workshop_id: req.user.workshop_id // SEGURIDAD SaaS: Vincular el ítem al taller
      }]);

    if (itemError) {
      console.error('❌ ERROR CRÍTICO Supabase (order_items):', {
        code: itemError.code,
        message: itemError.message,
        hint: itemError.hint
      });
      return res.status(400).json({ 
        ok: false, 
        message: 'No se pudo registrar el repuesto en la base de datos.', 
        details: itemError.message 
      });
    }

    // 3. Actualizar el stock en inventario
    const { error: stockError } = await supabase
      .from('inventory')
      .update({ stock: part.stock - quantity })
      .eq('id', part_id)
      .eq('workshop_id', req.user.workshop_id); // SEGURIDAD SaaS: Asegurar stock del taller propio

    if (stockError) {
      console.error('⚠️ Error al descontar stock:', stockError);
    }

    // 4. Devolver la orden completa actualizada
    const { data: order, error: orderError } = await supabase
      .from('service_orders')
      .select(`
        *,
        vehicles(*),
        clients(*),
        technician:users!technician_id(full_name),
        order_items(*)
      `)
      .eq('id', id)
      .single();

    res.status(201).json({ ok: true, data: order, message: 'Repuesto registrado y stock actualizado.' });
  } catch (err) {
    next(err);
  }
};

/** Eliminar un repuesto de la orden y devolver stock */
export const removeItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params; // order_id e item_id (de order_items)

    // 1. Buscar el ítem para saber qué cantidad devolver al inventario
    const { data: item, error: fetchError } = await supabase
      .from('order_items')
      .select('part_id, quantity, workshop_id')
      .eq('id', itemId)
      .single();

    if (fetchError || !item) return res.status(404).json({ ok: false, message: 'Repuesto no encontrado en la orden.' });

    // SEGURIDAD SaaS
    if (req.user.role !== 'SUPER_ADMIN' && item.workshop_id !== req.user.workshop_id) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para modificar esta orden.' });
    }

    // 2. Eliminar el registro de la tabla order_items
    const { error: deleteError } = await supabase.from('order_items').delete().eq('id', itemId);
    if (deleteError) throw deleteError;

    // 3. Restaurar el stock en el inventario
    const { data: part } = await supabase.from('inventory').select('stock').eq('id', item.part_id).single();
    if (part) {
      await supabase
        .from('inventory')
        .update({ stock: part.stock + item.quantity })
        .eq('id', item.part_id)
        .eq('workshop_id', req.user.workshop_id); // SEGURIDAD SaaS: Solo devolver al taller propio
    }

    // 4. Devolver la orden actualizada para refrescar la UI
    const { data: order } = await supabase
      .from('service_orders')
      .select(`
        *,
        vehicles(*),
        clients(*),
        technician:users!technician_id(full_name),
        order_items(*)
      `)
      .eq('id', id)
      .single();

    res.json({ ok: true, data: order, message: 'Repuesto eliminado y stock restaurado.' });
  } catch (err) {
    next(err);
  }
};

/** Eliminar orden */
export const remove = async (req, res, next) => {
  try {
    let query = supabase.from('service_orders').delete().eq('id', req.params.id);

    // SEGURIDAD SaaS: Solo puede eliminar órdenes de su taller
    if (req.user.role !== 'SUPER_ADMIN') {
      query = query.eq('workshop_id', req.user.workshop_id);
    }

    const { error } = await query;
    if (error) throw error;
    res.json({ ok: true, message: 'Orden eliminada.' });
  } catch (err) {
    next(err);
  }
};

/** Subir imagen a Supabase Storage (Buckets) */
export const uploadImage = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, message: 'No se recibió ninguna imagen.' });

    // SEGURIDAD SaaS: Organizamos por ID de taller para aislamiento físico
    let fileExt = file.originalname.split('.').pop();
    const mimeExt = file.mimetype.split('/')[1];

    // Si la extensión no coincide con el mimetype, priorizamos el mimetype
    if (fileExt === 'blob' || !fileExt || (mimeExt && fileExt !== mimeExt)) {
      fileExt = mimeExt || 'jpg';
    }

    const fileName = `${req.user.workshop_id}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('peritaje') // Asegúrate de crear este bucket en el panel de Supabase
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('❌ Error de Storage:', error);
      return res.status(500).json({ ok: false, message: 'Error al guardar en el almacén de fotos.' });
    }

    // IMPORTANTE: Guardamos solo la RUTA RELATIVA (fileName) en la DB
    // Esto hace que el sistema sea más flexible si cambias de dominio
    res.json({ ok: true, url: fileName });
  } catch (err) {
    next(err);
  }
};

/** Eliminar imagen física del Storage */
export const deleteImage = async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, message: 'No se proporcionó la ruta de la imagen.' });

    // Extraer el path relativo si viene la URL completa
    // Ejemplo: .../public/peritaje/WORKSHOP_ID/foto.jpg -> WORKSHOP_ID/foto.jpg
    let filePath = url;
    if (url.includes('/peritaje/')) {
      filePath = url.split('/peritaje/').pop();
    }

    // SEGURIDAD: Verificar que el usuario solo borre fotos de su propio taller
    if (req.user.role !== 'SUPER_ADMIN' && !filePath.startsWith(`${req.user.workshop_id}/`)) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para eliminar este archivo.' });
    }

    const { error } = await supabase.storage
      .from('peritaje')
      .remove([filePath]);

    if (error) throw error;

    res.json({ ok: true, message: 'Archivo eliminado del servidor.' });
  } catch (err) {
    next(err);
  }
};