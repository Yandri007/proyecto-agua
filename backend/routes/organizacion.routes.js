const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const { getCompanyModules, requireModule } = require('../utils/modules');
const { createUserToken } = require('../utils/accountTokens');
const { sendVerificationEmail } = require('../utils/email');
const { writeAudit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
const OPTIONAL_ROLES = new Set(['rh', 'jefe_planta']);
const ROLE_MODULE = Object.freeze({ rh: 'recursos_humanos', jefe_planta: 'planta' });
const EMPLOYEE_AREAS = new Set([
  'Administración',
  'Recursos Humanos',
  'Planta',
  'Calidad',
  'Mantenimiento',
  'Bodega',
  'Distribución',
  'Ventas',
  'Contabilidad'
]);
const CONTRACT_TYPES = new Set(['indefinido', 'temporal', 'servicios', 'otro']);

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  return next();
};

const optionalText = (value, maxLength) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength || /[<>]/.test(value)) {
    return undefined;
  }
  return value.trim();
};

const requireHrForHrUser = (req, res, next) => {
  if (req.user.rol === 'admin') return next();
  return requireModule('recursos_humanos')(req, res, next);
};

router.use(verifyToken, requireActiveSubscription);

router.get('/config', checkRole(['admin', 'rh', 'jefe_planta']), (req, res) => {
  return res.json({ modulos: getCompanyModules(req.user.empresa_modulos) });
});

router.put('/config', checkRole(['admin']), async (req, res) => {
  const allowedKeys = ['ventas_ruta', 'recursos_humanos', 'planta', 'logistica'];
  const changes = {};
  for (const key of allowedKeys) {
    if (Object.hasOwn(req.body, key)) {
      if (typeof req.body[key] !== 'boolean') {
        return res.status(400).json({ error: `El valor de ${key} debe ser verdadero o falso` });
      }
      changes[key] = req.body[key];
    }
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'No se indicaron módulos para actualizar' });
  }

  try {
    const result = await pool.query(
      `UPDATE empresas
       SET modulos = modulos || $1::jsonb
       WHERE id = $2
       RETURNING modulos`,
      [JSON.stringify(changes), req.user.empresa_id]
    );
    await writeAudit({
      req,
      action: 'empresa.modulos_actualizados',
      entity: 'empresas',
      entityId: req.user.empresa_id,
      details: changes
    });
    return res.json({ modulos: getCompanyModules(result.rows[0].modulos) });
  } catch (error) {
    logger.error('company_modules_update_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible actualizar los módulos' });
  }
});

router.get(
  '/equipo',
  checkRole(['admin', 'rh']),
  requireHrForHrUser,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT u.id, u.nombre, u.email, u.telefono, u.rol, u.estado,
                u.email_verificado_en, u.ultimo_acceso_en,
                pe.cargo, pe.area, pe.fecha_ingreso, pe.tipo_contrato,
                pe.notas, pe.actualizado_en
         FROM usuarios u
         LEFT JOIN perfiles_empleados pe ON pe.usuario_id = u.id
         WHERE u.empresa_id = $1
           AND u.rol <> 'cliente'
         ORDER BY (u.estado = 'activo') DESC, pe.area NULLS LAST, u.nombre`,
        [req.user.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) {
      logger.error('company_team_read_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible cargar el equipo' });
    }
  }
);

router.post(
  '/equipo',
  checkRole(['admin', 'rh']),
  requireHrForHrUser,
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Nombre inválido')
    .matches(/^[\p{L}\p{M} .'-]+$/u).withMessage('El nombre contiene caracteres no permitidos'),
  body('email').trim().isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isLength({ min: 10, max: 128 }).withMessage('La contraseña debe tener entre 10 y 128 caracteres'),
  body('rol').isIn([...OPTIONAL_ROLES]).withMessage('Cargo de acceso inválido'),
  body('telefono').optional({ checkFalsy: true }).trim()
    .matches(/^[0-9+() -]{7,20}$/).withMessage('Teléfono inválido'),
  body('cargo').trim().isLength({ min: 2, max: 100 }).withMessage('Cargo inválido'),
  body('area').isIn([...EMPLOYEE_AREAS]).withMessage('Área inválida'),
  body('fecha_ingreso').optional({ checkFalsy: true }).isISO8601().withMessage('Fecha de ingreso inválida'),
  body('tipo_contrato').optional({ checkFalsy: true }).isIn([...CONTRACT_TYPES]).withMessage('Tipo de contrato inválido'),
  handleValidation,
  async (req, res) => {
    const modules = getCompanyModules(req.user.empresa_modulos);
    const requiredModule = ROLE_MODULE[req.body.rol];
    if (!modules[requiredModule]) {
      return res.status(409).json({
        error: `Habilita el módulo ${requiredModule} antes de crear esta cuenta`,
        code: 'MODULE_DISABLED'
      });
    }

    const notes = optionalText(req.body.notas, 500);
    if (notes === undefined) return res.status(400).json({ error: 'Notas inválidas' });

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      await client.query('BEGIN');
      transactionStarted = true;
      const userResult = await client.query(
        `INSERT INTO usuarios
          (empresa_id, nombre, email, password, telefono, rol)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nombre, email, rol, empresa_id, email_verificado_en`,
        [
          req.user.empresa_id,
          req.body.nombre,
          req.body.email,
          passwordHash,
          req.body.telefono || null,
          req.body.rol
        ]
      );
      const user = userResult.rows[0];
      await client.query(
        `INSERT INTO perfiles_empleados
          (usuario_id, empresa_id, cargo, area, fecha_ingreso, tipo_contrato, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.id,
          req.user.empresa_id,
          req.body.cargo,
          req.body.area,
          req.body.fecha_ingreso || null,
          req.body.tipo_contrato || null,
          notes
        ]
      );
      const token = await createUserToken(client, user.id, 'verificacion_email', 24 * 60);
      await writeAudit({
        client,
        req,
        action: 'empleado.creado',
        entity: 'usuarios',
        entityId: user.id,
        details: { rol: user.rol, cargo: req.body.cargo, area: req.body.area }
      });
      await client.query('COMMIT');
      transactionStarted = false;

      let emailResult = { delivered: false };
      try {
        emailResult = await sendVerificationEmail({ user, token });
      } catch (error) {
        logger.error('employee_verification_email_failed', { error, userId: user.id });
      }
      return res.status(201).json({
        id: user.id,
        message: 'Cuenta de colaborador creada',
        requires_email_verification: true,
        email_sent: emailResult.delivered,
        development_url: emailResult.developmentUrl
      });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El correo ya está registrado' });
      }
      logger.error('employee_creation_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible crear el colaborador' });
    } finally {
      client.release();
    }
  }
);

