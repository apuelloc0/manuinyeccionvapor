import supabase from '../src/config/db.js';

(async () => {
  try {
    console.log('Consultando últimos 10 registros de steam_reports (detalle)...');

    const { data, error } = await supabase
      .from('steam_reports')
      .select('id, fecha, hora, turno, created_at, updated_at, status, vapor_producido_dia, operador_id')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error al consultar steam_reports:', error.message || error);
      process.exit(1);
    }

    console.log(`Filas devueltas: ${data.length}`);
    console.table(data);
    process.exit(0);
  } catch (err) {
    console.error('Error inesperado:', err.message || err);
    process.exit(1);
  }
})();
