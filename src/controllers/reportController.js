import supabase from '../config/db.js';
import { logActivity } from '../services/auditService.js';

/**
 * Genera un resumen estadístico de inyección para un rango de fechas.
 * Útil para comparaciones mensuales y evaluaciones de gestión.
 */
export const getProductionReport = async (req, res, next) => {
  try {
    // Aceptamos tanto los nombres nuevos (startDate/endDate) como los antiguos (start/end)
    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;
    const { pozoId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ ok: false, message: 'Se requieren fechas de inicio y fin.' });
    }

    // Usar registros_diarios para exportar los detalles completos
    let query = supabase
      .from('registros_diarios')
      .select(`
        *,
        pozos ( numero, macollas ( nombre ) )
      `)
      .gte('fecha', startDate)
      .lte('fecha', endDate)

    if (pozoId) query = query.eq('pozo_id', pozoId);

    const { data, error } = await query.order('fecha', { ascending: true }).order('hora', { ascending: true });

    if (error) throw error;

    // Enriquecer filas con cálculos que otros endpoints ya proveían (vapor_total, calidad_promedio)
    // Helper: parse numeric quality values robustly (handles "85%", "85,5", etc.)
    const parseQuality = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const s = String(v).replace('%', '').replace(',', '.').trim();
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    };

    const enriched = (data || []).map((r) => {
      const gv1_iny = Number(r.gv1_inyectado) || 0;
      const gv3_iny = Number(r.gv3_inyectado) || 0;
      const vapor_total = Number(r.vapor_total) || gv1_iny + gv3_iny;

      const q1 = parseQuality(r.gv1_calidad);
      const q3 = parseQuality(r.gv3_calidad);
      const calidades = [q1, q3].filter((c) => c !== null && c !== undefined);

      let calidad_promedio = 0;
      if (calidades.length > 0) {
        calidad_promedio = calidades.reduce((a, b) => Number(a) + Number(b), 0) / calidades.length;
      } else if (r.calidad_promedio !== undefined && r.calidad_promedio !== null && r.calidad_promedio !== '') {
        const cp = parseQuality(r.calidad_promedio);
        calidad_promedio = cp !== null ? cp : 0;
      }

      // normalize horas_perdidas / horas_efectivas: if horas_efectivas is missing, derive from horas_perdidas
      const horasPerd = Number(r.horas_perdidas || 0);
      const horasEf = (r.horas_efectivas !== undefined && r.horas_efectivas !== null && r.horas_efectivas !== '')
        ? Number(r.horas_efectivas)
        : Math.max(0, 24 - horasPerd);

      return {
        ...r,
        vapor_total,
        calidad_promedio,
        horas_perdidas: horasPerd,
        horas_efectivas: horasEf,
      };
    });

    // Cálculos de totales para el periodo (usar registros enriquecidos)
    const totals = enriched.reduce((acc, curr) => {
      // Algunos reportes usan `vapor_producido_dia`, otros `vapor_total`.
      const vapor = Number(curr.vapor_producido_dia || curr.vapor_total || 0);
      const hrsEf = Number(curr.horas_efectivas || 0) || 0;
      const hrsPer = Number(curr.horas_perdidas || 0) || 0;
      acc.vaporTotal += vapor;
      acc.horasEfectivasTotal += hrsEf;
      acc.horasPerdidasTotal += hrsPer;
      return acc;
    }, { vaporTotal: 0, horasEfectivasTotal: 0, horasPerdidasTotal: 0 });

    // Registrar lectura en auditoría (no bloquear la respuesta si falla)
    try {
      await logActivity({
        user_id: req.user?.id || null,
        action: 'READ',
        table_name: 'steam_reports',
        record_id: null,
        old_value: null,
        new_value: { startDate, endDate, returned: Array.isArray(enriched) ? enriched.length : 0 }
      });
    } catch (auditErr) {
      console.error('Error registrando auditoría de lectura:', auditErr.message || auditErr);
    }

    // Devolver filas enriquecidas para que el cliente reciba `calidad_promedio` y `vapor_total`.
    res.json({ ok: true, data: enriched, totals });
  } catch (err) {
    next(err);
  }
};

// Generar PDF del reporte para un rango de fechas (devuelve application/pdf)
import PDFDocument from 'pdfkit';

