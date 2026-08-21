import supabase from '../src/config/db.js';

async function run() {
  try {
    const { data, error } = await supabase
      .from('registros_diarios')
      .select('id, fecha, gv1_tds, gv1_cloruro, gv1_cld_cond, gv1_calidad, gv3_tds, gv3_cloruro, gv3_cld_cond, gv3_calidad, gv1_inyectado, gv3_inyectado')
      .gte('fecha', '2026-08-01')
      .lte('fecha', '2026-08-31')
      .order('fecha', { ascending: true });

    if (error) {
      console.error('Error querying registros_diarios:', error);
      process.exit(1);
    }

    console.log(`Found ${Array.isArray(data) ? data.length : 0} registros for August 2026`);
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e.message || e);
    process.exit(2);
  }
}

run();
