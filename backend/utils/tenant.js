const DEFAULT_PRODUCTS = [
  {
    nombre: 'Bidón 20L',
    tipo: 'bidon',
    precio: 5,
    stock: 100,
    stock_minimo: 20
  },
  {
    nombre: 'Galón 5L',
    tipo: 'galon',
    precio: 2.5,
    stock: 150,
    stock_minimo: 30
  },
  {
    nombre: 'Paca de botellas (6 uds)',
    tipo: 'paca_botellas',
    precio: 4,
    stock: 80,
    stock_minimo: 15
  },
  {
    nombre: 'Botella 1L',
    tipo: 'botella',
    precio: 1,
    stock: 200,
    stock_minimo: 50
  }
];

const normalizeSlug = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const seedDefaultProducts = async (client, empresaId) => {
  for (const product of DEFAULT_PRODUCTS) {
    await client.query(
      `INSERT INTO productos
        (empresa_id, nombre, tipo, precio, stock, stock_minimo)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        empresaId,
        product.nombre,
        product.tipo,
        product.precio,
        product.stock,
        product.stock_minimo
      ]
    );
  }
};

module.exports = {
  DEFAULT_PRODUCTS,
  normalizeSlug,
  seedDefaultProducts
};