router.put(
  '/equipo/:id',
  checkRole(['admin', 'rh']),
  requireHrForHrUser,
  async (req, res) => {
    const userId = Number(req.params.id);
    const position = optionalText(req.body.cargo, 100);
    const notes = optionalText(req.body.notas, 500);
    const area = req.body.area;
    const contractType = req.body.tipo_contrato || null;
    const employmentStatus = req.body.estado;
    const startDate = req.body.fecha_ingreso || null;
    if (!Number.isInteger(userId) || userId <= 0 || !position || position.length < 2
        || notes === undefined || !EMPLOYEE_AREAS.has(area)
        || (contractType && !CONTRACT_TYPES.has(contractType))
        || !['activo', 'inactivo'].includes(employmentStatus)
        || (startDate && Number.isNaN(new Date(startDate).getTime()))) {
      return res.status(400).json({ error: 'Datos laborales inválidos' });
    }
    if (userId === req.user.id && employmentStatus === 'inactivo') {
      return res.status(409).json({ error: 'No puedes desactivar tu propia cuenta' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query(
        `SELECT id, rol FROM usuarios
         WHERE id = $1 AND empresa_id = $2 AND rol <> 'cliente'
         FOR UPDATE`,
        [userId, req.user.empresa_id]
      );
      if (target.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Colaborador no encontrado' });
      }
      if (target.rows[0].rol === 'admin' && userId !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No puedes modificar otra cuenta administradora' });
      }

      await client.query(
        `UPDATE usuarios
         SET estado = $1,
             sesion_version = CASE WHEN estado <> $1 THEN sesion_version + 1 ELSE sesion_version END
         WHERE id = $2`,
        [employmentStatus, userId]
      );
      await client.query(
        `INSERT INTO perfiles_empleados
          (usuario_id, empresa_id, cargo, area, fecha_ingreso, tipo_contrato, notas)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (usuario_id) DO UPDATE
         SET cargo = EXCLUDED.cargo,
             area = EXCLUDED.area,
             fecha_ingreso = EXCLUDED.fecha_ingreso,
             tipo_contrato = EXCLUDED.tipo_contrato,
             notas = EXCLUDED.notas,
             actualizado_en = CURRENT_TIMESTAMP`,
        [userId, req.user.empresa_id, position, area, startDate, contractType, notes]
      );
      await writeAudit({
        client,
        req,
        action: 'empleado.actualizado',
        entity: 'usuarios',
        entityId: userId,
        details: { cargo: position, area, estado: employmentStatus }
      });
      await client.query('COMMIT');
      return res.json({ message: 'Perfil laboral actualizado' });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('employee_update_failed', { error, userId });
      return res.status(500).json({ error: 'No fue posible actualizar el perfil' });
    } finally {
      client.release();
    }
  }
);

router.get(
  '/lotes',
  checkRole(['admin', 'jefe_planta']),
  requireModule('planta'),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT lp.id, lp.codigo, lp.producto_id, p.nombre AS producto_nombre,
                lp.cantidad, lp.estado, lp.resultado_calidad,
                lp.observaciones, lp.fecha_produccion, lp.completado_en,
                lp.creado_en, u.nombre AS responsable_nombre
         FROM lotes_produccion lp
         JOIN productos p ON p.id = lp.producto_id
         JOIN usuarios u ON u.id = lp.responsable_id
         WHERE lp.empresa_id = $1
         ORDER BY lp.fecha_produccion DESC, lp.id DESC
         LIMIT 200`,
        [req.user.empresa_id]
      );
      return res.json(result.rows);
    } catch (error) {
      logger.error('production_batches_read_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible cargar los lotes' });
    }
  }
);

router.post(
  '/lotes',
  checkRole(['admin', 'jefe_planta']),
  requireModule('planta'),
  async (req, res) => {
    const productId = Number(req.body.producto_id);
    const quantity = Number(req.body.cantidad);
    const code = optionalText(req.body.codigo, 60);
    const notes = optionalText(req.body.observaciones, 500);
    const productionDate = req.body.fecha_produccion || new Date().toISOString().slice(0, 10);
    if (!Number.isInteger(productId) || productId <= 0
        || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1000000
        || !code || !/^[\p{L}\p{N}_.-]{2,60}$/u.test(code)
        || notes === undefined || Number.isNaN(new Date(productionDate).getTime())) {
      return res.status(400).json({ error: 'Datos del lote inválidos' });
    }
    try {
      const product = await pool.query(
        `SELECT id FROM productos WHERE id = $1 AND empresa_id = $2 AND activo = TRUE`,
        [productId, req.user.empresa_id]
      );
      if (product.rowCount === 0) {
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
      const result = await pool.query(
        `INSERT INTO lotes_produccion
          (empresa_id, codigo, producto_id, cantidad, responsable_id,
           observaciones, fecha_produccion)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.empresa_id, code, productId, quantity, req.user.id, notes, productionDate]
      );
      await writeAudit({
        req,
        action: 'lote_produccion.creado',
        entity: 'lotes_produccion',
        entityId: result.rows[0].id,
        details: { codigo: code, producto_id: productId, cantidad: quantity }
      });
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'El código de lote ya existe' });
      }
      logger.error('production_batch_creation_failed', { error });
      return res.status(500).json({ error: 'No fue posible crear el lote' });
    }
  }
);

