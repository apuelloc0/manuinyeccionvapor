import supabase from '../src/config/db.js';

(async () => {
  try {
    console.log('Buscando registros_diarios con estatus=enviado para sincronizar...');

    const { data: regs, error: regsErr } = await supabase
      .from('registros_diarios')
      .select('*')
      .eq('estatus', 'enviado')
      .order('created_at', { ascending: false })
      .limit(200);

    if (regsErr) throw regsErr;
    console.log(`Encontrados ${regs.length} registros a revisar.`);

    let inserted = 0;

    for (const r of regs) {
      // comprobar existencia en steam_reports por pozo+fecha+hora
      const { data: exists, error: exErr } = await supabase
        .from('steam_reports')
        .select('id')
        .eq('pozo_id', r.pozo_id)
        .eq('fecha', r.fecha)
        .eq('hora', r.hora)
        .limit(1);

      if (exErr) {
        console.error('Error comprobando existencia:', exErr.message || exErr);
        continue;
      }

      if (exists && exists.length > 0) {
        console.log(`Ya existe steam_report para registro ${r.id} (pozo ${r.pozo_id} fecha ${r.fecha} hora ${r.hora})`);
        continue;
      }

      const steamReport = {
        pozo_id: r.pozo_id,
        operador_id: r.user_id || null,
        fecha: r.fecha,
        hora: r.hora,
        turno: r.turno === 'dia' ? 'Diurno' : r.turno === 'noche' ? 'Nocturno' : r.turno,
        vapor_producido_dia: Number(r.gv1_inyectado || 0) + Number(r.gv3_inyectado || 0),
        horas_efectivas: 24 - (Number(r.horas_perdidas) || 0),
        horas_perdidas: Number(r.horas_perdidas) || 0,
        causa_downtime: r.causa_downtime,
        sections_data: {},
        daily_log: r.bitacora || null,
        maintenance_checklist: {},
        status: 'sent'
      };

      const { data: ins, error: insErr } = await supabase.from('steam_reports').insert([steamReport]).select().single();
      if (insErr) {
        console.error('Error insertando steam_report para registro', r.id, insErr.message || insErr);
        continue;
      }
      inserted++;
      console.log(`Insertado steam_report ${ins.id} para registro_diario ${r.id}`);
    }

    console.log(`Sincronización completada. Insertados: ${inserted}`);
    process.exit(0);
  } catch (err) {
    console.error('Error inesperado en sincronización:', err.message || err);
    process.exit(1);
  }
})();
