const DEFAULT_MODULES = Object.freeze({
  ventas_ruta: true,
  recursos_humanos: false,
  planta: false,
  logistica: false
});

const getCompanyModules = (value) => {
  let configured = value;
  if (typeof value === 'string') {
    try {
      configured = JSON.parse(value);
    } catch (error) {
      configured = {};
    }
  }
  return {
    ...DEFAULT_MODULES,
    ...(configured && typeof configured === 'object' ? configured : {})
  };
};

const requireModule = (moduleName) => (req, res, next) => {
  const modules = getCompanyModules(req.user?.empresa_modulos);
  if (!modules[moduleName]) {
    return res.status(403).json({
      error: 'Este módulo no está habilitado para la empresa',
      code: 'MODULE_DISABLED',
      module: moduleName
    });
  }
  return next();
};

module.exports = {
  DEFAULT_MODULES,
  getCompanyModules,
  requireModule
};
