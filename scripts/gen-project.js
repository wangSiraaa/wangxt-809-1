const fs = require('fs');
const path = require('path');

const root = '/Users/mingyuan/workspace/sihuo/wangxtw3/809';

function write(relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Created:', relPath);
}

write('backend/package.json', JSON.stringify({
  name: "procurement-backend",
  version: "1.0.0",
  main: "src/index.js",
  scripts: {
    start: "node src/index.js",
    dev: "nodemon src/index.js",
    seed: "node src/seed.js"
  },
  dependencies: {
    bcryptjs: "^2.4.3",
    cors: "^2.8.5",
    express: "^4.18.2",
    jsonwebtoken: "^9.0.2",
    "better-sqlite3": "^9.4.3",
    uuid: "^9.0.1"
  },
  devDependencies: {
    nodemon: "^3.1.0"
  }
}, null, 2));

write('backend/Dockerfile', `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["node", "src/index.js"]
`);

write('backend/src/db.js', `const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/procurement.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(\`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('buyer','requester','supplier','approver')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS purchase_requirements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      department TEXT,
      requester_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      budget REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      requirement_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      buyer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      deadline DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS inquiry_suppliers (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(inquiry_id, supplier_id)
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      total_price REAL NOT NULL,
      delivery_days INTEGER,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'valid',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(inquiry_id, supplier_id)
    );
    CREATE TABLE IF NOT EXISTS score_items (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      score_item_id TEXT NOT NULL,
      score REAL NOT NULL,
      scorer_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(quote_id, score_item_id, scorer_id)
    );
    CREATE TABLE IF NOT EXISTS award_results (
      id TEXT PRIMARY KEY,
      inquiry_id TEXT NOT NULL,
      winning_quote_id TEXT NOT NULL,
      final_price REAL NOT NULL,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_by TEXT,
      approved_at DATETIME
    );
  \`);
}

module.exports = { db, initDb };
`);

console.log('=== Backend core files generated ===');
