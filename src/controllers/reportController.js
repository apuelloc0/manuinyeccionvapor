
import User from '../models/User.js';
import PDFDocument from 'pdfkit';
import { loadInstitutionGeneral, drawReportHeader, drawGeneratedFooter } from '../utils/reportLayout.js';

class BaseReport {
  async getData(req) {
    throw new Error('getData must be implemented by subclasses');
  }

  getPdfFilenamePrefix() {
    return 'reporte-generico';
  }

  getPdfOptions() {
    return { margin: 50 };
  }

  getReportTitle() {
    return 'Reporte';
  }

  getReportSubtitle(_data) {
    return '';
  }

  writePdf(doc, data, institution) {
    throw new Error('writePdf must be implemented by subclasses');
  }

  setPdfHeaders(res, filename) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  }

  async handle(req, res, next) {
    try {
      const data = await this.getData(req);
      const { format, includeHeader } = req.query;
      const institution = await loadInstitutionGeneral();

      if (format === 'pdf') {
        const filename = `${this.getPdfFilenamePrefix()}-${new Date().toISOString().slice(0, 10)}.pdf`;
        this.setPdfHeaders(res, filename);
        const doc = new PDFDocument(this.getPdfOptions());
        doc.pipe(res);
        drawReportHeader(doc, {
          institution,
          reportTitle: this.getReportTitle(),
          reportSubtitle: this.getReportSubtitle(data),
        });
        this.writePdf(doc, data, institution);
        drawGeneratedFooter(doc);
        doc.end();
      } else {
        const payload = { ok: true, data };
        if (includeHeader === '1' || includeHeader === 'true') {
          payload.header = {
            generatedAt: new Date().toISOString(),
            institution,
            reportTitle: this.getReportTitle(),
            reportSubtitle: this.getReportSubtitle(data),
          };
        }
        res.json(payload);
      }
    } catch (err) {
      next(err);
    }
  }
}

// ── PDF helpers ─────────────────────────────────────────────────────────────

/**
 * Write a paragraph with mixed bold/regular segments on one line, matching <p> in the preview.
 * segments: Array of [text, isBold]
 */
function writeMixedLine(doc, left, usableW, segments) {
  const last = segments.length - 1;
  segments.forEach(([text, bold], i) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(11)
      .fillColor('#000000');
    if (i === 0) {
      doc.text(String(text), left, doc.y, { continued: i < last, width: usableW });
    } else {
      doc.text(String(text), { continued: i < last, width: usableW });
    }
  });
}

/**
 * Draw a table matching the on-screen preview CSS exactly:
 *   th: background #f8f9fa, bold, borderBottom 2px #ddd
 *   td: regular weight, borderBottom 1px #eee
 */
function drawPdfTable(doc, { headers, rows, colWidths, left, fontSize = 10 }) {
  const HEADER_H = 24;
  const ROW_H = 20;
  const HEADER_BG = '#f8f9fa';
  const HEADER_FG = '#000000';
  const ROW_BG = '#ffffff';
  const HEADER_BORDER = '#dddddd';
  const ROW_BORDER = '#eeeeee';
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const pageH = doc.page.height - doc.page.margins.bottom;

  const drawHeader = (y) => {
    doc.save().rect(left, y, totalW, HEADER_H).fill(HEADER_BG).restore();
    let x = left;
    headers.forEach((h, ci) => {
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(HEADER_FG)
        .text(String(h), x + 8, y + (HEADER_H - fontSize) / 2, {
          width: colWidths[ci] - 10,
          lineBreak: false,
          ellipsis: true,
        });
      x += colWidths[ci];
    });
    // 2px bottom border matching `borderBottom: '2px solid #ddd'`
    doc.moveTo(left, y + HEADER_H).lineTo(left + totalW, y + HEADER_H)
      .strokeColor(HEADER_BORDER).lineWidth(2).stroke();
    doc.lineWidth(0.5);
  };

  drawHeader(doc.y);
  doc.y += HEADER_H;

  rows.forEach((row) => {
    if (doc.y + ROW_H > pageH) {
      doc.addPage();
      drawHeader(doc.y);
      doc.y += HEADER_H;
    }
    const y = doc.y;
    doc.save().rect(left, y, totalW, ROW_H).fill(ROW_BG).restore();
    let x = left;
    row.forEach((cell, ci) => {
      doc.font('Helvetica').fontSize(fontSize).fillColor('#000000')
        .text(String(cell ?? '—'), x + 8, y + (ROW_H - fontSize) / 2, {
          width: colWidths[ci] - 10,
          lineBreak: false,
          ellipsis: true,
        });
      x += colWidths[ci];
    });
    doc.moveTo(left, y + ROW_H).lineTo(left + totalW, y + ROW_H)
      .strokeColor(ROW_BORDER).lineWidth(1).stroke();
    doc.fillColor('#000000');
    doc.y += ROW_H;
  });

  doc.moveDown(0.5);
}

