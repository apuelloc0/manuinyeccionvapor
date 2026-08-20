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
    const computeQualityFromComponents = (r) => {
      const safe = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(String(v).replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      const vals = [];
      const tds = safe(r.gv1_tds ?? r.gv3_tds ?? r.gv1TDS ?? r.gv3TDS);
      const cl1 = safe(r.gv1_cloruro ?? r.gv1_clorulo ?? r.gv3_cloruro ?? r.gv3_clorulo);
      const cond = safe(r.gv1_cld_cond ?? r.gv3_cld_cond ?? r.gv1_conductividad ?? r.gv3_conductividad);
      if (tds !== null) vals.push(tds);
      if (cl1 !== null) vals.push(cl1);
      if (cond !== null) vals.push(cond);
      if (!vals.length) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Math.round(avg * 10) / 10;
    };

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
      const compQ = computeQualityFromComponents(r);
      if (rowQuals.length > 0) {
        const sumRowQuals = rowQuals.reduce((a, b) => a + b, 0);
        if (sumRowQuals === 0 && compQ !== null) {
          // explicit qualities are zero but we have component data — prefer components
          bucket.calidadSum += compQ; bucket.calidadCount += 1;
        } else {
          bucket.calidadSum += sumRowQuals / rowQuals.length;
          bucket.calidadCount += 1;
        }
      } else if (r.calidad_promedio !== undefined && r.calidad_promedio !== null && r.calidad_promedio !== '') {
        const cp = parseQuality(r.calidad_promedio);
        if (cp !== null) { bucket.calidadSum += cp; bucket.calidadCount += 1; }
      } else if (compQ !== null) {
        bucket.calidadSum += compQ; bucket.calidadCount += 1;
      } else {
          // no quality data available from explicit fields or components
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

    // Build series; ensure we return an entry for every date in the requested range
    const dateMap = new Map(Array.from(byDate.entries()).map(([k, b]) => [k, b]));
    const series = [];
    // Helper to format date string YYYY-MM-DD
    const fmt = (d) => d.toISOString().slice(0, 10);
    try {
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime()) && sDate <= eDate) {
        for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
          const key = fmt(d);
          const b = dateMap.get(key) || { date: key, gv1: 0, gv3: 0, vapor: 0, calidadSum: 0, calidadCount: 0, horasPerdidas: 0, rows: 0 };
          series.push({
            date: key,
            gv1: Math.round((b.gv1 || 0) * 100) / 100,
            gv3: Math.round((b.gv3 || 0) * 100) / 100,
            vapor: Math.round((b.vapor || 0) * 100) / 100,
            calidad_promedio: (b.calidadCount && b.calidadCount > 0) ? +((b.calidadSum / b.calidadCount).toFixed(1)) : 0,
            horas_perdidas: Math.round((b.horasPerdidas || 0) * 10) / 10,
            rows: b.rows || 0,
          });
        }
      } else {
        // fallback: iterate known date buckets
        for (const b of Array.from(byDate.values())) {
          series.push({
            date: b.date,
            gv1: Math.round(b.gv1 * 100) / 100,
            gv3: Math.round(b.gv3 * 100) / 100,
            vapor: Math.round(b.vapor * 100) / 100,
            calidad_promedio: b.calidadCount ? +(b.calidadSum / b.calidadCount).toFixed(1) : 0,
            horas_perdidas: Math.round(b.horasPerdidas * 10) / 10,
            rows: b.rows,
          });
        }
      }
    } catch (e) {
      // on any error, fall back to existing series build
      for (const b of Array.from(byDate.values())) {
        series.push({
          date: b.date,
          gv1: Math.round(b.gv1 * 100) / 100,
          gv3: Math.round(b.gv3 * 100) / 100,
          vapor: Math.round(b.vapor * 100) / 100,
          calidad_promedio: b.calidadCount ? +(b.calidadSum / b.calidadCount).toFixed(1) : 0,
          horas_perdidas: Math.round(b.horasPerdidas * 10) / 10,
          rows: b.rows,
        });
      }
    }

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
