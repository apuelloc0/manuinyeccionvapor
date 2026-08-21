import supabase from '../config/db.js';

export const registrosPublic = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('registros_diarios')
      .select(`id, fecha, hora, pozo_id, gv1_tds, gv1_cloruro, gv1_cld_cond, gv1_calidad, gv1_inyectado, gv3_tds, gv3_cloruro, gv3_cld_cond, gv3_calidad, gv3_inyectado`)
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true });

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error('❌ [DEBUG_REGISTROS_ERROR]:', err.message || err);
    next(err);
  }
};

export const tendenciaDebug = async (req, res, next) => {
  try {
    const month = req.query.month; // expected YYYY-MM
    if (!month) return res.status(400).json({ ok: false, message: 'month query param required YYYY-MM' });
    const parts = String(month).split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const start = new Date(y, m, 1).toISOString().slice(0, 10);
    const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);

    console.log('[DEBUG] tendenciaDebug requested for month', month, 'from', req.ip);
    const { data, error } = await supabase.from('registros_diarios')
      .select('fecha, gv1_tds, gv1_cloruro, gv1_cld_cond, gv3_tds, gv3_cloruro, gv3_cld_cond')
      .gte('fecha', start)
      .lte('fecha', end)
      .order('fecha', { ascending: true });

    if (error) throw error;
    const days = new Date(y, m + 1, 0).getDate();
    const mapByDay = {};
    (data || []).forEach((r) => {
      const key = (new Date(r.fecha)).toISOString().slice(0, 10);
      mapByDay[key] = mapByDay[key] || { tds: [], cl: [], cond: [] };
      if (r.gv1_tds !== null && r.gv1_tds !== undefined) mapByDay[key].tds.push(Number(r.gv1_tds));
      if (r.gv3_tds !== null && r.gv3_tds !== undefined) mapByDay[key].tds.push(Number(r.gv3_tds));
      if (r.gv1_cloruro !== null && r.gv1_cloruro !== undefined) mapByDay[key].cl.push(Number(r.gv1_cloruro));
      if (r.gv3_cloruro !== null && r.gv3_cloruro !== undefined) mapByDay[key].cl.push(Number(r.gv3_cloruro));
      if (r.gv1_cld_cond !== null && r.gv1_cld_cond !== undefined) mapByDay[key].cond.push(Number(r.gv1_cld_cond));
      if (r.gv3_cld_cond !== null && r.gv3_cld_cond !== undefined) mapByDay[key].cond.push(Number(r.gv3_cld_cond));
    });

    const monthArr = [];
    for (let day = 1; day <= days; day++) {
      const dateStr = new Date(y, m, day).toISOString().slice(0, 10);
      const label = dateStr.slice(5);
      const entry = mapByDay[dateStr];
      const avg = (arr) => arr && arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
      monthArr.push({ fecha: label, tds: avg(entry?.tds), cloruro: avg(entry?.cl), conductividad: avg(entry?.cond) });
    }

    res.json({ ok: true, data: monthArr });
  } catch (err) {
    console.error('❌ [DEBUG_TENDENCIA_ERROR]:', err.message || err);
    next(err);
  }
};