// ── Filter helpers ───────────────────────────────────────────────────────────

function buildStudentFilter(query = {}) {
  const { schoolLevel, grade, section } = query;
  const match = { active: { $ne: false } };
  if (schoolLevel) match.schoolLevel = schoolLevel;
  if (grade) match.grade = grade;
  if (section) match.section = section;
  return match;
}

function buildFilterLabel(query = {}) {
  const { schoolLevel, grade, section } = query;
  const parts = [];
  if (schoolLevel) parts.push(schoolLevel);
  if (grade) parts.push(`Grado: ${grade}`);
  if (section) parts.push(`Sección: ${section}`);
  return parts.length ? parts.join(' · ') : null;
}

class InstitutionalReport extends BaseReport {
  getPdfFilenamePrefix() {
    return 'reporte-institucional';
  }

  getReportTitle() {
    return 'Reporte institucional';
  }

  getReportSubtitle(data) {
    const st = data.students || {};
    const label = data.filterLabel ? ` — ${data.filterLabel}` : '';
    return `Resumen general — ${st.total ?? 0} estudiantes activos${label}`;
  }

  async getData(req) {
    const match = buildStudentFilter(req.query);
    const [studentCount, paymentCount, paymentTotal, cutOffCount] = await Promise.all([
      Student.countDocuments(match),
      Payment.countDocuments(),
      Payment.aggregate([{ $group: { _id: null, bs: { $sum: '$amountBs' }, usd: { $sum: '$amountUsd' } } }]),
      CutOffDate.countDocuments({ activo: true }),
    ]);
    const byYearSection = await Student.aggregate([
      { $match: match },
      { $group: { _id: { grado: '$grade', seccion: '$section' }, count: { $sum: 1 } } },
      { $sort: { '_id.grado': 1, '_id.seccion': 1 } },
    ]);
    const totals = paymentTotal[0] || { bs: 0, usd: 0 };
    return {
      students: { total: studentCount, byYearSection },
      payments: { total: paymentCount, totalBs: totals.bs, totalUsd: totals.usd },
      cutOffDates: cutOffCount,
      filterLabel: buildFilterLabel(req.query),
    };
  }

  writePdf(doc, data) {
    const st = data.students || {};
    const pay = data.payments || {};
    const left = doc.page.margins.left;
    const usableW = doc.page.width - left - doc.page.margins.right;

    // <p><strong>Estudiantes total:</strong> X</p>
    writeMixedLine(doc, left, usableW, [['Estudiantes total: ', true], [st.total ?? 0, false]]);
    doc.moveDown(0.3);

    // <p><strong>Pagos (registros):</strong> X — <strong>Total Bs:</strong> X — <strong>Total USD:</strong> X</p>
    writeMixedLine(doc, left, usableW, [
      ['Pagos (registros): ', true], [pay.total ?? 0, false],
      [' — ', false],
      ['Total Bs: ', true], [pay.totalBs ?? 0, false],
      [' — ', false],
      ['Total USD: ', true], [pay.totalUsd ?? 0, false],
    ]);
    doc.moveDown(0.3);

    // <p><strong>Fechas de corte activas:</strong> X</p>
    writeMixedLine(doc, left, usableW, [['Fechas de corte activas: ', true], [data.cutOffDates ?? 0, false]]);
    doc.moveDown(0.6);

    // <h4>Por grado y seccion</h4>
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text('Por grado y sección', left, doc.y);
    doc.moveDown(0.35);

    const rows = (st.byYearSection || []).map((r) => [
      r._id?.grado ?? '—',
      r._id?.seccion ?? '—',
      r.count ?? 0,
    ]);
    drawPdfTable(doc, {
      headers: ['Grado', 'Seccion', 'Cantidad'],
      rows,
      colWidths: [200, 200, 95],
      left,
    });
  }
}

class OccupancyReport extends BaseReport {
  getPdfFilenamePrefix() {
    return 'reporte-ocupacion';
  }

  getReportTitle() {
    return 'Ocupación y capacidad';
  }

