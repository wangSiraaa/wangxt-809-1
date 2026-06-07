const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/procurement.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function promisify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      fn.apply(this, [...args, function(err, result) {
        if (err) reject(err);
        else resolve(result);
      }]);
    });
  };
}

class DatabaseWrapper {
  constructor(db) {
    this.db = db;
    this.run = promisify(db.run.bind(db));
    this.get = promisify(db.get.bind(db));
    this.all = promisify(db.all.bind(db));
    this.exec = promisify(db.exec.bind(db));
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: promisify(stmt.run.bind(stmt)),
      get: promisify(stmt.get.bind(stmt)),
      all: promisify(stmt.all.bind(stmt)),
      finalize: promisify(stmt.finalize.bind(stmt))
    };
  }

  pragma(sql) {
    return new Promise((resolve, reject) => {
      this.db.run('PRAGMA ' + sql, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

const wrappedDb = new DatabaseWrapper(db);

async function initDb() {
  await wrappedDb.pragma('journal_mode = WAL');
  await wrappedDb.pragma('foreign_keys = ON');
  
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('buyer','requester','supplier','approver')), created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS purchase_requirements (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, department TEXT, requester_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', budget REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, buyer_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', deadline DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS inquiry_suppliers (id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, supplier_id TEXT NOT NULL, invited_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(inquiry_id, supplier_id))");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, supplier_id TEXT NOT NULL, total_price REAL NOT NULL, delivery_days INTEGER, remarks TEXT, status TEXT NOT NULL DEFAULT 'valid', submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(inquiry_id, supplier_id))");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS score_items (id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, name TEXT NOT NULL, weight REAL NOT NULL, description TEXT)");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS scores (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, score_item_id TEXT NOT NULL, score REAL NOT NULL, scorer_id TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(quote_id, score_item_id, scorer_id))");
  await wrappedDb.exec("CREATE TABLE IF NOT EXISTS award_results (id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL, winning_quote_id TEXT NOT NULL, final_price REAL NOT NULL, remarks TEXT, status TEXT NOT NULL DEFAULT 'pending', created_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, approved_by TEXT, approved_at DATETIME)");
}

module.exports = { db: wrappedDb, initDb };
