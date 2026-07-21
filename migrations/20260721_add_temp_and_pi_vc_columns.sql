-- Migration: Add PI/ PIT and temperature columns for GV1 and GV3
ALTER TABLE IF EXISTS registros_diarios
  ADD COLUMN IF NOT EXISTS gv1_pres_pi_vc numeric,
  ADD COLUMN IF NOT EXISTS gv1_pres_pit_vc numeric,
  ADD COLUMN IF NOT EXISTS gv1_temp_ti_vc numeric,
  ADD COLUMN IF NOT EXISTS gv1_pres_vapor numeric,
  ADD COLUMN IF NOT EXISTS gv1_temp_vapor numeric,
  ADD COLUMN IF NOT EXISTS gv1_temp_tubo numeric,
  ADD COLUMN IF NOT EXISTS gv1_temp_chimenea numeric,
  ADD COLUMN IF NOT EXISTS gv3_pres_pi_vc numeric,
  ADD COLUMN IF NOT EXISTS gv3_pres_pit_vc numeric,
  ADD COLUMN IF NOT EXISTS gv3_temp_ti_vc numeric,
  ADD COLUMN IF NOT EXISTS gv3_pres_vapor numeric,
  ADD COLUMN IF NOT EXISTS gv3_temp_vapor numeric,
  ADD COLUMN IF NOT EXISTS gv3_temp_tubo numeric,
  ADD COLUMN IF NOT EXISTS gv3_temp_chimenea numeric;

-- After running this migration, restart backend if necessary to refresh schema cache.
