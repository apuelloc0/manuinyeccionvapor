import supabase from '../config/db.js';
import { logActivity } from '../services/auditService.js';
import fs from 'fs';
import path from 'path';

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
        // normalize and provide both legacy and new field names used by frontend
        vapor_total,
        vapor_producido_dia: Number(r.vapor_producido_dia ?? vapor_total) || 0,
        calidad_promedio: Number(calidad_promedio) || 0,
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
    console.log('exportProductionPdf called, auth disabled test value:', process.env.DISABLE_AUTH_FOR_TEST);
    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;
    const { pozoId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ ok: false, message: 'Se requieren fechas de inicio y fin.' });
    }

    // Use registros_diarios to ensure all detailed fields are available for export
    let query = supabase
      .from('registros_diarios')
      .select(`*, pozos ( numero, macollas ( nombre ) )`)
      .gte('fecha', startDate)
      .lte('fecha', endDate);

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

      // Añadir cabeceras de depuración indicando si se encontró el encabezado
      try {
        if (resolvedHeaderPath) {
          res.setHeader('X-Encabezado-Found', 'true');
          res.setHeader('X-Encabezado-Path', resolvedHeaderPath);
          console.log('Usando encabezado de archivo (detectado al final):', resolvedHeaderPath);
        } else {
          res.setHeader('X-Encabezado-Found', 'false');
          res.setHeader('X-Encabezado-Path', 'none');
          console.log('No se encontró imagen de encabezado (detectado al final)');
        }
      } catch (hdrErr) {
        console.warn('No se pudieron establecer cabeceras de depuración:', hdrErr?.message || hdrErr);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Reporte_Inyeccion_${startDate}_al_${endDate}.pdf`);
      res.send(pdfData);
    });

    // Use Letter page size for 'tamaño carta'
    // (recreate doc with LETTER if not already)
    // Note: pdfkit does not allow changing size after creation; recreate doc if needed
    if (doc.page && doc.page.width && doc.page.height && doc.options && doc.options.size !== 'LETTER' ) {
      // noop - keeping existing doc since created earlier; in most runtimes doc created with A4.
    }

    // Header: preferir imagen corporativa si existe, en cada página
    const headerCandidates = [
      path.join(process.cwd(), 'public', 'templates', 'encabezado.png'),
      path.join(process.cwd(), 'public', 'template', 'encabezado.png'),
      path.join(process.cwd(), 'public', 'templates', 'encabezado.PNG'),
      path.join(process.cwd(), 'public', 'template', 'encabezado.PNG'),
      path.join(process.cwd(), 'public', 'templates', 'encabezado.jpg'),
      path.join(process.cwd(), 'public', 'template', 'encabezado.jpg'),
      path.join(process.cwd(), 'public', 'templates', 'encabezado.jpeg'),
      path.join(process.cwd(), 'public', 'template', 'encabezado.jpeg')
    ];

    const findHeaderPath = () => {
      for (const p of headerCandidates) {
        try {
          if (fs.existsSync(p)) return p;
        } catch (e) {
          // ignore
        }
      }
      return null;
    };

    const resolvedHeaderPath = findHeaderPath();

    const drawHeaderImage = (imagePath) => {
      try {
        const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        // Fit the image to the available page width and allow a taller header (140pt)
        // so the logo and text are visible. `fit` preserves aspect ratio.
        const imgOpts = { fit: [maxWidth, 140], align: 'center' };
        doc.image(imagePath, doc.page.margins.left, doc.page.margins.top - 10, imgOpts);
        doc.moveDown(1.5);
      } catch (e) {
        console.error('No se pudo renderizar imagen de encabezado en PDF:', e.message || e);
      }
    };

    if (resolvedHeaderPath) {
      drawHeaderImage(resolvedHeaderPath);
      doc.on('pageAdded', () => {
        drawHeaderImage(resolvedHeaderPath);
      });
    } else {
      // Fallback textual si no hay imagen disponible
      doc.fontSize(18).text('Reporte de Inyección de Vapor', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Periodo: ${startDate} - ${endDate}`, { align: 'center' });
      doc.moveDown(1);
    }

    // Detalle por reporte (bloques para facilitar lectura)
    doc.fontSize(11);

    // Helper: render a grid of label/value pairs with adaptive columns, wrapping and page breaks
    const renderPairsGrid = (pairs, opts = {}) => {
      const labelFontSize = opts.labelFontSize || 9;
      const valueFontSize = opts.valueFontSize || 10;
      const spacingY = opts.spacingY || 6;
      const minColWidth = opts.minColWidth || 180; // minimum width per column

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const availableWidth = right - left;
      const colCount = Math.max(1, Math.min(4, Math.floor(availableWidth / minColWidth)));
      const colGap = 10;
      const colWidth = Math.floor((availableWidth - colGap * (colCount - 1)) / colCount);

      // chunk into rows
      for (let i = 0; i < pairs.length; i += colCount) {
        const chunk = pairs.slice(i, i + colCount);

        // measure row height based on tallest cell in chunk
        let rowHeight = 0;
        for (const [label, value] of chunk) {
          doc.font('Helvetica-Bold').fontSize(labelFontSize);
          const lh = doc.heightOfString(String(label || ''), { width: colWidth });
          doc.font('Helvetica').fontSize(valueFontSize);
          const vh = doc.heightOfString(String(value ?? ''), { width: colWidth });
          rowHeight = Math.max(rowHeight, lh + vh + spacingY);
        }

        // if not enough space, add page
        const bottomLimit = doc.page.height - doc.page.margins.bottom - 30; // reserve footer space
        if (doc.y + rowHeight > bottomLimit) {
          doc.addPage();
        }

        // render each cell in the row
        let x = left;
        for (let ci = 0; ci < chunk.length; ci++) {
          const [label, value] = chunk[ci];
          // label
          doc.font('Helvetica-Bold').fontSize(labelFontSize).fillColor('black');
          doc.text(String(label || ''), x, doc.y, { width: colWidth, continued: false });
          // value below label
          doc.moveDown(0);
          doc.font('Helvetica').fontSize(valueFontSize).fillColor('black');
          doc.text(String(value == null ? '' : value), x, doc.y, { width: colWidth });

          // move x
          x += colWidth + colGap;
        }

        // advance y by rowHeight
        doc.moveDown(0);
        doc.y = doc.y + (rowHeight - (doc.currentLineHeight() || 0));
      }
    };

    const renderSection = (title, pairs) => {
      // section title with green band and white text for clear separation
      const left = doc.page.margins.left;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const titleHeight = 28;
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;
      if (doc.y + titleHeight > bottomLimit) doc.addPage();

      // small top spacing before band for visual separation
      doc.moveDown(0.25);
      // draw colored band
      doc.save();
      doc.fillColor('#2f7a18').rect(left, doc.y, width, titleHeight).fill();
      // draw title text in white inside band (larger font for emphasis)
      doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text(title, left + 10, doc.y + 7, { width: width - 20 });
      doc.restore();

      // move cursor below band with extra padding
      doc.moveDown(1.8);

      // render grid for this section
      renderPairsGrid(pairs, { minColWidth: 160 });

      // thicker separator line below section for clearer division
      if (doc.y + 12 > bottomLimit) doc.addPage();
      doc.save();
      doc.lineWidth(1.0).strokeColor('#bdbdbd');
      doc.moveTo(left, doc.y + 6).lineTo(left + width, doc.y + 6).stroke();
      doc.restore();
      doc.moveDown(0.8);
    };

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

      // Build sections as label/value pairs
      const cabezalPairs = [
        ['Presión cabezal (psi)', r.presion_cabezal || 0],
        ['Temp. cabezal (°F)', r.temp_cabezal || 0],
        ['Pres. Rev. Prod (psi)', r.pres_rev_prod || 0],
        ['Temp. Rev. Prod (°F)', r.temp_rev_prod || 0],
        ['Pres. Rev. Sup (psi)', r.pres_rev_sup || 0],
        ['Temp. Rev. Sup (°F)', r.temp_rev_sup || 0],
        ['Elongación (pulg)', r.elongacion || 0],
        ['TK1', r.tk1_nivel || '-'],
        ['TK2', r.tk2_nivel || '-'],
        ['TK3', r.tk3_nivel || '-'],
        ['PH Alimentación', r.ph_alimentacion || '-'],
        ['PH Retorno', r.ph_retorno || '-'],
      ];

      const gv1Pairs = [
        ['GV1 Pres Qnt (psi)', r.gv1_pres_qnt || 0],
        ['GV1 Presión (psi)', r.gv1_presion || 0],
        ['GV1 Pres In Zona Convecc (psi)', r.gv1_pres_in_zona_convecc || r.gv1PresInZonaConvecc || 0],
        ['GV1 Pres Out Zona Convecc (psi)', r.gv1_pres_out_zona_convecc || r.gv1PresOutZonaConvecc || 0],
        ['GV1 Pres PI VC (psi)', r.gv1_pres_pi_vc || r.gv1PresPiVc || 0],
        ['GV1 Pres PIT VC (psi)', r.gv1_pres_pit_vc || r.gv1PresPitVc || 0],
        ['GV1 Pres Vapor (psi)', r.gv1_pres_vapor || r.gv1PresVapor || 0],
        ['GV1 Temp (°F)', r.gv1_temp || 0],
        ['GV1 Temp TI VC', r.gv1_temp_ti_vc || r.gv1TempTiVc || 0],
        ['GV1 Temp Vapor', r.gv1_temp_vapor || r.gv1TempVapor || 0],
        ['GV1 Temp Tubo', r.gv1_temp_tubo || r.gv1TempTubo || 0],
        ['GV1 Temp Chimenea', r.gv1_temp_chimenea || r.gv1TempChimenea || 0],
        ['GV1 Calidad (%)', r.gv1_calidad || r.gv1Cal || 0],
        ['GV1 Calidad seteada', r.gv1_calidad_seteada || r.gv1CalSeteada || 0],
        ['GV1 Calidad equipo', r.gv1_calidad_equipo || r.gv1CalEquipo || 0],
        ['GV1 Cld Conductividad', r.gv1_cld_cond || r.gv1CldadCond || 0],
        ['GV1 Cloruro (%)', (r.gv1_cloruro ?? r.gv1_clorulo) || 0],
        ['GV1 TDS (%)', r.gv1_tds || 0],
        ['GV1 Dureza (ppm)', r.gv1_dureza || 0],
        ['GV1 O2 (ppm)', r.gv1_o2 || 0],
        ['GV1 Pres Gas Sist (psi)', r.gv1_pres_gas_sist || r.gv1PresGasSist || 0],
        ['GV1 Pres Gas GV (psi)', r.gv1_pres_gas_gv || r.gv1PresGasGv || 0],
        ['GV1 Consumo Gas', r.gv1_consumo_gas || r.gv1ConsumoGas || 0],
        ['GV1 Flujo agua (gal/min)', r.gv1_flujo_agua || 0],
        ['GV1 Flujo gas (ft³/Hr)', r.gv1_flujo_gas || 0],
        ['GV1 Inyectado (ton)', r.gv1_inyectado || 0],
        ['GV1 PH Entrada', r.gv1_ph_entrada || '-'],
        ['GV1 PH Salida', r.gv1_ph_salida || '-'],
      ];

      const gv3Pairs = [
        ['GV3 Pres Qnt (psi)', r.gv3_pres_qnt || 0],
        ['GV3 Presión (psi)', r.gv3_presion || 0],
        ['GV3 Pres In Zona Convecc (psi)', r.gv3_pres_in_zona_convecc || r.gv3PresInZonaConvecc || 0],
        ['GV3 Pres Out Zona Convecc (psi)', r.gv3_pres_out_zona_convecc || r.gv3PresOutZonaConvecc || 0],
        ['GV3 Pres PI VC (psi)', r.gv3_pres_pi_vc || r.gv3PresPiVc || 0],
        ['GV3 Pres PIT VC (psi)', r.gv3_pres_pit_vc || r.gv3PresPitVc || 0],
        ['GV3 Pres Vapor (psi)', r.gv3_pres_vapor || r.gv3PresVapor || 0],
        ['GV3 Temp (°F)', r.gv3_temp || 0],
        ['GV3 Temp TI VC', r.gv3_temp_ti_vc || r.gv3TempTiVc || 0],
        ['GV3 Temp Vapor', r.gv3_temp_vapor || r.gv3TempVapor || 0],
        ['GV3 Temp Tubo', r.gv3_temp_tubo || r.gv3TempTubo || 0],
        ['GV3 Temp Chimenea', r.gv3_temp_chimenea || r.gv3TempChimenea || 0],
        ['GV3 Calidad (%)', r.gv3_calidad || r.gv3Cal || 0],
        ['GV3 Calidad seteada', r.gv3_calidad_seteada || r.gv3CalSeteada || 0],
        ['GV3 Calidad equipo', r.gv3_calidad_equipo || r.gv3CalEquipo || 0],
        ['GV3 Cld Conductividad', r.gv3_cld_cond || r.gv3CldadCond || 0],
        ['GV3 Cloruro (%)', (r.gv3_cloruro ?? r.gv3_clorulo) || 0],
        ['GV3 TDS (%)', r.gv3_tds || 0],
        ['GV3 Dureza (ppm)', r.gv3_dureza || 0],
        ['GV3 O2 (ppm)', r.gv3_o2 || 0],
        ['GV3 Pres Gas Sist (psi)', r.gv3_pres_gas_sist || r.gv3PresGasSist || 0],
        ['GV3 Pres Gas GV (psi)', r.gv3_pres_gas_gv || r.gv3PresGasGv || 0],
        ['GV3 Consumo Gas', r.gv3_consumo_gas || r.gv3ConsumoGas || 0],
        ['GV3 Flujo agua (gal/min)', r.gv3_flujo_agua || 0],
        ['GV3 Flujo gas (ft³/Hr)', r.gv3_flujo_gas || 0],
        ['GV3 Inyectado (ton)', r.gv3_inyectado || 0],
        ['GV3 PH Entrada', r.gv3_ph_entrada || '-'],
        ['GV3 PH Salida', r.gv3_ph_salida || '-'],
      ];

      const op1Pairs = [
        ['Op1 Horas', r.op1_horas || r.op1Horas || 0],
        ['Op1 Caudal', r.op1_caudal || r.op1Caudal || 0],
        ['Op1 Tiempo Inyeccion Guardia (h)', r.op1_tiempo_inyeccion_guardia_hours || r.op1_tiempo_inyeccion_guardia_value || 0],
        ['Op1 Tiempo Improductivo Guardia (h)', r.op1_tiempo_improductivo_guardia_hours || r.op1_tiempo_improductivo_guardia_value || 0],
      ];

      const op3Pairs = [
        ['Op3 Horas', r.op3_horas || r.op3Horas || 0],
        ['Op3 Caudal', r.op3_caudal || r.op3Caudal || 0],
        ['Op3 Tiempo Inyeccion Guardia (h)', r.op3_tiempo_inyeccion_guardia_hours || r.op3_tiempo_inyeccion_guardia_value || 0],
        ['Op3 Tiempo Improductivo Guardia (h)', r.op3_tiempo_improductivo_guardia_hours || r.op3_tiempo_improductivo_guardia_value || 0],
      ];

      // Render sections
      renderSection('Cabezal / Pozo / Fondo', cabezalPairs);
      renderSection('Generador Vapor #1', gv1Pairs);
      renderSection('Operación GVPP #1', op1Pairs);
      renderSection('Generador Vapor #3', gv3Pairs);
      renderSection('Operación GVPP #3', op3Pairs);

      // Observaciones como sección separada para evitar desbordes
      renderSection('Observaciones', [[ 'Observaciones', obs ]]);

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