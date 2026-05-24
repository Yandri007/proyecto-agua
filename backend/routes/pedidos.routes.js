const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth');

// Middleware para verificar token local (por compatibilidad)
const verifyTokenLocal = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso denegado' });
  try {
    const jwt = require('jsonwebtoken');
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'secreto_super_seguro');
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Token inválido' });
  }
};

const verify = verifyTokenLocal;

// ============ CLIENTE - CREAR PEDIDO (CON TRANSACCIÓN) ============
router.post('/', verify, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { productos, direccion_entrega, latitud_entrega, longitud_entrega } = req.body;
    const cliente_id = req.user.id;

    // Verificar stock suficiente
    for (const item of productos) {
      const productoStock = await client.query('SELECT stock FROM productos WHERE id = $1', [item.producto_id]);
      if (productoStock.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Producto ${item.producto_id} no existe` });
      }
      if (productoStock.rows[0].stock < item.cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Stock insuficiente para el producto. Disponible: ${productoStock.rows[0].stock}` });
      }
    }

    // Calcular total
    let total = 0;
    for (const item of productos) {
      const producto = await client.query('SELECT precio FROM productos WHERE id = $1', [item.producto_id]);
      if (producto.rows.length === 0) continue;
      total += producto.rows[0].precio * item.cantidad;
    }

    // Crear pedido
    const pedidoResult = await client.query(
      'INSERT INTO pedidos (cliente_id, total, direccion_entrega, latitud_entrega, longitud_entrega, estado) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [cliente_id, total, direccion_entrega, latitud_entrega, longitud_entrega, 'pendiente']
    );

    const pedido = pedidoResult.rows[0];

    // Insertar detalles y actualizar stock
    for (const item of productos) {
      const producto = await client.query('SELECT precio FROM productos WHERE id = $1', [item.producto_id]);
      if (producto.rows.length === 0) continue;
      await client.query(
        'INSERT INTO detalle_pedidos (pedido_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)',
        [pedido.id, item.producto_id, item.cantidad, producto.rows[0].precio]
      );
      await client.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [item.cantidad, item.producto_id]);
    }

    await client.query('COMMIT');

    // Notificar a admin via socket
    const io = req.app.get('io');
    if (io) {
      const clienteResult = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [cliente_id]);
      const clienteNombre = clienteResult.rows[0]?.nombre || 'Cliente';
      io.emit('nuevo_pedido', { pedido_id: pedido.id, cliente: clienteNombre, total: total });
    }

    res.status(201).json(pedido);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ============ CLIENTE - MIS PEDIDOS ============
