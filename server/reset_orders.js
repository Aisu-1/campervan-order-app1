const db = require('./db');

async function resetOrders() {
  try {
    console.log('Resetting orders...');
    
    // Delete all orders
    await db.runAsync('DELETE FROM orders');
    console.log('All orders deleted.');

    // Reset ID counter
    await db.runAsync("DELETE FROM sqlite_sequence WHERE name='orders'");
    console.log('Order IDs reset.');

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error resetting orders:', err);
    process.exit(1);
  }
}

resetOrders();
