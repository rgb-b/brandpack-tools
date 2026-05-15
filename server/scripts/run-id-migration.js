import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  const dbPath = path.join(__dirname, '../data/app.db');
  const migrationPath = path.join(__dirname, '../migrations/update-inventory-ids.sql');

  console.log('=== Inventory ID Migration ===\n');

  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    console.error('✗ Database not found at:', dbPath);
    process.exit(1);
  }

  console.log('Backing up database...');
  const backupPath = `${dbPath}.backup-${Date.now()}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`✓ Backup created: ${backupPath}\n`);

  console.log('Opening database...');
  const db = new Database(dbPath);

  // Get pre-migration counts
  const preMigrationCount = db.prepare('SELECT COUNT(*) as count FROM inventory_items').get();
  console.log(`✓ Current inventory items: ${preMigrationCount.count}\n`);

  console.log('Reading migration SQL...');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  console.log('Executing migration...');
  try {
    db.exec(migrationSQL);
    console.log('✓ Migration completed successfully!\n');

    // Verify results
    console.log('=== Verification ===\n');

    const postMigrationCount = db.prepare('SELECT COUNT(*) as count FROM inventory_items').get();
    console.log(`Total inventory items: ${postMigrationCount.count}`);
    console.log(`Expected: 42 (39 updated + 3 new)\n`);

    // Check new items
    const newItems = db.prepare(`
      SELECT id, name, printer FROM inventory_items
      WHERE id IN ('1000006736', '1000006517', 'E-STF030G/24/30')
      ORDER BY id
    `).all();
    console.log(`New Roland items added: ${newItems.length}`);
    newItems.forEach(item => console.log(`  - ${item.id}: ${item.name}`));
    console.log();

    // Check sample updated IDs
    const updatedSamples = db.prepare(`
      SELECT id, name, printer FROM inventory_items
      WHERE id IN ('CT-RXRXG-C', 'T636200', 'T55J292', 'E-PPO250/44/45')
      ORDER BY printer, id
    `).all();
    console.log(`Sample updated IDs: ${updatedSamples.length}`);
    updatedSamples.forEach(item => console.log(`  - ${item.id}: ${item.name} (${item.printer})`));
    console.log();

    // Check usage history updated
    const usageCount = db.prepare('SELECT COUNT(*) as count FROM inventory_usage_history').get();
    console.log(`Usage history entries: ${usageCount.count}`);

    // Verify foreign keys work
    const fkTest = db.prepare(`
      SELECT COUNT(*) as count FROM inventory_usage_history
      WHERE item_id NOT IN (SELECT id FROM inventory_items)
    `).get();
    console.log(`Orphaned usage history records: ${fkTest.count} (should be 0)\n`);

    if (postMigrationCount.count === 42 && newItems.length === 3 && fkTest.count === 0) {
      console.log('✅ Migration successful! All verification checks passed.\n');
    } else {
      console.log('⚠️  Migration completed but some verification checks failed.\n');
    }

  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.log('\nRestoring from backup...');
    db.close();
    fs.copyFileSync(backupPath, dbPath);
    console.log('✓ Database restored from backup\n');
    process.exit(1);
  }

  db.close();
  console.log('=== Migration Complete ===');
}

runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