router.get('/mis-pedidos', verify, async (req, res) => {
  try {
    const pedidos = await pool.query(
      `SELECT p.* FROM pedidos p 
       WHERE p.cliente_id = $1 AND p.oculto_para_cliente = false 
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(pedidos.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN - TODOS LOS PEDIDOS ============
router.get('/admin/todos', verify, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    const pedidos = await pool.query(
      `SELECT p.*, u.nombre as cliente_nombre FROM pedidos p LEFT JOIN usuarios u ON p.cliente_id = u.id WHERE p.estado != 'cancelado' ORDER BY p.created_at DESC`
    );
    res.json(pedidos.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ REPARTIDOR - PEDIDOS ASIGNADOS ============
router.get('/repartidor/:repartidorId', async (req, res) => {
  try {
    const { repartidorId } = req.params;
    const result = await pool.query(
      `SELECT p.*, u.nombre as cliente_nombre, u.telefono as cliente_telefono 
      FROM pedidos p
      LEFT JOIN usuarios u ON p.cliente_id = u.id
      WHERE p.repartidor_id = $1 AND p.estado != 'entregado' AND p.estado != 'cancelado'
      ORDER BY p.created_at DESC`,
      [repartidorId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ACTUALIZACIÓN ============
router.put('/:id/estado', verify, async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2', [estado, id]);
    res.json({ message: 'Estado actualizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/asignar', verify, async (req, res) => {
  try {
    const { id } = req.params;
    const { repartidor_id } = req.body;
    await pool.query('UPDATE pedidos SET repartidor_id = $1 WHERE id = $2', [repartidor_id, id]);
    res.json({ message: 'Repartidor asignado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/confirmar', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE pedidos SET confirmado = true WHERE id = $1', [id]);

    // Notificar a admin
    const io = req.app.get('io');
    if (io) {
      io.emit('pedido_confirmado', { pedidoId: id });
    }

    res.json({ message: 'Confirmado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/cancelar', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE pedidos SET estado = 'cancelado' WHERE id = $1", [id]);

    // Notificar a admin
    const io = req.app.get('io');
    if (io) {
      io.emit('pedido_cancelado', { pedidoId: id });
    }

    res.json({ message: 'Pedido cancelado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reporte productos más vendidos
router.get('/reporte/productos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.nombre, SUM(dp.cantidad) as total_vendido
       FROM detalle_pedidos dp
       JOIN productos p ON dp.producto_id = p.id
       JOIN pedidos ped ON dp.pedido_id = ped.id
       WHERE ped.estado = 'entregado'
       GROUP BY p.id, p.nombre
       ORDER BY total_vendido DESC LIMIT 5`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============ NUEVAS RUTAS PARA REPORTES Y FILTROS ============

// 🔥 ADMIN - Reporte de ventas agrupadas por día de la semana
router.get('/reporte/ventas-por-dia-semana', verify, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    
    const result = await pool.query(`
      SELECT 
        EXTRACT(DOW FROM created_at) as dia_semana,
        CASE EXTRACT(DOW FROM created_at)
          WHEN 0 THEN 'Domingo'
          WHEN 1 THEN 'Lunes'
          WHEN 2 THEN 'Martes'
          WHEN 3 THEN 'Miércoles'
          WHEN 4 THEN 'Jueves'
          WHEN 5 THEN 'Viernes'
          WHEN 6 THEN 'Sábado'
        END as nombre_dia,
        COUNT(*) as total_pedidos,
        COALESCE(SUM(total), 0) as total_ventas
      FROM pedidos 
      WHERE estado = 'entregado'
      GROUP BY dia_semana
      ORDER BY dia_semana
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 ADMIN - Reporte de ventas por mes específico
router.get('/reporte/ventas-por-mes/:anio/:mes', verify, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    
    const { anio, mes } = req.params;
    const result = await pool.query(`
      SELECT 
        EXTRACT(DAY FROM created_at) as dia,
        COUNT(*) as total_pedidos,
        COALESCE(SUM(total), 0) as total_ventas
      FROM pedidos 
      WHERE estado = 'entregado' 
        AND EXTRACT(YEAR FROM created_at) = $1 
        AND EXTRACT(MONTH FROM created_at) = $2
      GROUP BY dia
      ORDER BY dia ASC
    `, [anio, mes]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 ADMIN - Resumen rápido (hoy, semana, mes)
router.get('/reporte/resumen-rapido', verify, async (req, res) => {
  try {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    
    const hoy = new Date().toISOString().split('T')[0];
    const semanaInicio = new Date();
    semanaInicio.setDate(semanaInicio.getDate() - semanaInicio.getDay());
    const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const result = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN created_at::DATE = $1 THEN total ELSE 0 END), 0) as ventas_hoy,
        COALESCE(SUM(CASE WHEN created_at::DATE >= $2 THEN total ELSE 0 END), 0) as ventas_semana,
        COALESCE(SUM(CASE WHEN created_at::DATE >= $3 THEN total ELSE 0 END), 0) as ventas_mes,
        COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pedidos_pendientes,
        COUNT(CASE WHEN estado = 'entregado' THEN 1 END) as pedidos_entregados
      FROM pedidos
      WHERE estado != 'cancelado'
    `, [hoy, semanaInicio.toISOString().split('T')[0], mesInicio.toISOString().split('T')[0]]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 REPARTIDOR - Total vendido por día (historial propio)
router.get('/repartidor/total-por-dia/:repartidorId', async (req, res) => {
  try {
    const { repartidorId } = req.params;
    const result = await pool.query(`
      SELECT 
        created_at::DATE as fecha,
        COUNT(*) as total_pedidos,
        COALESCE(SUM(total), 0) as total_ventas
      FROM pedidos 
      WHERE repartidor_id = $1 AND estado = 'entregado'
      GROUP BY created_at::DATE
      ORDER BY created_at::DATE DESC
      LIMIT 30
    `, [repartidorId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 CLIENTE - Ocultar pedido del historial (soft delete visual)
router.put('/cliente/ocultar/:pedidoId', verify, async (req, res) => {
  try {
    const { pedidoId } = req.params;
    // Verificar que el pedido pertenece al cliente
    const pedido = await pool.query('SELECT cliente_id FROM pedidos WHERE id = $1', [pedidoId]);
    if (pedido.rows[0]?.cliente_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso' });
    }
    await pool.query('UPDATE pedidos SET oculto_para_cliente = true WHERE id = $1', [pedidoId]);
    res.json({ message: 'Pedido ocultado del historial' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CLIENTE - Vaciar todo el historial (ocultar todos los pedidos visualmente)
router.put('/cliente/vaciar-historial', verify, async (req, res) => {
  try {
    await pool.query(
      'UPDATE pedidos SET oculto_para_cliente = true WHERE cliente_id = $1 AND estado IN ($2, $3)',
      [req.user.id, 'entregado', 'cancelado']
    );
    res.json({ message: 'Historial vaciado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CLIENTE - Ocultar un pedido específico
router.put('/cliente/ocultar/:pedidoId', verify, async (req, res) => {
  try {
    const { pedidoId } = req.params;
    // Verificar que el pedido pertenece al cliente
    const pedido = await pool.query('SELECT cliente_id FROM pedidos WHERE id = $1', [pedidoId]);
    if (pedido.rows[0]?.cliente_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso' });
    }
    await pool.query('UPDATE pedidos SET oculto_para_cliente = true WHERE id = $1', [pedidoId]);
    res.json({ message: 'Pedido ocultado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;