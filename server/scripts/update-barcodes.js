import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Barcode mapping from research
const BARCODES = {
  // Epson UltraChrome HDR Inks (T636 series)
  'T636100': '010343870819',    // Photo Black
  'T636200': '010343870826',    // Cyan
  'T636300': '010343870833',    // Vivid Magenta
  'T636400': '010343870840',    // Yellow
  'T636500': '010343870857',    // Light Cyan
  'T636900': '010343870888',    // Light Light Black

  // Epson Maintenance
  'C13T642000': '0010343874435', // Cleaning Cartridge (EAN-13)
  'C12C890191': '010343853744',  // Maintenance Tank

  // Roland Eco-Sol MAX2
  'ESL4-WH': '4982978702185',    // White 220ml
  'ESL4-MT': '4982978702192',    // Metallic Silver 220ml
};

async function updateBarcodes() {
  const dbPath = path.join(__dirname, '../data/app.db');

  console.log('=== Barcode Update ===\n');

  const db = new Database(dbPath);

  try {
    const updateStmt = db.prepare('UPDATE inventory_items SET barcode = ? WHERE id = ?');
    const verifyStmt = db.prepare('SELECT id, name, barcode FROM inventory_items WHERE id = ?');

    let updated = 0;
    let notFound = 0;

    console.log('Updating barcodes...\n');

    for (const [productCode, barcode] of Object.entries(BARCODES)) {
      // Check if item exists
      const item = verifyStmt.get(productCode);

      if (!item) {
        console.log(`⚠️  Item not found: ${productCode}`);
        notFound++;
        continue;
      }

      // Update barcode
      const result = updateStmt.run(barcode, productCode);

      if (result.changes > 0) {
        console.log(`✓ ${productCode.padEnd(15)} | ${item.name.padEnd(25)} | ${barcode}`);
        updated++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`✓ Updated: ${updated} items`);
    console.log(`⚠️  Not found: ${notFound} items`);

    // Show all items with barcodes
    console.log('\n=== All Items with Barcodes ===\n');
    const allWithBarcodes = db.prepare(
      'SELECT id, name, printer, barcode FROM inventory_items WHERE barcode IS NOT NULL ORDER BY printer, name'
    ).all();

    allWithBarcodes.forEach(item => {
      console.log(`${item.id.padEnd(20)} | ${item.name.padEnd(30)} | ${item.barcode}`);
    });

    console.log(`\nTotal items with barcodes: ${allWithBarcodes.length}/44`);

  } catch (error) {
    console.error('✗ Error updating barcodes:', error.message);
    process.exit(1);
  }

  db.close();
  console.log('\n✅ Barcode update complete!');
}

updateBarcodes().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
