/**
 * Modelo de Inventario (Referencia a Supabase)
 */
export const INVENTORY_TABLE = 'inventory';
export const INVENTORY_MOVEMENTS_TABLE = 'inventory_movements';

export const INVENTORY_CATEGORIES = [
  'EPP',           // Equipos de Protección Personal
  'HERRAMIENTAS',  // Herramientas
  'QUIMICOS',      // Químicos e Insumos
  'LUBRICANTES',   // Lubricantes y Fluidos
  'CONSUMIBLES',   // Consumibles y Ferretería
  'REPUESTOS',     // Repuestos y Refacciones
  'VEHICULOS',     // Insumos Vehiculares
  'VARIOS',        // Varios / General
];

export const MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste'];

export default INVENTORY_TABLE;
