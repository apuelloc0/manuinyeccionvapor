import supabase from '../config/db.js';

/**
 * Registra una actividad en la bitácora de auditoría.
 * @param {Object} params
 * @param {string} params.user_id - ID del usuario que realiza la acción.
 * @param {string} params.action - Acción realizada ('CREATE', 'UPDATE', 'DELETE', 'LOGIN').
 * @param {string} params.table_name - Tabla afectada.
 * @param {string} params.record_id - ID del registro afectado.
 * @param {Object} [params.old_value] - Valor anterior (opcional).
 * @param {Object} [params.new_value] - Valor nuevo (opcional).
 */
export const logActivity = async ({ 
  user_id, 
  action, 
  table_name, 
  record_id, 
  old_value = null, 
  new_value = null 
}) => {
  try {
    await supabase
      .from('audit_logs')
      .insert([{ user_id, action, table_name, record_id, old_value, new_value }]);
  } catch (err) {
    // Logueamos el error pero no bloqueamos la ejecución principal del sistema
    console.error('❌ [AUDIT_LOG_ERROR]:', err.message);
  }
};