router.put(
  '/lotes/:id',
  checkRole(['admin', 'jefe_planta']),
  requireModule('planta'),
  async (req, res) => {
    const batchId = Number(req.params.id);
    const requestedState = req.body.estado;
    const requestedQuality = req.body.resultado_calidad;
    const notes = optionalText(req.body.observaciones, 500);
    if (!Number.isInteger(batchId) || batchId <= 0
        || (requestedState && !['planificado', 'en_proceso', 'completado', 'cancelado'].includes(requestedState))
        || (requestedQuality && !['pendiente', 'aprobado', 'rechazado'].includes(requestedQuality))
        || notes === undefined) {
      return res.status(400).json({ error: 'Actualización de lote inválida' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT * FROM lotes_produccion
         WHERE id = $1 AND empresa_id = $2
         FOR UPDATE`,
        [batchId, req.user.empresa_id]
      );
      const batch = result.rows[0];
      if (!batch) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Lote no encontrado' });
      }
      if (['completado', 'cancelado'].includes(batch.estado)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'El lote ya está cerrado' });
      }

      const nextState = requestedState || batch.estado;
      const nextQuality = requestedQuality || batch.resultado_calidad;
      const transitions = {
        planificado: ['planificado', 'en_proceso', 'cancelado'],
        en_proceso: ['en_proceso', 'completado', 'cancelado']
      };
      if (!transitions[batch.estado].includes(nextState)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Transición de lote no permitida' });
      }
      if (nextState === 'completado' && nextQuality !== 'aprobado') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Calidad debe aprobar el lote antes de ingresar stock' });
      }

      if (nextState === 'completado' && !batch.stock_aplicado) {
        await client.query(
          `UPDATE productos SET stock = stock + $1
           WHERE id = $2 AND empresa_id = $3`,
          [batch.cantidad, batch.producto_id, req.user.empresa_id]
        );
      }
      const updated = await client.query(
        `UPDATE lotes_produccion
         SET estado = $1::varchar,
             resultado_calidad = $2::varchar,
             observaciones = COALESCE($3, observaciones),
             stock_aplicado = CASE WHEN $1::varchar = 'completado' THEN TRUE ELSE stock_aplicado END,
             completado_en = CASE WHEN $1::varchar = 'completado' THEN CURRENT_TIMESTAMP ELSE completado_en END,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [nextState, nextQuality, notes, batchId]
      );
      await writeAudit({
        client,
        req,
        action: 'lote_produccion.actualizado',
        entity: 'lotes_produccion',
        entityId: batchId,
        details: { estado: nextState, resultado_calidad: nextQuality }
      });
      await client.query('COMMIT');
      return res.json(updated.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('production_batch_update_failed', { error, batchId });
      return res.status(500).json({ error: 'No fue posible actualizar el lote' });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
