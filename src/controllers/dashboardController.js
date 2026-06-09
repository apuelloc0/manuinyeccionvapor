import supabase from '../config/db.js';
import { CLIENTS_TABLE } from '../models/Client.js';
import { USERS_TABLE } from '../models/User.js';
import { ROLES } from '../config/constants.js'; // Importamos los roles actualizados

/** GET /api/dashboard - Estadísticas para el panel de inicio */
export const getStats = async (req, res, next) => {
  try {
    // Consultas paralelas en Supabase
    // Adaptamos las consultas para SteamTrack
    const [totalUsers, totalReports, wellsInInjection, lowStockItems] = await Promise.all([
      // Total de usuarios activos (Operadores, Supervisores, etc.)
      supabase.from(USERS_TABLE).select('*', { count: 'exact', head: true }).eq('active', true),
      // Total de reportes de inyección de vapor enviados (Módulo 4)
      supabase.from('steam_reports').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
      // Pozos actualmente "En inyección" (Módulo 4)
      supabase.from('pozos').select('*', { count: 'exact', head: true }).eq('status', 'En inyección'),
      // Alertas de inventario (Módulo 1): ítems con stock bajo
      supabase.from('inventory').select('stock, min_stock'),
    ]);

    if (totalUsers.error || totalReports.error || wellsInInjection.error || lowStockItems.error) {
      console.error('Error consultando estadísticas del dashboard:', totalUsers.error || totalReports.error || wellsInInjection.error || lowStockItems.error);
      throw new Error('Error consultando estadísticas del dashboard.');
    }

    const totalRegisteredUsers = totalUsers.count || 0;
    const totalSentReports = totalReports.count || 0;
    const currentWellsInInjection = wellsInInjection.count || 0;
    
    // Alertas de inventario
    // Asumimos que lowStockItems.data es un array de objetos { stock: number, min_stock: number }
    const lowStockAlerts = lowStockItems.data
      ? lowStockItems.data.filter(item => item.stock <= item.min_stock).length
      : 0;

    res.json({
      ok: true,
      data: {
        kpis: {
          totalUsers: totalRegisteredUsers,
          totalReports: totalSentReports,
          wellsInInjection: currentWellsInInjection,
        },
        alerts: {
          lowStock: lowStockAlerts
        }
      },
    });
  } catch (err) {
    next(err);
  }
};
