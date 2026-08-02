const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const env = require('../config/env');

const demoPassword = 'AquaDemo-2026!';
const demoUsers = [
  {
    nombre: 'Administrador Demo',
    email: 'demo.admin@aquacontrol.com',
    rol: 'admin',
    telefono: '0990000001',
    cargo: 'Administrador general',
    area: 'Administración'
  },
  {
    nombre: 'Repartidor Demo',
    email: 'demo.repartidor@aquacontrol.com',
    rol: 'repartidor',
    telefono: '0990000002',
    cargo: 'Repartidor',
    area: 'Distribución'
  },
  {
    nombre: 'Cliente Demo',
    email: 'demo.cliente@aquacontrol.com',
    rol: 'cliente',
    telefono: '0990000003',
    direccion: 'Dirección de prueba'
  },
  {
    nombre: 'Recursos Humanos Demo',
    email: 'demo.rh@aquacontrol.com',
    rol: 'rh',
    telefono: '0990000004',
    cargo: 'Responsable de Recursos Humanos',
    area: 'Recursos Humanos'
  },
  {
    nombre: 'Jefe de Planta Demo',
    email: 'demo.planta@aquacontrol.com',
    rol: 'jefe_planta',
    telefono: '0990000005',
    cargo: 'Jefe de planta',
    area: 'Planta'
  }
];