  getReportSubtitle(data) {
    const label = data.filterLabel ? ` — ${data.filterLabel}` : '';
    return `Total estudiantes: ${data.totalEstudiantes ?? 0} — Ocupación: ${data.ocupacionPorcentaje ?? 0}%${label}`;
  }

  async getData(req) {
    const match = buildStudentFilter(req.query);
    const academicConfig = await AcademicConfig.findOne().lean();
    const capacity = Number(academicConfig?.capacidadMaxima) || 0;
    const totalStudents = await Student.countDocuments(match);
    const cuposDisponibles = Math.max(0, capacity - totalStudents);
    const ocupacionPorcentaje = capacity > 0 ? Math.round((totalStudents / capacity) * 100) : 0;
    return {
      capacidadMaxima: capacity,
      totalEstudiantes: totalStudents,
      cuposDisponibles,
      ocupacionPorcentaje,
      filterLabel: buildFilterLabel(req.query),
    };
  }

  writePdf(doc, data) {
    const left = doc.page.margins.left;
    const usableW = doc.page.width - left - doc.page.margins.right;

    // Mirrors exactly the 4 <p> lines shown in the preview
    [
      ['Capacidad máxima: ', String(data.capacidadMaxima ?? 0)],
      ['Total estudiantes: ', String(data.totalEstudiantes ?? 0)],
      ['Cupos disponibles: ', String(data.cuposDisponibles ?? 0)],
      ['Ocupación: ', `${data.ocupacionPorcentaje ?? 0}%`],
    ].forEach(([label, value]) => {
      writeMixedLine(doc, left, usableW, [[label, true], [value, false]]);
      doc.moveDown(0.3);
    });
  }
}

class EnrollmentByGradeSectionReport extends BaseReport {
  getPdfFilenamePrefix() {
    return 'reporte-matricula';
  }

  getReportTitle() {
    return 'Matrícula por grado y sección';
  }

  getReportSubtitle(data) {
    const label = data.filterLabel ? ` — ${data.filterLabel}` : '';
    return `Total: ${data.total ?? 0} estudiantes${label}`;
  }

  async getData(req) {
    const match = buildStudentFilter(req.query);
    const agg = await Student.aggregate([
      { $match: match },
      { $group: { _id: { grado: '$grade', seccion: '$section' }, count: { $sum: 1 } } },
      { $sort: { '_id.grado': 1, '_id.seccion': 1 } },
    ]);
    const rows = agg.map((a) => ({
      grado: a._id.grado || '—',
      seccion: a._id.seccion || '—',
      cantidad: a.count,
    }));
    const total = rows.reduce((s, x) => s + x.cantidad, 0);
    return { rows, total, filterLabel: buildFilterLabel(req.query) };
  }

  writePdf(doc, data) {
    const left = doc.page.margins.left;
    const usableW = doc.page.width - left - doc.page.margins.right;

    // <p><strong>Total:</strong> X</p>
    writeMixedLine(doc, left, usableW, [['Total: ', true], [data.total ?? 0, false]]);
    doc.moveDown(0.5);

    const rows = (data.rows || []).map((r) => [r.grado, r.seccion, r.cantidad]);
    drawPdfTable(doc, {
      headers: ['Grado', 'Seccion', 'Cantidad'],
      rows,
      colWidths: [200, 200, 95],
      left,
    });
  }
}

class UsersRolesReport extends BaseReport {
  getPdfFilenamePrefix() {
    return 'reporte-usuarios-roles';
  }

  getReportTitle() {
    return 'Usuarios y roles';
  }

  getReportSubtitle(data) {
    const n = Array.isArray(data) ? data.length : 0;
    return `${n} usuario(s) registrado(s)`;
  }

  async getData() {
    const users = await User.find({})
      .select('username fullName role active')
      .sort({ role: 1, username: 1 })
      .lean();
    return users.map((u) => ({
      usuario: u.username,
      nombreCompleto: u.fullName,
      rol: u.role,
      activo: u.active !== false,
    }));
  }

  writePdf(doc, data) {
    const left = doc.page.margins.left;

    const rows = data.map((r) => [
      r.usuario ?? '—',
      r.nombreCompleto ?? '—',
      r.rol ?? '—',
      r.activo ? 'Si' : 'No',
    ]);

    drawPdfTable(doc, {
      headers: ['Usuario', 'Nombre completo', 'Rol', 'Activo'],
      rows,
      colWidths: [110, 210, 130, 45],
      left,
    });
  }
}

class StudentsListByGradeSectionReport extends BaseReport {
  getPdfFilenamePrefix() {
    return 'listado-grado-seccion';
  }

