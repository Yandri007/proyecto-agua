const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'aquacontrol',
  password: process.env.DB_PASSWORD, // ← solo esta línea cambia
  port: 5432,
});

const createTables = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      telefono VARCHAR(20),
      direccion TEXT,
      rol VARCHAR(50) DEFAULT 'cliente',
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      precio DECIMAL(10,2) NOT NULL,
      stock INT DEFAULT 0,
      stock_minimo INT DEFAULT 10
    )`,
    `CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      cliente_id INT REFERENCES usuarios(id),
      repartidor_id INT REFERENCES usuarios(id),
      estado VARCHAR(50) DEFAULT 'pendiente',
      total DECIMAL(10,2) NOT NULL,
      direccion_entrega TEXT NOT NULL,
      latitud_entrega DECIMAL(10,8),
      longitud_entrega DECIMAL(11,8),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      entregado_en TIMESTAMP,
      confirmado BOOLEAN DEFAULT FALSE
    )`,
    `CREATE TABLE IF NOT EXISTS detalle_pedidos (
      id SERIAL PRIMARY KEY,
      pedido_id INT REFERENCES pedidos(id),
      producto_id INT REFERENCES productos(id),
      cantidad INT NOT NULL,
      precio_unitario DECIMAL(10,2) NOT NULL
    )`
  ];
  for (const query of queries) {
    try {
      await pool.query(query);
      console.log('✅ Tabla creada/verificada');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
};

createTables();

module.exports = pool;