const run = async () => {
  if (env.nodeEnv === 'production') {
    throw new Error('Las cuentas demo no se pueden crear en producción');
  }

  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    await client.query('BEGIN');
    const companyResult = await client.query(
      `UPDATE empresas
       SET plan = 'prueba',
           suscripcion_estado = 'prueba',
           prueba_hasta = CURRENT_TIMESTAMP + INTERVAL '14 days',
           modulos = modulos || '{"ventas_ruta": true, "recursos_humanos": true, "planta": true, "logistica": true}'::jsonb
       WHERE slug = $1
       RETURNING id, nombre, slug`,
      [env.defaultEmpresaSlug]
    );
    if (companyResult.rowCount === 0) {
      throw new Error(`No existe la empresa demo ${env.defaultEmpresaSlug}`);
    }

    const company = companyResult.rows[0];
    let demoDriverId = null;
    let demoClientId = null;
    for (const user of demoUsers) {
      const userResult = await client.query(
        `INSERT INTO usuarios
          (empresa_id, nombre, email, password, telefono, direccion, rol,
           estado, email_verificado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'activo', CURRENT_TIMESTAMP)
         ON CONFLICT (email) DO UPDATE
         SET empresa_id = EXCLUDED.empresa_id,
             nombre = EXCLUDED.nombre,
             password = EXCLUDED.password,
             telefono = EXCLUDED.telefono,
             direccion = EXCLUDED.direccion,
             rol = EXCLUDED.rol,
             estado = 'activo',
             email_verificado_en = CURRENT_TIMESTAMP,
             sesion_version = usuarios.sesion_version + 1
         RETURNING id`,
        [
          company.id,
          user.nombre,
          user.email,
          passwordHash,
          user.telefono,
          user.direccion || null,
          user.rol
        ]
      );
      if (user.rol !== 'cliente') {
        await client.query(
          `INSERT INTO perfiles_empleados
            (usuario_id, empresa_id, cargo, area, fecha_ingreso, tipo_contrato)
           VALUES ($1, $2, $3, $4, CURRENT_DATE, 'indefinido')
           ON CONFLICT (usuario_id) DO UPDATE
           SET cargo = EXCLUDED.cargo,
               area = EXCLUDED.area,
               actualizado_en = CURRENT_TIMESTAMP`,
          [userResult.rows[0].id, company.id, user.cargo, user.area]
        );
      }
      if (user.rol === 'repartidor') demoDriverId = userResult.rows[0].id;
      if (user.rol === 'cliente') demoClientId = userResult.rows[0].id;
    }

    const demoProduct = await client.query(
      `SELECT id, stock FROM productos
       WHERE empresa_id = $1 AND activo = TRUE
       ORDER BY (tipo = 'bidon') DESC, id LIMIT 1 FOR UPDATE`,
      [company.id]
    );
    if (demoDriverId && demoProduct.rowCount) {
      await client.query(
        `UPDATE vehiculos SET repartidor_id = NULL, actualizado_en = CURRENT_TIMESTAMP
         WHERE empresa_id = $1 AND repartidor_id = $2 AND placa <> 'DEMO-01'`,
        [company.id, demoDriverId]
      );
      const vehicleResult = await client.query(
        `INSERT INTO vehiculos (empresa_id, placa, nombre, repartidor_id, estado)
         VALUES ($1, 'DEMO-01', 'Unidad demo', $2, 'activo')
         ON CONFLICT (empresa_id, placa) DO UPDATE
         SET nombre = EXCLUDED.nombre, repartidor_id = EXCLUDED.repartidor_id,
             estado = 'activo', actualizado_en = CURRENT_TIMESTAMP
         RETURNING id`,
        [company.id, demoDriverId]
      );
      const vehicleId = vehicleResult.rows[0].id;
      const currentInventory = await client.query(
        `SELECT cantidad FROM inventario_vehiculos
         WHERE vehiculo_id = $1 AND producto_id = $2 FOR UPDATE`,
        [vehicleId, demoProduct.rows[0].id]
      );
      const currentQuantity = Number(currentInventory.rows[0]?.cantidad || 0);
      const loadQuantity = Math.min(Math.max(10 - currentQuantity, 0), Number(demoProduct.rows[0].stock));
      await client.query(
        `UPDATE productos SET es_retornable = TRUE, deposito_envase = 2
         WHERE id = $1 AND empresa_id = $2`,
        [demoProduct.rows[0].id, company.id]
      );
      if (loadQuantity > 0) {
        await client.query(
          `INSERT INTO inventario_vehiculos (vehiculo_id, producto_id, cantidad)
           VALUES ($1, $2, $3)
           ON CONFLICT (vehiculo_id, producto_id) DO UPDATE
           SET cantidad = inventario_vehiculos.cantidad + EXCLUDED.cantidad,
               actualizado_en = CURRENT_TIMESTAMP`,
          [vehicleId, demoProduct.rows[0].id, loadQuantity]
        );
        await client.query(
          `UPDATE productos SET stock = stock - $1
           WHERE id = $2 AND empresa_id = $3`,
          [loadQuantity, demoProduct.rows[0].id, company.id]
        );
      }
      if (demoClientId) {
        const recurring = await client.query(
          `INSERT INTO pedidos_recurrentes
            (empresa_id, cliente_id, frecuencia, dia_mes, proxima_entrega,
             direccion_entrega, estado, idempotency_key)
           VALUES ($1, $2, 'semanal', EXTRACT(DAY FROM CURRENT_DATE + 7)::int,
                   CURRENT_DATE + 7, 'Dirección de prueba', 'activo', 'demo-recurring-01')
           ON CONFLICT (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL
           DO UPDATE SET cliente_id = EXCLUDED.cliente_id, frecuencia = 'semanal',
               proxima_entrega = CURRENT_DATE + 7,
               dia_mes = EXTRACT(DAY FROM CURRENT_DATE + 7)::int,
               direccion_entrega = EXCLUDED.direccion_entrega, estado = 'activo',
               pausado_hasta = NULL, ultimo_error = NULL,
               actualizado_en = CURRENT_TIMESTAMP
           RETURNING id`,
          [company.id, demoClientId]
        );
        await client.query(
          `INSERT INTO detalle_pedidos_recurrentes
            (pedido_recurrente_id, producto_id, cantidad)
           VALUES ($1, $2, 2)
           ON CONFLICT (pedido_recurrente_id, producto_id) DO UPDATE
           SET cantidad = EXCLUDED.cantidad`,
          [recurring.rows[0].id, demoProduct.rows[0].id]
        );
      }
    }
    await client.query('COMMIT');

    console.log(`Empresa: ${company.nombre} (${company.slug})`);
    for (const user of demoUsers) {
      console.log(`${user.rol}: ${user.email} / ${demoPassword}`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