  getReportTitle() {
    return 'Listado de estudiantes por grado y sección';
  }

  getReportSubtitle(data) {
    return `Total: ${data.total ?? 0} estudiantes${data.filterLabel ? ` — ${data.filterLabel}` : ''}`;
  }

  getPdfOptions() {
    return { margin: 40, size: 'A4' };
  }

  async getData(req) {
    const { schoolLevel, grade, section } = req.query;
    const match = { active: { $ne: false } };
    if (schoolLevel) match.schoolLevel = schoolLevel;
    if (grade) match.grade = grade;
    if (section) match.section = section;

    const students = await Student.find(match)
      .sort({ schoolLevel: 1, grade: 1, section: 1, lastName: 1, firstName: 1 })
      .select('firstName lastName idNumber idNationality schoolLevel grade section enrollmentDate studentCardNumber')
      .lean();

    const filterParts = [];
    if (schoolLevel) filterParts.push(schoolLevel);
    if (grade) filterParts.push(`Grado: ${grade}`);
    if (section) filterParts.push(`Sección: ${section}`);

    const groups = {};
    for (const s of students) {
      const key = `${s.schoolLevel || '—'}|||${s.grade || '—'}|||${s.section || '—'}`;
      if (!groups[key]) groups[key] = { schoolLevel: s.schoolLevel || '—', grade: s.grade || '—', section: s.section || '—', students: [] };
      groups[key].students.push(s);
    }

    return {
      groups: Object.values(groups),
      total: students.length,
      filterLabel: filterParts.length ? filterParts.join(' · ') : null,
    };
  }

  writePdf(doc, data) {
    const left = doc.page.margins.left;
    const usableW = doc.page.width - left - doc.page.margins.right;

    // <p><strong>Total:</strong> X estudiante(s)</p>
    writeMixedLine(doc, left, usableW, [['Total: ', true], [`${data.total ?? 0} estudiante(s)`, false]]);
    doc.moveDown(0.5);

    for (const group of data.groups || []) {
      if (doc.y > doc.page.height - 140) doc.addPage();

      // <h4 style={{ color: '#0952C8' }}>LEVEL — Grado X — Sección Y (N estudiante(s))</h4>
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0952C8')
        .text(
          `${group.schoolLevel} — Grado ${group.grade} — Sección ${group.section}`,
          left, doc.y, { continued: true, width: usableW }
        );
      doc.font('Helvetica').fontSize(12).fillColor('#555555')
        .text(`  (${group.students.length} estudiante(s))`, { continued: false });

      // underline matching `borderBottom: '2px solid #0952C8'`
      doc.moveTo(left, doc.y).lineTo(left + usableW, doc.y)
        .strokeColor('#0952C8').lineWidth(2).stroke();
      doc.lineWidth(0.5);
      doc.moveDown(0.4);
      doc.fillColor('#000000');

      const rows = group.students.map((s, idx) => [
        idx + 1,
        s.studentCardNumber || '—',
        s.idNumber ? `${s.idNationality || 'V'}-${s.idNumber}` : '—',
        [s.lastName, s.firstName].filter(Boolean).join(', '),
        s.enrollmentDate ? new Date(s.enrollmentDate).toLocaleDateString('es') : '—',
      ]);

      drawPdfTable(doc, {
        headers: ['N°', 'Cód. estud.', 'Cédula', 'Apellidos y nombres', 'F. inscripción'],
        rows,
        colWidths: [28, 72, 86, 208, 86],
        left,
        fontSize: 9,
      });
    }
  }
}

/** Edad en años cumplidos: solo fecha de nacimiento vs fecha actual (no usa campo `age` del registro). */
function computeAgeYearsFromBirthDate(birthDate) {
  if (!birthDate) return '—';
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const md = now.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < d.getDate())) y -= 1;
  return String(Math.max(0, y));
}

function genderLabelPdf(g) {
  if (g === 'masculino') return 'Masculino';
  if (g === 'femenino') return 'Femenino';
  return g ? String(g) : '—';
}

/** Listado demográfico: mostrar CI si existe; si no, carnet escolar (CE). */
function formatCiCeDemographics(s) {
  if (s.idNumber && String(s.idNumber).trim()) {
    const nat = (s.idNationality && String(s.idNationality).trim()) || 'V';
    return `${nat}-${String(s.idNumber).trim()}`;
  }
  if (s.studentCardNumber && String(s.studentCardNumber).trim()) {
    return String(s.studentCardNumber).trim();
  }
  return '—';
}

