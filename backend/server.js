const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

const PORT = process.env.PORT || 3000;

// ============ IMPORTAR RUTAS ============
const authRoutes = require('./routes/auth.routes');
const pedidosRoutes = require('./routes/pedidos.routes');
const productosRoutes = require('./routes/productos.routes');
const inventarioRoutes = require('./routes/inventario.routes');
const repartidorRoutes = require('./routes/repartidor.routes');

// ============ USAR RUTAS ============
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/repartidor', repartidorRoutes);

// Guardar io para usar en las rutas
app.set('io', io);

// ============ SOCKET.IO - CONEXIONES EN TIEMPO REAL ============
const repartidoresConectados = new Map();
const clientesConectados = new Map();
const adminsConectados = new Map();
const db = require('./config/database');

io.on('connection', (socket) => {
  console.log('🧑 Cliente conectado:', socket.id);

  // Registrar usuario
  socket.on('registrar_usuario', (data) => {
    const { userId, rol } = data;
    const idNum = parseInt(userId);
    if (rol === 'repartidor') {
      repartidoresConectados.set(idNum, socket.id);
      console.log(`🚚 Repartidor ${userId} conectado`);
    } else if (rol === 'cliente') {
      clientesConectados.set(idNum, socket.id);
      console.log(`👤 Cliente ${userId} conectado`);
    } else if (rol === 'admin') {
      adminsConectados.set(idNum, socket.id);
      console.log(`👑 Admin ${userId} conectado`);
    }
  });

  // 🔥 NUEVO PEDIDO - Notificar a todos los admins en tiempo real
  socket.on('nuevo_pedido', (data) => {
    console.log('📦 Nuevo pedido recibido:', data);
    for (let [adminId, socketId] of adminsConectados) {
      io.to(socketId).emit('pedido_recibido', data);
    }
  });

  // 🔥 ADMIN ASIGNA PEDIDO - Notificar al repartidor
  socket.on('pedido_asignado', async (data) => {
    const { pedidoId, repartidorId } = data;
    const repartidorSocketId = repartidoresConectados.get(parseInt(repartidorId));
    if (repartidorSocketId) {
      io.to(repartidorSocketId).emit('nuevo_pedido_asignado', { pedidoId });
      console.log(`✅ Notificado repartidor ${repartidorId}`);
    }
    // También notificar al admin que ya se asignó
    for (let [adminId, socketId] of adminsConectados) {
      io.to(socketId).emit('pedido_actualizado', { pedidoId, estado: 'asignado' });
    }
  });

  // 🔥 REPARTIDOR ENVÍA UBICACIÓN - Solo al cliente del pedido
  socket.on('enviar_ubicacion', async (data) => {
    const { repartidorId, latitud, longitud, pedidoId } = data;
    try {
      const result = await db.query('SELECT cliente_id FROM pedidos WHERE id = $1', [pedidoId]);
      if (result.rows.length > 0) {
        const clienteId = result.rows[0].cliente_id;
        const clienteSocketId = clientesConectados.get(clienteId);
        if (clienteSocketId) {
          io.to(clienteSocketId).emit('ubicacion_repartidor', { repartidorId, latitud, longitud, pedidoId });
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });

  // 🔥 REPARTIDOR MARCA ENTREGADO - Notificar al cliente y admin
  socket.on('pedido_entregado', async (data) => {
    const { pedidoId, clienteId } = data;
    const clienteSocketId = clientesConectados.get(parseInt(clienteId));
    if (clienteSocketId) {
      io.to(clienteSocketId).emit('confirmacion_entrega', { pedidoId });
    }
    for (let [adminId, socketId] of adminsConectados) {
      io.to(socketId).emit('pedido_actualizado', { pedidoId, estado: 'entregado' });
    }
  });

  // 🔥 CLIENTE CONFIRMA RECEPCIÓN - Notificar al admin
  socket.on('cliente_confirma', async (data) => {
    const { pedidoId } = data;
    for (let [adminId, socketId] of adminsConectados) {
      io.to(socketId).emit('pedido_confirmado', { pedidoId });
    }
  });

  // 🔥 CLIENTE CANCELA PEDIDO - Notificar al admin
  socket.on('cliente_cancela', async (data) => {
    const { pedidoId } = data;
    for (let [adminId, socketId] of adminsConectados) {
      io.to(socketId).emit('pedido_cancelado', { pedidoId });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
    for (let [key, value] of repartidoresConectados) {
      if (value === socket.id) repartidoresConectados.delete(key);
    }
    for (let [key, value] of clientesConectados) {
      if (value === socket.id) clientesConectados.delete(key);
    }
    for (let [key, value] of adminsConectados) {
      if (value === socket.id) adminsConectados.delete(key);
    }
  });
});

// ============ RUTAS ESTÁTICAS ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ message: 'AquaControl API funcionando 🚀', status: 'ok' });
});

server.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});