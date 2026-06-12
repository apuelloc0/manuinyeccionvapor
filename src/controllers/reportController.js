import supabase from '../config/db.js';

/**
 * Genera un resumen estadístico de inyección para un rango de fechas.
 * Útil para comparaciones mensuales y evaluaciones de gestión.
 */
export const getProductionReport = async (req, res, next) => {
  try {
    const { startDate, endDate, pozoId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ ok: false, message: 'Se requieren fechas de inicio y fin.' });
    }

    let query = supabase
      .from('steam_reports')
      .select(`
        *,
        pozos ( numero, macollas ( nombre ) )
      `)
      .gte('fecha', startDate)
      .lte('fecha', endDate)
      .eq('status', 'sent'); // Solo reportes finalizados

    if (pozoId) query = query.eq('pozo_id', pozoId);

    const { data, error } = await query.order('fecha', { ascending: true });

    if (error) throw error;

    // Cálculos de totales para el periodo
    const totals = data.reduce((acc, curr) => {
      acc.vaporTotal += Number(curr.vapor_producido_dia || 0);
      acc.horasEfectivasTotal += Number(curr.horas_efectivas || 0);
      acc.horasPerdidasTotal += Number(curr.horas_perdidas || 0);
      return acc;
    }, { vaporTotal: 0, horasEfectivasTotal: 0, horasPerdidasTotal: 0 });

    res.json({ ok: true, data, totals });
  } catch (err) {
    next(err);
  }
};