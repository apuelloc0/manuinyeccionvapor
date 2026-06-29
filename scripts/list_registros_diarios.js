import supabase from '../src/config/db.js';

(async () => {
  try {
    console.log('Consultando registros_diarios (últimos 20)...');
    const { data, error } = await supabase
      .from('registros_diarios')
      .select('id, fecha, hora, turno, estatus, created_at, user_id, gv1_inyectado, gv3_inyectado')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error al consultar registros_diarios:', error.message || error);
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
