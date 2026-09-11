import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// 1. Reemplaza con los valores de tu proyecto (Project Settings -> API)
const SUPABASE_URL = 'https://njfwmjgntjikbiliohyv.supabase.co'; // URL de tu proyecto
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZndtamdudGppa2JpbGlvaHl2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTAxMTA3MywiZXhwIjoyMDk2NTg3MDczfQ.TsL0HU7WPkABLcIRKSKEJnESCHEMFr6D8Ps_Fn-WOzs'; // Copia tu clave API

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tus 8 tablas del proyecto de Inyección de Vapor
const TABLAS = [
  'users',
  'macollas',
  'pozos',
  'inventory',
  'general_config',
  'audit_logs',
  'registros_diarios',
  'steam_reports'
];

const outputFile = path.join(process.cwd(), 'datos_insert.sql');

async function exportDataToSQL() {
  console.log('Iniciando extracción de datos desde Supabase...\n');
  
  // Limpia o crea el archivo
  fs.writeFileSync(outputFile, '-- DATOS DE LAS TABLAS (INSERT INTO)\n\n');

  for (const tabla of TABLAS) {
    const { data, error } = await supabase.from(tabla).select('*');
    
    if (error) {
      console.error(`❌ Error al obtener datos de '${tabla}':`, error.message);
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`! Tabla '${tabla}' está vacía.`);
      continue;
    }

    let sqlContent = `-- Datos para la tabla: ${tabla}\n`;

    data.forEach(row => {
      const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
      
      const values = Object.values(row).map(v => {
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'boolean' || typeof v === 'number') return v;
        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        
        // Escapar comillas simples para que sea un SQL válido
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(', ');

      sqlContent += `INSERT INTO "${tabla}" (${keys}) VALUES (${values});\n`;
    });

    sqlContent += '\n';
    fs.appendFileSync(outputFile, sqlContent);
    console.log(`✓ Datos de '${tabla}' exportados (${data.length} registros).`);
  }

  console.log(`\n¡Listo! Archivo de datos generado en: ${outputFile}`);
}

exportDataToSQL();