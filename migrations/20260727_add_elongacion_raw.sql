-- Add column to store original elongation string (e.g. "1 3/4")
ALTER TABLE registros_diarios
ADD COLUMN IF NOT EXISTS elongacion_raw TEXT;
