import supabase from '../src/config/db.js';

(async () => {
  try {
    console.log('Insertando reporte de prueba en steam_reports...');

    // Intentar encontrar un pozo existente para relacionarlo
    const { data: pozos } = await supabase.from('pozos').select('id, numero').limit(1);
    const pozoId = pozos && pozos.length > 0 ? pozos[0].id : null;

    const reportData = {
      pozo_id: pozoId,
      operador_id: null,
      fecha: '2026-06-15',
      hora: '00:00',
      turno: 'Diurno',
      vapor_producido_dia: 12.5,
      horas_efectivas: 24,
      horas_perdidas: 0,
      causa_downtime: null,
      sections_data: {},
      daily_log: 'Registro de prueba insertado por script de seeds',
      maintenance_checklist: {},
      status: 'sent',
    };

    const { data, error } = await supabase.from('steam_reports').insert([reportData]).select().single();

    if (error) {
      console.error('Error al insertar:', error.message || error);
      process.exit(1);
    }

    console.log('Inserción exitosa. ID:', data.id);
    console.log(data);
    process.exit(0);
  } catch (err) {
    console.error('Error inesperado:', err.message || err);
    process.exit(1);
  }
})();