export const exportProductionPdf = async (req, res, next) => {
  try {
    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;
    const { pozoId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ ok: false, message: 'Se requieren fechas de inicio y fin.' });
    }

    let query = supabase
      .from('steam_reports')
      .select(`*, pozos ( numero, macollas ( nombre ) )`)
      .gte('fecha', startDate)
      .lte('fecha', endDate)
      .eq('status', 'sent');

    if (pozoId) query = query.eq('pozo_id', pozoId);

    const { data, error } = await query.order('fecha', { ascending: true });
    if (error) throw error;

    // Generar PDF en memoria
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);
      // Auditoría: registrar export
      try {
        await logActivity({
          user_id: req.user?.id || null,
          action: 'EXPORT_PDF',
          table_name: 'steam_reports',
          record_id: null,
          new_value: { startDate, endDate, exported: Array.isArray(data) ? data.length : 0 }
        });
      } catch (aErr) {
        console.error('Error registrando auditoría de export PDF:', aErr.message || aErr);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Reporte_Inyeccion_${startDate}_al_${endDate}.pdf`);
      res.send(pdfData);
    });

    // Header
    doc.fontSize(18).text('Reporte de Inyección de Vapor', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Periodo: ${startDate} - ${endDate}`, { align: 'center' });
    doc.moveDown(1);

    // Detalle por reporte (bloques para facilitar lectura)
    doc.fontSize(11);

    // Totales locales (usar vapor_total o calcular desde gv1/gv3)
    const totals = data.reduce((acc, curr) => {
      const gv1 = Number(curr.gv1_inyectado) || 0;
      const gv3 = Number(curr.gv3_inyectado) || 0;
      const vapor = Number(curr.vapor_total || gv1 + gv3 || 0);
      const hrsEf = Number(24 - (curr.horas_perdidas || 0)) || 0;
      const hrsPer = Number(curr.horas_perdidas || 0) || 0;
      acc.vaporTotal += vapor;
      acc.horasEfectivasTotal += hrsEf;
      acc.horasPerdidasTotal += hrsPer;
      return acc;
    }, { vaporTotal: 0, horasEfectivasTotal: 0, horasPerdidasTotal: 0 });

    for (const r of data) {
      const fecha = r.fecha || '';
      const hora = r.hora || '';
      const pozoNum = r.pozos?.numero ? `${r.pozos.numero}` : 'N/A';
      const macolla = r.pozos?.macollas?.nombre || r.macolla || 'N/A';
      const operador = r.operador_nombre || r.operador || '-';
      const gv1_iny = Number(r.gv1_inyectado) || 0;
      const gv3_iny = Number(r.gv3_inyectado) || 0;
      const vapor = Number(r.vapor_total || gv1_iny + gv3_iny || 0).toFixed(1);
      const hrsEf = Math.round(Number(24 - (r.horas_perdidas || 0)) || 0);
      const hrsPer = Math.round(Number(r.horas_perdidas || 0) || 0);
      const obs = String(r.causa_downtime || r.bitacora || r.daily_log || '-');

      doc.fontSize(10).text(`Fecha: ${fecha}`);
      doc.fontSize(10).text(`Hora: ${hora}`);
      doc.fontSize(10).text(`Macolla: ${macolla}`);
      doc.fontSize(10).text(`Pozo: ${pozoNum}`);
      doc.fontSize(10).text(`Operador: ${operador}`);
      doc.moveDown(0.2);

      doc.fontSize(10).text(`Vapor producido: ${vapor} ton`);
      doc.fontSize(10).text(`Horas efectivas: ${hrsEf}`);
      doc.fontSize(10).text(`Horas perdidas: ${hrsPer}`);

      // Generadores y parámetros (si existen)
      doc.moveDown(0.2);
      doc.fontSize(10).text('Generador #1 — Presión salida / Temp / Calidad / Flujo agua / Flujo gas / Inyectado');
      doc.fontSize(9).text(`${r.gv1_presion || 0} psi / ${r.gv1_temp || 0} °F / ${r.gv1_calidad || 0}% / ${r.gv1_flujo_agua || 0} gal/min / ${r.gv1_flujo_gas || 0} ft³/Hr / ${gv1_iny} ton`);
      doc.moveDown(0.1);
      doc.fontSize(10).text('Generador #3 — Presión salida / Temp / Calidad / Flujo agua / Flujo gas / Inyectado');
      doc.fontSize(9).text(`${r.gv3_presion || 0} psi / ${r.gv3_temp || 0} °F / ${r.gv3_calidad || 0}% / ${r.gv3_flujo_agua || 0} gal/min / ${r.gv3_flujo_gas || 0} ft³/Hr / ${gv3_iny} ton`);

      doc.moveDown(0.2);
      doc.fontSize(10).text('Cabezal y química:');
      doc.fontSize(9).text(`Presión cabezal: ${r.presion_cabezal || 0} psi — Temp cabezal: ${r.temp_cabezal || 0} °F`);
      doc.fontSize(9).text(`PH alimentación: ${r.ph_alimentacion || '-'} — PH retorno: ${r.ph_retorno || '-'}`);
      doc.fontSize(9).text(`Pres. Rev. Prod: ${r.pres_rev_prod || 0} psi — Temp Rev. Prod: ${r.temp_rev_prod || 0} °F`);
      doc.fontSize(9).text(`Pres. Rev. Sup: ${r.pres_rev_sup || 0} psi — Temp Rev. Sup: ${r.temp_rev_sup || 0} °F`);

      doc.moveDown(0.2);
      doc.fontSize(10).text('Observaciones:');
      doc.fontSize(9).text(obs, { width: 480 });
      doc.moveDown(0.5);

      // Separador
      doc.strokeColor('#cccccc').lineWidth(0.5).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
      doc.moveDown(0.5);

      // Añadir nueva página si estamos cerca del final
      if (doc.y > doc.page.height - 140) doc.addPage();
    }

    // Resumen de totales al final
    doc.moveDown(0.5);
    doc.fontSize(11).text('Totales del periodo', { underline: true });
    doc.moveDown(0.2);
    doc.fontSize(10).text(`Vapor total: ${Number(totals.vaporTotal).toFixed(1)} ton`);
    doc.fontSize(10).text(`Horas efectivas totales: ${Math.round(totals.horasEfectivasTotal)}`);
    doc.fontSize(10).text(`Horas perdidas totales: ${Math.round(totals.horasPerdidasTotal)}`);

    doc.end();
  } catch (err) {
    next(err);
  }
};