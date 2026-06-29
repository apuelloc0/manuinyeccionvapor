import supabase from '../src/config/db.js';

(async () => {
  try {
    console.log('Consultando tabla steam_reports...');

    const { data, error } = await supabase
      .from('steam_reports')
      .select('id, fecha, status, pozo_id')
      .order('fecha', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error al consultar steam_reports:', error.message || error);
      process.exit(1);
    }

    console.log(`Filas devueltas: ${data.length}`);
    console.table(data);

    const { data: sentData, error: sentError, count: sentCount } = await supabase
      .from('steam_reports')
      .select('id', { count: 'exact' })
      .eq('status', 'sent');

    if (sentError) {
      console.error('Error al contar status=sent:', sentError.message || sentError);
    } else {
      console.log(`Registros con status='sent': ${sentCount}`);
    }

    // También mostrar min/max fecha para verificar formato
    const { data: minMax, error: mmErr } = await supabase.rpc('get_min_max_fecha', {});
    if (!mmErr && minMax) {
      console.log('Min/Max fecha (RPC):', minMax);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error inesperado:', err.message || err);
    process.exit(1);
  }
})();
