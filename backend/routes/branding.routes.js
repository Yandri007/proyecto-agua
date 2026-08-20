const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');
const { requireActiveSubscription } = require('../utils/plans');
const { parseImageDataUrl } = require('../utils/imageData');
const { writeAudit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();

const brandingDto = (company) => ({
  nombre: company.nombre,
  slug: company.slug,
  logo_url: company.logo_mime
    ? `/api/branding/logo?v=${new Date(company.logo_actualizado_en).getTime()}`
    : null
});

router.use(verifyToken, requireActiveSubscription);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT nombre, slug, logo_mime, logo_actualizado_en
       FROM empresas WHERE id = $1 AND estado = 'activa'`,
      [req.user.empresa_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
    return res.json(brandingDto(result.rows[0]));
  } catch (error) {
    logger.error('branding_read_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible cargar la identidad de la empresa' });
  }
});

router.put(
  '/',
  checkRole(['admin']),
  body('nombre').trim().isLength({ min: 2, max: 120 }).withMessage('Nombre de empresa invalido'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    return next();
  },
  async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE empresas SET nombre = $1
         WHERE id = $2 AND estado = 'activa'
         RETURNING nombre, slug, logo_mime, logo_actualizado_en`,
        [req.body.nombre, req.user.empresa_id]
      );
      await writeAudit({
        req,
        action: 'empresa.identidad_actualizada',
        entity: 'empresas',
        entityId: req.user.empresa_id,
        details: { nombre: req.body.nombre }
      });
      req.app.get('io')?.to(`empresa:${req.user.empresa_id}`).emit('branding_actualizada');
      return res.json(brandingDto(result.rows[0]));
    } catch (error) {
      logger.error('branding_update_failed', { error, companyId: req.user.empresa_id });
      return res.status(500).json({ error: 'No fue posible actualizar la empresa' });
    }
  }
);

router.get('/logo', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT logo_data, logo_mime, logo_actualizado_en
       FROM empresas WHERE id = $1 AND estado = 'activa'`,
      [req.user.empresa_id]
    );
    const logo = result.rows[0];
    if (!logo?.logo_data || !logo.logo_mime) return res.status(404).end();
    res.set({
      'Cache-Control': 'private, max-age=86400',
      'Content-Type': logo.logo_mime,
      'Content-Length': logo.logo_data.length,
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(logo.logo_data);
  } catch (error) {
    logger.error('branding_logo_read_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).end();
  }
});

router.put('/logo', checkRole(['admin']), async (req, res) => {
  let image;
  try {
    image = parseImageDataUrl(req.body?.image, {
      maxBytes: 350 * 1024,
      maxWidth: 1000,
      maxHeight: 1000,
      maxPixels: 1000000
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const result = await pool.query(
      `UPDATE empresas
       SET logo_data = $1, logo_mime = $2, logo_actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $3 AND estado = 'activa'
       RETURNING nombre, slug, logo_mime, logo_actualizado_en`,
      [image.data, image.mime, req.user.empresa_id]
    );
    await writeAudit({
      req,
      action: 'empresa.logo_actualizado',
      entity: 'empresas',
      entityId: req.user.empresa_id,
      details: { mime: image.mime, bytes: image.data.length, ancho: image.width, alto: image.height }
    });
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}`).emit('branding_actualizada');
    return res.json(brandingDto(result.rows[0]));
  } catch (error) {
    logger.error('branding_logo_update_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible guardar el logotipo' });
  }
});

router.delete('/logo', checkRole(['admin']), async (req, res) => {
  try {
    await pool.query(
      `UPDATE empresas
       SET logo_data = NULL, logo_mime = NULL, logo_actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.user.empresa_id]
    );
    await writeAudit({
      req,
      action: 'empresa.logo_eliminado',
      entity: 'empresas',
      entityId: req.user.empresa_id
    });
    req.app.get('io')?.to(`empresa:${req.user.empresa_id}`).emit('branding_actualizada');
    return res.json({ message: 'Logotipo eliminado' });
  } catch (error) {
    logger.error('branding_logo_delete_failed', { error, companyId: req.user.empresa_id });
    return res.status(500).json({ error: 'No fue posible eliminar el logotipo' });
  }
});

module.exports = router;
