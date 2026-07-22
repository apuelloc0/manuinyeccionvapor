-- Migration: Add water-quality columns for GV1 and GV3
ALTER TABLE IF EXISTS registros_diarios
  ADD COLUMN IF NOT EXISTS gv1_cloruro numeric,
  ADD COLUMN IF NOT EXISTS gv1_tds numeric,
  ADD COLUMN IF NOT EXISTS gv1_dureza numeric,
  ADD COLUMN IF NOT EXISTS gv1_o2 numeric,

  ADD COLUMN IF NOT EXISTS gv3_cloruro numeric,
  ADD COLUMN IF NOT EXISTS gv3_tds numeric,
  ADD COLUMN IF NOT EXISTS gv3_dureza numeric,
  ADD COLUMN IF NOT EXISTS gv3_o2 numeric;

-- After running this migration, restart the backend so schema caches refresh.
