/**
 * Roles del sistema SteamTrack — Gestión Integral (SGI)
 */
export const ROLES = {
  ADMINISTRADOR: 'Administrador', // Acceso total
  OPERADOR: 'Operador',           // Carga de datos diarios (Módulo 4)
  SUPERVISOR: 'Supervisor',       // Validación y edición de registros
  GERENTE: 'Gerente',             // Visualización de BI y reportes
  CONSULTA: 'Consulta',           // Solo lectura
};

/** Quién puede ver cada recurso */
export const PERMISSIONS = {
  USUARIOS_GESTION: [ROLES.ADMINISTRADOR],
  OPERACIONES_CARGA: [ROLES.ADMINISTRADOR, ROLES.OPERADOR, ROLES.SUPERVISOR],
  OPERACIONES_VALIDAR: [ROLES.ADMINISTRADOR, ROLES.SUPERVISOR],
  INVENTARIO_GESTION: [ROLES.ADMINISTRADOR, ROLES.OPERADOR],
  REPORTES_FULL: [ROLES.ADMINISTRADOR, ROLES.GERENTE],
  CONFIGURACION: [ROLES.ADMINISTRADOR],
  AUDITORIA_VIEW: [ROLES.ADMINISTRADOR],
};

/** Prefijos moviles Venezuela 04xx (solo digitos, sin espacios; sin lineas fijas 02xx) */
export const PHONE_PREFIXES = [
  '0412', '0414', '0416', '0422', '0424', '0426',
];
