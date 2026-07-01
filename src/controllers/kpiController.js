import supabase from '../config/db.js';
import { logActivity } from '../services/auditService.js';

// Robust parse for quality fields
const parseQuality = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).replace('%', '').replace(',', '.').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

export const getKpisSummary = async (req, res, next) => {
  try {
    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;
    const { pozoId } = req.query;

    if (!startDate || !endDate) return res.status(400).json({ ok: false, message: 'startDate and endDate required' });

    let query = supabase
      .from('registros_diarios')
      .select('*')
      .gte('fecha', startDate)
      .lte('fecha', endDate);

    if (pozoId) query = query.eq('pozo_id', pozoId);

    const { data, error } = await query.order('fecha', { ascending: true }).order('hora', { ascending: true });
    if (error) throw error;

    // Aggregate by date
    const byDate = new Map();
    const causesMap = {};
    for (const r of (data || [])) {
      const key = r.fecha || 'unknown';
      if (!byDate.has(key)) byDate.set(key, { date: key, gv1: 0, gv3: 0, vapor: 0, calidadSum: 0, calidadCount: 0, horasPerdidas: 0, rows: 0 });
      const bucket = byDate.get(key);

      const gv1 = Number(r.gv1_inyectado) || 0;
      const gv3 = Number(r.gv3_inyectado) || 0;
      const vapor = Number(r.vapor_total) || gv1 + gv3;

      const q1 = parseQuality(r.gv1_calidad);
      const q3 = parseQuality(r.gv3_calidad);
      const rowQuals = [q1, q3].filter((x) => x !== null && x !== undefined);
      if (rowQuals.length > 0) {
        bucket.calidadSum += rowQuals.reduce((a, b) => a + b, 0) / rowQuals.length;
        bucket.calidadCount += 1;
      } else if (r.calidad_promedio !== undefined && r.calidad_promedio !== null && r.calidad_promedio !== '') {
        const cp = parseQuality(r.calidad_promedio);
        if (cp !== null) { bucket.calidadSum += cp; bucket.calidadCount += 1; }
      }

      bucket.gv1 += gv1;
      bucket.gv3 += gv3;
      bucket.vapor += vapor;
      bucket.horasPerdidas += Number(r.horas_perdidas || 0);
      bucket.rows += 1;

      if (r.causa_downtime) {
        causesMap[r.causa_downtime] = (causesMap[r.causa_downtime] || 0) + Number(r.horas_perdidas || 0);
      }
    }

    const series = Array.from(byDate.values()).map((b) => ({
      date: b.date,
      gv1: Math.round(b.gv1 * 100) / 100,
      gv3: Math.round(b.gv3 * 100) / 100,
      vapor: Math.round(b.vapor * 100) / 100,
      calidad_promedio: b.calidadCount ? +(b.calidadSum / b.calidadCount).toFixed(1) : 0,
      horas_perdidas: Math.round(b.horasPerdidas * 10) / 10,
      rows: b.rows,
    }));

    const totals = series.reduce((acc, s) => {
      acc.vaporTotal += s.vapor;
      acc.horasPerdidasTotal += s.horas_perdidas;
      acc.qualitySum += s.calidad_promedio * (s.rows || 1);
      acc.rows += s.rows || 0;
      return acc;
    }, { vaporTotal: 0, horasPerdidasTotal: 0, qualitySum: 0, rows: 0 });

    const avgQuality = totals.rows ? +(totals.qualitySum / totals.rows).toFixed(1) : 0;

    // Audit log
    try { await logActivity({ user_id: req.user?.id || null, action: 'READ', table_name: 'kpis', record_id: null, old_value: null, new_value: { startDate, endDate, returned: series.length } }); } catch (e) { /* ignore */ }

    res.json({ ok: true, data: series, totals: { vaporTotal: totals.vaporTotal, horasPerdidasTotal: totals.horasPerdidasTotal, avgQuality }, causes: Object.entries(causesMap).map(([k, v]) => ({ name: k, value: Math.round(v * 10) / 10 })) });
  } catch (err) { next(err); }
};

export const getKpisTopPozos = async (req, res, next) => {
  try {
    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;
    if (!startDate || !endDate) return res.status(400).json({ ok: false, message: 'startDate and endDate required' });

    let query = supabase
      .from('registros_diarios')
      .select('pozo_id, vapor_total, pozos ( numero, macollas ( nombre ) )')
      .gte('fecha', startDate)
      .lte('fecha', endDate);

    const { data, error } = await query.order('pozo_id', { ascending: true });
    if (error) throw error;

    // Aggregate by pozo_id
    const map = new Map();
    for (const r of (data || [])) {
      const pid = r.pozo_id || r.pozo_id === 0 ? String(r.pozo_id) : 'unknown';
      const vapor = Number(r.vapor_total) || 0;
      const numero = r.pozos?.numero ?? null;
      const macolla = r.pozos?.macollas?.nombre ?? null;
      if (!map.has(pid)) map.set(pid, { pozo_id: pid, numero, macolla, vapor: 0 });
      const cur = map.get(pid);
      cur.vapor += vapor;
    }

    const list = Array.from(map.values()).sort((a, b) => b.vapor - a.vapor).map((x) => ({ ...x, vapor: Math.round(x.vapor * 100) / 100 }));

    res.json({ ok: true, data: list });
  } catch (err) { next(err); }
};

export default { getKpisSummary, getKpisTopPozos };
