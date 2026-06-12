export const notFound = (req, res) => {
  res.status(404).json({ ok: false, message: 'Ruta no encontrada' });
};

export const errorHandler = (err, req, res, next) => {
  // En desarrollo logueamos el error completo para nosotros
  console.error('❌ [SERVER_ERROR]', {
    message: err.message,
    code: err.code,
    stack: err.stack
  });

  let message = err.message || 'Error interno del servidor';
  let status = err.statusCode || 500;

  // TRADUCCIONES DE SEGURIDAD PARA EL USUARIO (SaaS Shield)
  // Error de tipos/enums en Postgres (como el que tuviste)
  if (err.code === '22P02' || err.message?.includes('enum') || err.message?.includes('invalid input syntax')) {
    message = 'Uno de los campos seleccionados no tiene un valor permitido. Por favor, verifica el formulario.';
    status = 400;
  } 
  // Error de valor nulo (Not Null Violation)
  else if (err.code === '23502') {
    message = 'Faltan campos obligatorios o el token de sesión no contiene el ID de usuario correcto.';
    status = 400;
  }
  // Error de registro duplicado
  else if (err.code === '23505') {
    message = 'Esta información ya se encuentra registrada en el sistema.';
    status = 400;
  }
  // Error de restricción CHECK (El error 23514 que tienes ahora)
  else if (err.code === '23514') {
    message = 'El valor seleccionado para el Rol no es aceptado por las reglas del sistema. Contacte al administrador de la base de datos.';
    status = 400;
  }

  res.status(status).json({
    ok: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { technical_details: err.message, stack: err.stack }),
  });
};