class StudentsDemographicsReport extends BaseReport {
  getPdfFilenamePrefix() {
    return 'listado-demografico';
  }

  getReportTitle() {
    return 'Listado demográfico por grado y sección';
  }

  getReportSubtitle(data) {
    return `Total: ${data.total ?? 0} estudiantes${data.filterLabel ? ` — ${data.filterLabel}` : ''}`;
  }

  getPdfOptions() {
    return { margin: 40, size: 'A4', layout: 'landscape' };
  }

  async getData(req) {
    const { schoolLevel, grade, section } = req.query;
    const match = { active: { $ne: false } };
    if (schoolLevel) match.schoolLevel = schoolLevel;
    if (grade) match.grade = grade;
    if (section) match.section = section;

    const students = await Student.find(match)
      .sort({ schoolLevel: 1, grade: 1, section: 1, lastName: 1, firstName: 1 })
      .select(
        'firstName lastName schoolLevel grade section studentCardNumber idNumber idNationality birthDate birthPlace gender'
      )
      .lean();

    const filterParts = [];
    if (schoolLevel) filterParts.push(schoolLevel);
    if (grade) filterParts.push(`Grado: ${grade}`);
    if (section) filterParts.push(`Sección: ${section}`);

    const groups = {};
    for (const s of students) {
      const key = `${s.schoolLevel || '—'}|||${s.grade || '—'}|||${s.section || '—'}`;
      if (!groups[key]) {
        groups[key] = {
          schoolLevel: s.schoolLevel || '—',
          grade: s.grade || '—',
          section: s.section || '—',
          students: [],
        };
      }
      groups[key].students.push(s);
    }

    return {
      groups: Object.values(groups),
      total: students.length,
      filterLabel: filterParts.length ? filterParts.join(' · ') : null,
    };
  }

  writePdf(doc, data) {
    const left = doc.page.margins.left;
    const usableW = doc.page.width - left - doc.page.margins.right;

    writeMixedLine(doc, left, usableW, [['Total: ', true], [`${data.total ?? 0} estudiante(s)`, false]]);
    doc.moveDown(0.5);

    for (const group of data.groups || []) {
      if (doc.y > doc.page.height - 140) doc.addPage();

      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0952C8')
        .text(
          `${group.schoolLevel} — Grado ${group.grade} — Sección ${group.section}`,
          left,
          doc.y,
          { continued: true, width: usableW }
        );
      doc.font('Helvetica').fontSize(12).fillColor('#555555')
        .text(`  (${group.students.length} estudiante(s))`, { continued: false });

      doc.moveTo(left, doc.y).lineTo(left + usableW, doc.y)
        .strokeColor('#0952C8').lineWidth(2).stroke();
      doc.lineWidth(0.5);
      doc.moveDown(0.4);
      doc.fillColor('#000000');

      const rows = group.students.map((s, idx) => [
        idx + 1,
        formatCiCeDemographics(s),
        [s.lastName, s.firstName].filter(Boolean).join(', '),
        s.birthDate ? new Date(s.birthDate).toLocaleDateString('es') : '—',
        computeAgeYearsFromBirthDate(s.birthDate),
        (s.birthPlace || '').trim() || '—',
        genderLabelPdf(s.gender),
      ]);

      drawPdfTable(doc, {
        headers: ['N°', 'CI/CE', 'Apellidos y nombres', 'F. nacimiento', 'Edad', 'Lugar nac.', 'Sexo'],
        rows,
        colWidths: [28, 72, 148, 78, 36, 130, 72],
        left,
        fontSize: 8,
      });
    }
  }
}

const institutionalReport = new InstitutionalReport();
const occupancyReport = new OccupancyReport();
const enrollmentReport = new EnrollmentByGradeSectionReport();
const usersRolesReport = new UsersRolesReport();

const studentsListByGradeSectionReport = new StudentsListByGradeSectionReport();
const studentsDemographicsReport = new StudentsDemographicsReport();
export const institutional = (req, res, next) => institutionalReport.handle(req, res, next);

export const occupancy = (req, res, next) => occupancyReport.handle(req, res, next);

export const enrollmentByGradeSection = (req, res, next) => enrollmentReport.handle(req, res, next);

export const usersRoles = (req, res, next) => usersRolesReport.handle(req, res, next);

export const studentsListByGradeSection = (req, res, next) => studentsListByGradeSectionReport.handle(req, res, next);

export const studentsDemographics = (req, res, next) => studentsDemographicsReport.handle(req, res, next);
