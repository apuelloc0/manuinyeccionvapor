-- Migration: Add missing columns used by production logs API
-- Run this against your Postgres DB used by Supabase (local or remote).

ALTER TABLE IF EXISTS registros_diarios
  ADD COLUMN IF NOT EXISTS gv1_pres_qnt numeric,
  ADD COLUMN IF NOT EXISTS gv1_calidad_seteada numeric,
  ADD COLUMN IF NOT EXISTS gv1_calidad_equipo numeric,
  ADD COLUMN IF NOT EXISTS gv1_cld_cond numeric,
  ADD COLUMN IF NOT EXISTS gv1_pres_gas_sist numeric,
  ADD COLUMN IF NOT EXISTS gv1_pres_gas_gv numeric,
  ADD COLUMN IF NOT EXISTS gv1_consumo_gas numeric,
  ADD COLUMN IF NOT EXISTS gv1_ph_entrada numeric,
  ADD COLUMN IF NOT EXISTS gv1_ph_salida numeric,

  ADD COLUMN IF NOT EXISTS gv3_pres_qnt numeric,
  ADD COLUMN IF NOT EXISTS gv3_calidad_seteada numeric,
  ADD COLUMN IF NOT EXISTS gv3_calidad_equipo numeric,
  ADD COLUMN IF NOT EXISTS gv3_cld_cond numeric,
  ADD COLUMN IF NOT EXISTS gv3_pres_gas_sist numeric,
  ADD COLUMN IF NOT EXISTS gv3_pres_gas_gv numeric,
  ADD COLUMN IF NOT EXISTS gv3_consumo_gas numeric,
  ADD COLUMN IF NOT EXISTS gv3_ph_entrada numeric,
  ADD COLUMN IF NOT EXISTS gv3_ph_salida numeric,

  ADD COLUMN IF NOT EXISTS op1_vapor_12h numeric,
  ADD COLUMN IF NOT EXISTS op1_total_inyectado_acum numeric,
  ADD COLUMN IF NOT EXISTS op3_vapor_12h numeric,
  ADD COLUMN IF NOT EXISTS op3_total_inyectado_acum numeric,

  ADD COLUMN IF NOT EXISTS total_inyectado_ambos numeric,
  ADD COLUMN IF NOT EXISTS tiempo_inyeccion_dias numeric;

-- You may want to create indexes for frequently queried numeric columns, for example:
-- CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros_diarios(fecha);

-- After running this migration, restart your backend server if necessary so schema cache is refreshed.
