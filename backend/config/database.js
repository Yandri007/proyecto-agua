const { Pool } = require('pg');
const env = require('./env');
const logger = require('../utils/logger');

const pool = new Pool(env.db);
pool.on('error', (error) => {
  logger.error('database_idle_client_error', { error });
});

const addConstraintIfMissing = async (client, name, sql) => {
  const exists = await client.query(
    'SELECT 1 FROM pg_constraint WHERE conname = $1',
    [name]
  );
  if (exists.rowCount === 0) {
    await client.query(sql);
  }
};

const columnExists = async (client, tableName, columnName) => {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [tableName, columnName]
  );
  return result.rowCount > 0;
};

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    if (env.nodeEnv === 'production') {
      const transport = await client.query(
        'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()'
      );
      if (transport.rows[0]?.ssl !== true) {
        throw new Error('PostgreSQL no confirmo una conexion TLS activa');
      }
    }
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        slug VARCHAR(80) UNIQUE NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'activa',
        plan VARCHAR(30) NOT NULL DEFAULT 'prueba',
        suscripcion_estado VARCHAR(20) NOT NULL DEFAULT 'prueba',
        prueba_hasta TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days'),
        periodo_hasta TIMESTAMPTZ,
        proveedor_pago VARCHAR(30),
        suscripcion_externa_id VARCHAR(160),
        registro_clientes_habilitado BOOLEAN NOT NULL DEFAULT TRUE,
        modulos JSONB NOT NULL DEFAULT '{"ventas_ruta": true, "recursos_humanos": false, "planta": false, "logistica": false}'::jsonb,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("ALTER TABLE empresas ADD COLUMN IF NOT EXISTS plan VARCHAR(30) NOT NULL DEFAULT 'prueba'");
    await client.query("ALTER TABLE empresas ADD COLUMN IF NOT EXISTS suscripcion_estado VARCHAR(20) NOT NULL DEFAULT 'prueba'");
    await client.query("ALTER TABLE empresas ADD COLUMN IF NOT EXISTS prueba_hasta TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days')");
    await client.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS periodo_hasta TIMESTAMPTZ');
    await client.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS proveedor_pago VARCHAR(30)');
    await client.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS suscripcion_externa_id VARCHAR(160)');
    await client.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS registro_clientes_habilitado BOOLEAN NOT NULL DEFAULT TRUE');
    await client.query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modulos JSONB NOT NULL
      DEFAULT '{"ventas_ruta": true, "recursos_humanos": false, "planta": false, "logistica": false}'::jsonb`);
    await client.query(`UPDATE empresas
      SET modulos = '{"ventas_ruta": true, "recursos_humanos": false, "planta": false, "logistica": false}'::jsonb || modulos`);

    const empresaResult = await client.query(
      `INSERT INTO empresas (nombre, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [env.defaultEmpresaName, env.defaultEmpresaSlug]
    );
    const defaultEmpresaId = empresaResult.rows[0].id;

    const hadEmailVerification = await columnExists(client, 'usuarios', 'email_verificado_en');
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        empresa_id INT,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(160) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        telefono VARCHAR(20),
        direccion TEXT,
        rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
        estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        email_verificado_en TIMESTAMPTZ,
        sesion_version INT NOT NULL DEFAULT 1,
        ultimo_acceso_en TIMESTAMPTZ,
        ubicacion_consentida_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id INT');
    await client.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'activo'");
    await client.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email_verificado_en TIMESTAMPTZ');
    await client.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sesion_version INT NOT NULL DEFAULT 1');
    await client.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso_en TIMESTAMPTZ');
    await client.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacion_consentida_en TIMESTAMPTZ');
    if (!hadEmailVerification) {
      await client.query('UPDATE usuarios SET email_verificado_en = CURRENT_TIMESTAMP WHERE email_verificado_en IS NULL');
    }
    await client.query('UPDATE usuarios SET empresa_id = $1 WHERE empresa_id IS NULL', [defaultEmpresaId]);
    await client.query('ALTER TABLE usuarios ALTER COLUMN empresa_id SET NOT NULL');
    await addConstraintIfMissing(
      client,
      'usuarios_empresa_fk',
      'ALTER TABLE usuarios ADD CONSTRAINT usuarios_empresa_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id)'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        empresa_id INT,
        nombre VARCHAR(100) NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
        stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
        stock_minimo INT NOT NULL DEFAULT 10 CHECK (stock_minimo >= 0),
        es_retornable BOOLEAN NOT NULL DEFAULT FALSE,
        deposito_envase DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (deposito_envase >= 0),
        activo BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);
    await client.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS empresa_id INT');
    await client.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE');
    await client.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_retornable BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS deposito_envase DECIMAL(10,2) NOT NULL DEFAULT 0');
    await client.query('UPDATE productos SET empresa_id = $1 WHERE empresa_id IS NULL', [defaultEmpresaId]);
    await client.query('ALTER TABLE productos ALTER COLUMN empresa_id SET NOT NULL');
    await addConstraintIfMissing(
      client,
      'productos_empresa_fk',
      'ALTER TABLE productos ADD CONSTRAINT productos_empresa_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id)'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        empresa_id INT,
        cliente_id INT NOT NULL REFERENCES usuarios(id),
        repartidor_id INT REFERENCES usuarios(id),
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
        subtotal_productos DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (subtotal_productos >= 0),
        deposito_envases DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (deposito_envases >= 0),
        metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
        direccion_entrega TEXT NOT NULL,
        latitud_entrega DECIMAL(10,8),
        longitud_entrega DECIMAL(11,8),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        entregado_en TIMESTAMPTZ,
        confirmado BOOLEAN NOT NULL DEFAULT FALSE,
        oculto_para_cliente BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS empresa_id INT');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS entregado_en TIMESTAMPTZ');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS confirmado BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS oculto_para_cliente BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS subtotal_productos DECIMAL(10,2) NOT NULL DEFAULT 0');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS deposito_envases DECIMAL(10,2) NOT NULL DEFAULT 0');
    await client.query("ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo'");
    await client.query('UPDATE pedidos SET subtotal_productos = total WHERE subtotal_productos = 0 AND total > 0');
    await client.query(
      `UPDATE pedidos p
       SET empresa_id = u.empresa_id
       FROM usuarios u
       WHERE p.cliente_id = u.id AND p.empresa_id IS NULL`
    );
    await client.query('UPDATE pedidos SET empresa_id = $1 WHERE empresa_id IS NULL', [defaultEmpresaId]);
    await client.query('ALTER TABLE pedidos ALTER COLUMN empresa_id SET NOT NULL');
    await addConstraintIfMissing(
      client,
      'pedidos_empresa_fk',
      'ALTER TABLE pedidos ADD CONSTRAINT pedidos_empresa_fk FOREIGN KEY (empresa_id) REFERENCES empresas(id)'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS detalle_pedidos (
        id SERIAL PRIMARY KEY,
        pedido_id INT NOT NULL REFERENCES pedidos(id),
        producto_id INT NOT NULL REFERENCES productos(id),
        cantidad INT NOT NULL CHECK (cantidad > 0),
        precio_unitario DECIMAL(10,2) NOT NULL CHECK (precio_unitario >= 0),
        es_retornable BOOLEAN NOT NULL DEFAULT FALSE,
        deposito_unitario DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (deposito_unitario >= 0)
      )
    `);
    await client.query('ALTER TABLE detalle_pedidos ADD COLUMN IF NOT EXISTS es_retornable BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('ALTER TABLE detalle_pedidos ADD COLUMN IF NOT EXISTS deposito_unitario DECIMAL(10,2) NOT NULL DEFAULT 0');
    await client.query(`
      UPDATE detalle_pedidos dp
      SET es_retornable = p.es_retornable,
          deposito_unitario = p.deposito_envase
      FROM productos p
      WHERE p.id = dp.producto_id
        AND dp.es_retornable = FALSE
        AND dp.deposito_unitario = 0
        AND p.es_retornable = TRUE
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pedidos_recurrentes (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        cliente_id INT NOT NULL REFERENCES usuarios(id),
        frecuencia VARCHAR(20) NOT NULL,
        dia_mes SMALLINT NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
        proxima_entrega DATE NOT NULL,
        direccion_entrega VARCHAR(300) NOT NULL,
        latitud_entrega DECIMAL(10,8),
        longitud_entrega DECIMAL(11,8),
        metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo',
        estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        pausado_hasta DATE,
        ultima_generacion DATE,
        ultimo_error VARCHAR(300),
        idempotency_key VARCHAR(80),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('ALTER TABLE pedidos_recurrentes ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80)');
    await client.query("ALTER TABLE pedidos_recurrentes ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(30) NOT NULL DEFAULT 'efectivo'");
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS pedidos_recurrentes_idempotencia_uniq ON pedidos_recurrentes (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

    await client.query(`
      CREATE TABLE IF NOT EXISTS detalle_pedidos_recurrentes (
        id BIGSERIAL PRIMARY KEY,
        pedido_recurrente_id BIGINT NOT NULL REFERENCES pedidos_recurrentes(id) ON DELETE CASCADE,
        producto_id INT NOT NULL REFERENCES productos(id),
        cantidad INT NOT NULL CHECK (cantidad > 0),
        UNIQUE (pedido_recurrente_id, producto_id)
      )
    `);

    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pedido_recurrente_id BIGINT REFERENCES pedidos_recurrentes(id)');
    await client.query('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fecha_programada DATE');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ejecuciones_pedidos_recurrentes (
        id BIGSERIAL PRIMARY KEY,
        pedido_recurrente_id BIGINT NOT NULL REFERENCES pedidos_recurrentes(id) ON DELETE CASCADE,
        fecha_programada DATE NOT NULL,
        pedido_id INT REFERENCES pedidos(id) ON DELETE SET NULL,
        estado VARCHAR(20) NOT NULL,
        error VARCHAR(300),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (pedido_recurrente_id, fecha_programada)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ubicaciones_repartidores (
        pedido_id INT PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        repartidor_id INT NOT NULL REFERENCES usuarios(id),
        latitud DECIMAL(10,8) NOT NULL,
        longitud DECIMAL(11,8) NOT NULL,
        precision_metros DECIMAL(10,2),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens_usuarios (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo VARCHAR(40) NOT NULL,
        token_hash CHAR(64) UNIQUE NOT NULL,
        expira_en TIMESTAMPTZ NOT NULL,
        usado_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS auditoria (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT REFERENCES empresas(id),
        usuario_id INT REFERENCES usuarios(id),
        accion VARCHAR(160) NOT NULL,
        entidad VARCHAR(100) NOT NULL,
        entidad_id VARCHAR(100),
        detalles JSONB NOT NULL DEFAULT '{}'::jsonb,
        direccion_ip VARCHAR(64),
        user_agent VARCHAR(500),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS eventos_suscripcion (
        id BIGSERIAL PRIMARY KEY,
        proveedor VARCHAR(30) NOT NULL,
        evento_externo_id VARCHAR(180) NOT NULL,
        empresa_id INT REFERENCES empresas(id),
        tipo VARCHAR(80) NOT NULL,
        monto DECIMAL(10,2),
        moneda VARCHAR(3),
        estado VARCHAR(30) NOT NULL,
        detalles JSONB NOT NULL DEFAULT '{}'::jsonb,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (proveedor, evento_externo_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS perfiles_empleados (
        usuario_id INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        cargo VARCHAR(100) NOT NULL,
        area VARCHAR(60) NOT NULL,
        fecha_ingreso DATE,
        tipo_contrato VARCHAR(40),
        notas VARCHAR(500),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      INSERT INTO perfiles_empleados (usuario_id, empresa_id, cargo, area)
      SELECT u.id,
             u.empresa_id,
             CASE u.rol
               WHEN 'admin' THEN 'Administrador'
               WHEN 'repartidor' THEN 'Repartidor'
               WHEN 'rh' THEN 'Responsable de Recursos Humanos'
               WHEN 'jefe_planta' THEN 'Jefe de planta'
               ELSE 'Colaborador'
             END,
             CASE u.rol
               WHEN 'repartidor' THEN 'Distribución'
               WHEN 'rh' THEN 'Recursos Humanos'
               WHEN 'jefe_planta' THEN 'Planta'
               ELSE 'Administración'
             END
      FROM usuarios u
      WHERE u.rol IN ('admin', 'repartidor', 'rh', 'jefe_planta')
      ON CONFLICT (usuario_id) DO NOTHING
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ventas_ruta (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        repartidor_id INT NOT NULL REFERENCES usuarios(id),
        cliente_nombre VARCHAR(120) NOT NULL,
        cliente_telefono VARCHAR(20),
        direccion VARCHAR(300),
        metodo_pago VARCHAR(30) NOT NULL,
        referencia_pago VARCHAR(120),
        total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
        estado_revision VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        observaciones VARCHAR(500),
        nota_revision VARCHAR(500),
        idempotency_key VARCHAR(80) NOT NULL,
        vendido_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revisado_por INT REFERENCES usuarios(id),
        revisado_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (empresa_id, idempotency_key)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS detalle_ventas_ruta (
        id BIGSERIAL PRIMARY KEY,
        venta_id BIGINT NOT NULL REFERENCES ventas_ruta(id) ON DELETE CASCADE,
        producto_id INT NOT NULL REFERENCES productos(id),
        producto_nombre VARCHAR(100) NOT NULL,
        cantidad INT NOT NULL CHECK (cantidad > 0),
        precio_unitario DECIMAL(10,2) NOT NULL CHECK (precio_unitario >= 0),
        envases_devueltos INT NOT NULL DEFAULT 0 CHECK (envases_devueltos >= 0),
        deposito_unitario DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (deposito_unitario >= 0)
      )
    `);
    await client.query('ALTER TABLE detalle_ventas_ruta ADD COLUMN IF NOT EXISTS envases_devueltos INT NOT NULL DEFAULT 0');
    await client.query('ALTER TABLE detalle_ventas_ruta ADD COLUMN IF NOT EXISTS deposito_unitario DECIMAL(10,2) NOT NULL DEFAULT 0');

    await client.query(`
      CREATE TABLE IF NOT EXISTS vehiculos (
        id SERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        placa VARCHAR(16) NOT NULL,
        nombre VARCHAR(80) NOT NULL,
        repartidor_id INT REFERENCES usuarios(id),
        estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (empresa_id, placa)
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_repartidor_activo_uniq
      ON vehiculos (empresa_id, repartidor_id)
      WHERE repartidor_id IS NOT NULL AND estado = 'activo'`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventario_vehiculos (
        vehiculo_id INT NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
        producto_id INT NOT NULL REFERENCES productos(id),
        cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (vehiculo_id, producto_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS movimientos_inventario_vehiculos (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        vehiculo_id INT NOT NULL REFERENCES vehiculos(id),
        producto_id INT NOT NULL REFERENCES productos(id),
        usuario_id INT NOT NULL REFERENCES usuarios(id),
        tipo VARCHAR(30) NOT NULL,
        cantidad INT NOT NULL CHECK (cantidad <> 0),
        referencia VARCHAR(100),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query('ALTER TABLE ventas_ruta ADD COLUMN IF NOT EXISTS vehiculo_id INT REFERENCES vehiculos(id)');
    await client.query("ALTER TABLE ventas_ruta ADD COLUMN IF NOT EXISTS origen_inventario VARCHAR(20) NOT NULL DEFAULT 'bodega'");

    await client.query(`
      CREATE TABLE IF NOT EXISTS movimientos_envases (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        repartidor_id INT NOT NULL REFERENCES usuarios(id),
        cliente_id INT REFERENCES usuarios(id),
        cliente_nombre VARCHAR(120) NOT NULL,
        producto_id INT NOT NULL REFERENCES productos(id),
        fuente_tipo VARCHAR(30) NOT NULL,
        fuente_id BIGINT NOT NULL,
        entregados INT NOT NULL DEFAULT 0 CHECK (entregados >= 0),
        devueltos INT NOT NULL DEFAULT 0 CHECK (devueltos >= 0),
        deposito_cobrado DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (deposito_cobrado >= 0),
        estado VARCHAR(20) NOT NULL DEFAULT 'aprobado',
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (fuente_tipo, fuente_id, producto_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS comprobantes_entrega (
        pedido_id INT PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        repartidor_id INT NOT NULL REFERENCES usuarios(id),
        receptor_nombre VARCHAR(120) NOT NULL,
        firma_data TEXT,
        observaciones VARCHAR(500),
        latitud DECIMAL(10,8),
        longitud DECIMAL(11,8),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cierres_ruta (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        repartidor_id INT NOT NULL REFERENCES usuarios(id),
        vehiculo_id INT REFERENCES vehiculos(id),
        fecha DATE NOT NULL,
        efectivo_ventas DECIMAL(10,2) NOT NULL DEFAULT 0,
        transferencias DECIMAL(10,2) NOT NULL DEFAULT 0,
        creditos DECIMAL(10,2) NOT NULL DEFAULT 0,
        gastos DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (gastos >= 0),
        efectivo_esperado DECIMAL(10,2) NOT NULL DEFAULT 0,
        efectivo_declarado DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (efectivo_declarado >= 0),
        diferencia DECIMAL(10,2) NOT NULL DEFAULT 0,
        observaciones VARCHAR(500),
        estado_revision VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        nota_revision VARCHAR(500),
        revisado_por INT REFERENCES usuarios(id),
        revisado_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (empresa_id, repartidor_id, fecha)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lotes_produccion (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INT NOT NULL REFERENCES empresas(id),
        codigo VARCHAR(60) NOT NULL,
        producto_id INT NOT NULL REFERENCES productos(id),
        cantidad INT NOT NULL CHECK (cantidad > 0),
        estado VARCHAR(20) NOT NULL DEFAULT 'planificado',
        resultado_calidad VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        responsable_id INT NOT NULL REFERENCES usuarios(id),
        observaciones VARCHAR(500),
        stock_aplicado BOOLEAN NOT NULL DEFAULT FALSE,
        fecha_produccion DATE NOT NULL DEFAULT CURRENT_DATE,
        completado_en TIMESTAMPTZ,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (empresa_id, codigo)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS usuarios_empresa_rol_idx ON usuarios (empresa_id, rol, estado)');
    await client.query('CREATE INDEX IF NOT EXISTS productos_empresa_activo_idx ON productos (empresa_id, activo)');
    await client.query('CREATE INDEX IF NOT EXISTS pedidos_empresa_estado_idx ON pedidos (empresa_id, estado, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS pedidos_cliente_idx ON pedidos (cliente_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS pedidos_repartidor_idx ON pedidos (repartidor_id, estado)');
    await client.query('CREATE INDEX IF NOT EXISTS pedidos_recurrentes_empresa_fecha_idx ON pedidos_recurrentes (empresa_id, estado, proxima_entrega)');
    await client.query('CREATE INDEX IF NOT EXISTS pedidos_recurrentes_cliente_idx ON pedidos_recurrentes (cliente_id, estado)');
    await client.query('CREATE INDEX IF NOT EXISTS ejecuciones_recurrentes_fecha_idx ON ejecuciones_pedidos_recurrentes (fecha_programada DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS empresas_estado_plan_idx ON empresas (estado, plan)');
    await client.query('CREATE INDEX IF NOT EXISTS ubicaciones_empresa_actualizacion_idx ON ubicaciones_repartidores (empresa_id, actualizado_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS tokens_usuario_tipo_idx ON tokens_usuarios (usuario_id, tipo, expira_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS auditoria_empresa_fecha_idx ON auditoria (empresa_id, creado_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS eventos_suscripcion_empresa_idx ON eventos_suscripcion (empresa_id, creado_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS perfiles_empleados_empresa_idx ON perfiles_empleados (empresa_id, area)');
    await client.query('CREATE INDEX IF NOT EXISTS ventas_ruta_empresa_estado_idx ON ventas_ruta (empresa_id, estado_revision, vendido_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS ventas_ruta_repartidor_idx ON ventas_ruta (repartidor_id, vendido_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS lotes_produccion_empresa_idx ON lotes_produccion (empresa_id, fecha_produccion DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS movimientos_vehiculo_empresa_idx ON movimientos_inventario_vehiculos (empresa_id, creado_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS movimientos_envases_empresa_idx ON movimientos_envases (empresa_id, creado_en DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS cierres_ruta_empresa_idx ON cierres_ruta (empresa_id, fecha DESC)');

    await client.query('COMMIT');
    console.log('Base de datos verificada y lista');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = pool;
module.exports.initializeDatabase = initializeDatabase;
