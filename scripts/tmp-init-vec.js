const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2];
if (!dbPath) { 
  console.error('Usage: node tmp-init-vec.js <dbPath>'); 
  process.exit(1); 
}

const db = new Database(dbPath);
const vecPath = path.join(process.cwd(), 'vendor', 'sqlite-extensions', 'vec0.dylib');

db.loadExtension(vecPath);
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(node_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding FLOAT[1536]);
`);

console.log('✓ vec tables ensured');
db.close();