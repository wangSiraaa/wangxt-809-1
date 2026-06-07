const fs = require('fs');
const path = require('path');

console.log('开始修复文件...');

// 1. 修复 db.js
const dbJs = `const sqlite3 = require('sqlite3').verbose();
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
`;
fs.writeFileSync(path.join(__dirname, 'src/db.js'), dbJs);
console.log('✓ db.js 已修复');

// 2. 修复 middleware/auth.js
const authMiddleware = `const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'procurement-sourcing-jwt-secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(' ')[1] : null;
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    db.prepare('SELECT id, username, name, role FROM users WHERE id = ?').get(decoded.userId).then(user => {
      if (!user) {
        return res.status(401).json({ error: '用户不存在' });
      }
      req.user = user;
      next();
    }).catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    });
  } catch (err) {
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function(req, res, next) {
    if (roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, JWT_SECRET };
`;
fs.writeFileSync(path.join(__dirname, 'src/middleware/auth.js'), authMiddleware);
console.log('✓ middleware/auth.js 已修复');

// 3. 修复 routes/auth.js
const authRoutes = `const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async function(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authMiddleware, function(req, res) {
  res.json({ user: req.user });
});

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, 'src/routes/auth.js'), authRoutes);
console.log('✓ routes/auth.js 已修复');

// 4. 修复 routes/awards.js
const awardsRoutes = `const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  try {
    const awards = await db.prepare(\`
      SELECT a.*, q.supplier_id, q.total_price, u.name as winning_supplier_name,
             i.title as inquiry_title, u2.name as created_by_name
      FROM award_results a
      LEFT JOIN quotes q ON a.winning_quote_id = q.id
      LEFT JOIN users u ON q.supplier_id = u.id
      LEFT JOIN inquiries i ON a.inquiry_id = i.id
      LEFT JOIN users u2 ON a.created_by = u2.id
      ORDER BY a.created_at DESC
    \`).all();
    res.json({ awards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authMiddleware, async function(req, res) {
  try {
    const award = await db.prepare(\`
      SELECT a.*, q.supplier_id, q.total_price, q.delivery_days, q.remarks as quote_remarks,
             u.name as winning_supplier_name, i.title as inquiry_title, i.description as inquiry_description,
             u2.name as created_by_name
      FROM award_results a
      LEFT JOIN quotes q ON a.winning_quote_id = q.id
      LEFT JOIN users u ON q.supplier_id = u.id
      LEFT JOIN inquiries i ON a.inquiry_id = i.id
      LEFT JOIN users u2 ON a.created_by = u2.id
      WHERE a.id = ?
    \`).get(req.params.id);
    if (!award) {
      return res.status(404).json({ error: '定标结果不存在' });
    }
    res.json({ award });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { inquiry_id, winning_quote_id, final_price, remarks } = req.body;
    if (!inquiry_id || !winning_quote_id || final_price === undefined || final_price === null) {
      return res.status(400).json({ error: '参数不完整' });
    }
    const inquiry = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inquiry_id);
    if (!inquiry) {
      return res.status(404).json({ error: '询价单不存在' });
    }
    const validQuotes = await db.prepare(\`
      SELECT COUNT(*) as count
      FROM quotes
      WHERE inquiry_id = ? AND status = 'valid'
    \`).get(inquiry_id);
    if (validQuotes.count < 3) {
      return res.status(400).json({ error: '有效报价少于3家，不能定标' });
    }
    const winningQuote = await db.prepare('SELECT * FROM quotes WHERE id = ? AND inquiry_id = ?').get(winning_quote_id, inquiry_id);
    if (!winningQuote) {
      return res.status(404).json({ error: '中选报价不存在' });
    }
    if (winningQuote.status !== 'valid') {
      return res.status(400).json({ error: '中选报价无效' });
    }
    const existing = await db.prepare('SELECT * FROM award_results WHERE inquiry_id = ?').get(inquiry_id);
    if (existing) {
      return res.status(400).json({ error: '此询价单已存在定标结果' });
    }
    const id = uuidv4();
    await db.prepare(\`
      INSERT INTO award_results (id, inquiry_id, winning_quote_id, final_price, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    \`).run(id, inquiry_id, winning_quote_id, final_price, remarks || null, req.user.id);
    const award = await db.prepare('SELECT * FROM award_results WHERE id = ?').get(id);
    res.status(201).json({ award });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, requireRole('buyer', 'approver'), async function(req, res) {
  try {
    const { final_price, remarks, status } = req.body;
    const award = await db.prepare('SELECT * FROM award_results WHERE id = ?').get(req.params.id);
    if (!award) {
      return res.status(404).json({ error: '定标结果不存在' });
    }
    if (req.user.role === 'buyer' && award.created_by !== req.user.id) {
      return res.status(403).json({ error: '无权限修改此定标结果' });
    }
    const updateData = {
      final_price: final_price !== undefined ? final_price : award.final_price,
      remarks: remarks !== undefined ? remarks : award.remarks,
      status: status || award.status
    };
    if (status === 'approved' && req.user.role === 'approver') {
      await db.prepare(\`
        UPDATE award_results
        SET final_price = ?, remarks = ?, status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      \`).run(updateData.final_price, updateData.remarks, updateData.status, req.user.id, req.params.id);
    } else {
      await db.prepare(\`
        UPDATE award_results
        SET final_price = ?, remarks = ?, status = ?
        WHERE id = ?
      \`).run(updateData.final_price, updateData.remarks, updateData.status, req.params.id);
    }
    const updated = await db.prepare('SELECT * FROM award_results WHERE id = ?').get(req.params.id);
    res.json({ award: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const award = await db.prepare('SELECT * FROM award_results WHERE id = ?').get(req.params.id);
    if (!award) {
      return res.status(404).json({ error: '定标结果不存在' });
    }
    if (award.created_by !== req.user.id) {
      return res.status(403).json({ error: '无权限删除此定标结果' });
    }
    await db.prepare('DELETE FROM award_results WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, 'src/routes/awards.js'), awardsRoutes);
console.log('✓ routes/awards.js 已修复');

// 5. 修复 routes/inquiries.js
const inquiriesRoutes = `const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  try {
    const inquiries = await db.prepare(\`
      SELECT i.*, pr.title as requirement_title, u.name as buyer_name
      FROM inquiries i
      LEFT JOIN purchase_requirements pr ON i.requirement_id = pr.id
      LEFT JOIN users u ON i.buyer_id = u.id
      ORDER BY i.created_at DESC
    \`).all();
    res.json({ inquiries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authMiddleware, async function(req, res) {
  try {
    const inquiry = await db.prepare(\`
      SELECT i.*, pr.title as requirement_title, u.name as buyer_name
      FROM inquiries i
      LEFT JOIN purchase_requirements pr ON i.requirement_id = pr.id
      LEFT JOIN users u ON i.buyer_id = u.id
      WHERE i.id = ?
    \`).get(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ error: '询价单不存在' });
    }
    const suppliers = await db.prepare(\`
      SELECT s.*, isu.invited_at
      FROM inquiry_suppliers isu
      LEFT JOIN users s ON isu.supplier_id = s.id
      WHERE isu.inquiry_id = ?
    \`).all(req.params.id);
    const scoreItems = await db.prepare('SELECT * FROM score_items WHERE inquiry_id = ?').all(req.params.id);
    res.json({ inquiry, suppliers, scoreItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { requirement_id, title, description, deadline, score_items } = req.body;
    if (!requirement_id || !title) {
      return res.status(400).json({ error: '需求ID和标题不能为空' });
    }
    const id = uuidv4();
    const buyerId = req.user.id;
    await db.prepare(\`
      INSERT INTO inquiries (id, requirement_id, title, description, buyer_id, deadline)
      VALUES (?, ?, ?, ?, ?, ?)
    \`).run(id, requirement_id, title, description || null, buyerId, deadline || null);
    if (score_items && Array.isArray(score_items)) {
      const insertItem = db.prepare('INSERT INTO score_items (id, inquiry_id, name, weight, description) VALUES (?, ?, ?, ?, ?)');
      for (const item of score_items) {
        await insertItem.run(uuidv4(), id, item.name, item.weight, item.description || null);
      }
    }
    const inquiry = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
    res.status(201).json({ inquiry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/invite', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { supplier_ids } = req.body;
    const inquiry = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ error: '询价单不存在' });
    }
    if (!supplier_ids || !Array.isArray(supplier_ids)) {
      return res.status(400).json({ error: '供应商ID列表不能为空' });
    }
    const insertSupplier = db.prepare('INSERT OR IGNORE INTO inquiry_suppliers (id, inquiry_id, supplier_id) VALUES (?, ?, ?)');
    for (const supplierId of supplier_ids) {
      await insertSupplier.run(uuidv4(), req.params.id, supplierId);
    }
    res.json({ message: '邀请成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { title, description, deadline, status, score_items } = req.body;
    const inquiry = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ error: '询价单不存在' });
    }
    await db.prepare(\`
      UPDATE inquiries
      SET title = ?, description = ?, deadline = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    \`).run(
      title || inquiry.title,
      description !== undefined ? description : inquiry.description,
      deadline !== undefined ? deadline : inquiry.deadline,
      status || inquiry.status,
      req.params.id
    );
    if (score_items && Array.isArray(score_items)) {
      await db.prepare('DELETE FROM score_items WHERE inquiry_id = ?').run(req.params.id);
      const insertItem = db.prepare('INSERT INTO score_items (id, inquiry_id, name, weight, description) VALUES (?, ?, ?, ?, ?)');
      for (const item of score_items) {
        await insertItem.run(uuidv4(), req.params.id, item.name, item.weight, item.description || null);
      }
    }
    const updated = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
    res.json({ inquiry: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const inquiry = await db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ error: '询价单不存在' });
    }
    await db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, 'src/routes/inquiries.js'), inquiriesRoutes);
console.log('✓ routes/inquiries.js 已修复');

// 6. 修复 routes/quotes.js
const quotesRoutes = `const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  try {
    const { inquiry_id } = req.query;
    let sql = \`
      SELECT q.*, u.name as supplier_name, i.title as inquiry_title
      FROM quotes q
      LEFT JOIN users u ON q.supplier_id = u.id
      LEFT JOIN inquiries i ON q.inquiry_id = i.id
    \`;
    const params = [];
    if (inquiry_id) {
      sql += ' WHERE q.inquiry_id = ?';
      params.push(inquiry_id);
    }
    sql += ' ORDER BY q.submitted_at DESC';
    const quotes = await db.prepare(sql).all(...params);
    res.json({ quotes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authMiddleware, async function(req, res) {
  try {
    const quote = await db.prepare(\`
      SELECT q.*, u.name as supplier_name, i.title as inquiry_title
      FROM quotes q
      LEFT JOIN users u ON q.supplier_id = u.id
      LEFT JOIN inquiries i ON q.inquiry_id = i.id
      WHERE q.id = ?
    \`).get(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: '报价不存在' });
    }
    res.json({ quote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, requireRole('supplier'), async function(req, res) {
  try {
    const { inquiry_id, total_price, delivery_days, remarks } = req.body;
    if (!inquiry_id || total_price === undefined || total_price === null) {
      return res.status(400).json({ error: '询价单ID和总价不能为空' });
    }
    const invited = await db.prepare('SELECT * FROM inquiry_suppliers WHERE inquiry_id = ? AND supplier_id = ?').get(inquiry_id, req.user.id);
    if (!invited) {
      return res.status(403).json({ error: '未被邀请参与此询价' });
    }
    const existing = await db.prepare('SELECT * FROM quotes WHERE inquiry_id = ? AND supplier_id = ?').get(inquiry_id, req.user.id);
    if (existing) {
      return res.status(400).json({ error: '已提交过报价' });
    }
    const id = uuidv4();
    await db.prepare(\`
      INSERT INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks)
      VALUES (?, ?, ?, ?, ?, ?)
    \`).run(id, inquiry_id, req.user.id, total_price, delivery_days || null, remarks || null);
    const quote = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    res.status(201).json({ quote });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, requireRole('supplier'), async function(req, res) {
  try {
    const { total_price, delivery_days, remarks, status } = req.body;
    const quote = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: '报价不存在' });
    }
    if (quote.supplier_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改此报价' });
    }
    await db.prepare(\`
      UPDATE quotes
      SET total_price = ?, delivery_days = ?, remarks = ?, status = ?
      WHERE id = ?
    \`).run(
      total_price !== undefined ? total_price : quote.total_price,
      delivery_days !== undefined ? delivery_days : quote.delivery_days,
      remarks !== undefined ? remarks : quote.remarks,
      status || quote.status,
      req.params.id
    );
    const updated = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    res.json({ quote: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/status', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { status } = req.body;
    const quote = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: '报价不存在' });
    }
    if (!['valid', 'invalid'].includes(status)) {
      return res.status(400).json({ error: '状态值无效' });
    }
    await db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, req.params.id);
    const updated = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    res.json({ quote: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('supplier'), async function(req, res) {
  try {
    const quote = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: '报价不存在' });
    }
    if (quote.supplier_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除此报价' });
    }
    await db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, 'src/routes/quotes.js'), quotesRoutes);
console.log('✓ routes/quotes.js 已修复');

// 7. 修复 routes/requirements.js
const requirementsRoutes = `const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  try {
    const requirements = await db.prepare(\`
      SELECT pr.*, u.name as requester_name
      FROM purchase_requirements pr
      LEFT JOIN users u ON pr.requester_id = u.id
      ORDER BY pr.created_at DESC
    \`).all();
    res.json({ requirements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authMiddleware, async function(req, res) {
  try {
    const requirement = await db.prepare(\`
      SELECT pr.*, u.name as requester_name
      FROM purchase_requirements pr
      LEFT JOIN users u ON pr.requester_id = u.id
      WHERE pr.id = ?
    \`).get(req.params.id);
    if (!requirement) {
      return res.status(404).json({ error: '采购需求不存在' });
    }
    res.json({ requirement });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, requireRole('requester', 'buyer'), async function(req, res) {
  try {
    const { title, description, department, budget } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const id = uuidv4();
    const requesterId = req.user.id;
    await db.prepare(\`
      INSERT INTO purchase_requirements (id, title, description, department, requester_id, budget)
      VALUES (?, ?, ?, ?, ?, ?)
    \`).run(id, title, description || null, department || null, requesterId, budget || null);
    const requirement = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(id);
    res.status(201).json({ requirement });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, async function(req, res) {
  try {
    const { title, description, department, budget, status } = req.body;
    const requirement = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(req.params.id);
    if (!requirement) {
      return res.status(404).json({ error: '采购需求不存在' });
    }
    if (req.user.role !== 'buyer' && requirement.requester_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改此需求' });
    }
    await db.prepare(\`
      UPDATE purchase_requirements
      SET title = ?, description = ?, department = ?, budget = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    \`).run(
      title || requirement.title,
      description !== undefined ? description : requirement.description,
      department !== undefined ? department : requirement.department,
      budget !== undefined ? budget : requirement.budget,
      status || requirement.status,
      req.params.id
    );
    const updated = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(req.params.id);
    res.json({ requirement: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('buyer', 'requester'), async function(req, res) {
  try {
    const requirement = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(req.params.id);
    if (!requirement) {
      return res.status(404).json({ error: '采购需求不存在' });
    }
    if (req.user.role !== 'buyer' && requirement.requester_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除此需求' });
    }
    await db.prepare('DELETE FROM purchase_requirements WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, 'src/routes/requirements.js'), requirementsRoutes);
console.log('✓ routes/requirements.js 已修复');

// 8. 修复 routes/scores.js
const scoresRoutes = `const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  try {
    const { quote_id, inquiry_id } = req.query;
    let sql = \`
      SELECT s.*, si.name as score_item_name, si.weight, u.name as scorer_name
      FROM scores s
      LEFT JOIN score_items si ON s.score_item_id = si.id
      LEFT JOIN users u ON s.scorer_id = u.id
    \`;
    const params = [];
    const conditions = [];
    if (quote_id) {
      conditions.push('s.quote_id = ?');
      params.push(quote_id);
    }
    if (inquiry_id) {
      sql += ' LEFT JOIN quotes q ON s.quote_id = q.id';
      conditions.push('q.inquiry_id = ?');
      params.push(inquiry_id);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY s.created_at DESC';
    const scores = await db.prepare(sql).all(...params);
    res.json({ scores });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/batch', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { quote_id, scores } = req.body;
    if (!quote_id || !scores || !Array.isArray(scores)) {
      return res.status(400).json({ error: '参数不完整' });
    }
    const quote = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote_id);
    if (!quote) {
      return res.status(404).json({ error: '报价不存在' });
    }
    const insertScore = db.prepare(\`
      INSERT OR REPLACE INTO scores (id, quote_id, score_item_id, score, scorer_id)
      VALUES (?, ?, ?, ?, ?)
    \`);
    for (const item of scores) {
      const existing = await db.prepare('SELECT id FROM scores WHERE quote_id = ? AND score_item_id = ? AND scorer_id = ?').get(quote_id, item.score_item_id, req.user.id);
      const id = existing ? existing.id : uuidv4();
      await insertScore.run(id, quote_id, item.score_item_id, item.score, req.user.id);
    }
    res.json({ message: '评分保存成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { quote_id, score_item_id, score } = req.body;
    if (!quote_id || !score_item_id || score === undefined || score === null) {
      return res.status(400).json({ error: '参数不完整' });
    }
    const quote = await db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote_id);
    if (!quote) {
      return res.status(404).json({ error: '报价不存在' });
    }
    const scoreItem = await db.prepare('SELECT * FROM score_items WHERE id = ?').get(score_item_id);
    if (!scoreItem) {
      return res.status(404).json({ error: '评分项不存在' });
    }
    const existing = await db.prepare('SELECT id FROM scores WHERE quote_id = ? AND score_item_id = ? AND scorer_id = ?').get(quote_id, score_item_id, req.user.id);
    const id = existing ? existing.id : uuidv4();
    await db.prepare(\`
      INSERT OR REPLACE INTO scores (id, quote_id, score_item_id, score, scorer_id)
      VALUES (?, ?, ?, ?, ?)
    \`).run(id, quote_id, score_item_id, score, req.user.id);
    const savedScore = await db.prepare('SELECT * FROM scores WHERE id = ?').get(id);
    res.status(201).json({ score: savedScore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const { score } = req.body;
    const existing = await db.prepare('SELECT * FROM scores WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '评分不存在' });
    }
    if (existing.scorer_id !== req.user.id) {
      return res.status(403).json({ error: '无权限修改此评分' });
    }
    await db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(score, req.params.id);
    const updated = await db.prepare('SELECT * FROM scores WHERE id = ?').get(req.params.id);
    res.json({ score: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  try {
    const score = await db.prepare('SELECT * FROM scores WHERE id = ?').get(req.params.id);
    if (!score) {
      return res.status(404).json({ error: '评分不存在' });
    }
    if (score.scorer_id !== req.user.id) {
      return res.status(403).json({ error: '无权限删除此评分' });
    }
    await db.prepare('DELETE FROM scores WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, 'src/routes/scores.js'), scoresRoutes);
console.log('✓ routes/scores.js 已修复');

// 9. 修复 seed.js - 添加 async/await
const seedJs = `const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, initDb } = require('./db');

async function seed() {
  await initDb();
  console.log('开始创建种子数据...');

  const salt = bcrypt.genSaltSync(10);

  const users = [
    { id: uuidv4(), username: 'buyer01', password: bcrypt.hashSync('123456', salt), name: '张采购', role: 'buyer' },
    { id: uuidv4(), username: 'requester01', password: bcrypt.hashSync('123456', salt), name: '李需求', role: 'requester' },
    { id: uuidv4(), username: 'supplier01', password: bcrypt.hashSync('123456', salt), name: '供应商A', role: 'supplier' },
    { id: uuidv4(), username: 'supplier02', password: bcrypt.hashSync('123456', salt), name: '供应商B', role: 'supplier' },
    { id: uuidv4(), username: 'supplier03', password: bcrypt.hashSync('123456', salt), name: '供应商C', role: 'supplier' },
    { id: uuidv4(), username: 'approver01', password: bcrypt.hashSync('123456', salt), name: '王审批', role: 'approver' }
  ];

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)');
  for (const user of users) {
    await insertUser.run(user.id, user.username, user.password, user.name, user.role);
    console.log(\`创建用户: \${user.username} (\${user.name}) - 角色: \${user.role}\`);
  }

  const buyerId = users[0].id;
  const requesterId = users[1].id;
  const supplier1Id = users[2].id;
  const supplier2Id = users[3].id;
  const supplier3Id = users[4].id;

  const requirementId = uuidv4();
  await db.prepare(\`
    INSERT OR IGNORE INTO purchase_requirements (id, title, description, department, requester_id, status, budget)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  \`).run(requirementId, '办公电脑采购', '需要采购10台办公用笔记本电脑', '信息技术部', requesterId, 'approved', 50000);
  console.log('创建采购需求: 办公电脑采购');

  const inquiryId = uuidv4();
  await db.prepare(\`
    INSERT OR IGNORE INTO inquiries (id, requirement_id, title, description, buyer_id, status, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  \`).run(inquiryId, requirementId, '办公电脑采购询价', '采购10台笔记本电脑，配置要求：i5处理器，16G内存，512G固态硬盘', buyerId, 'published', '2024-12-31 23:59:59');
  console.log('创建询价单: 办公电脑采购询价');

  const insertInquirySupplier = db.prepare('INSERT OR IGNORE INTO inquiry_suppliers (id, inquiry_id, supplier_id) VALUES (?, ?, ?)');
  await insertInquirySupplier.run(uuidv4(), inquiryId, supplier1Id);
  await insertInquirySupplier.run(uuidv4(), inquiryId, supplier2Id);
  await insertInquirySupplier.run(uuidv4(), inquiryId, supplier3Id);
  console.log('邀请3家供应商参与询价');

  const scoreItem1Id = uuidv4();
  const scoreItem2Id = uuidv4();
  const scoreItem3Id = uuidv4();
  const insertScoreItem = db.prepare('INSERT OR IGNORE INTO score_items (id, inquiry_id, name, weight, description) VALUES (?, ?, ?, ?, ?)');
  await insertScoreItem.run(scoreItem1Id, inquiryId, '价格', 0.5, '报价价格评分，越低得分越高');
  await insertScoreItem.run(scoreItem2Id, inquiryId, '交货期', 0.3, '交货时间评分，越短得分越高');
  await insertScoreItem.run(scoreItem3Id, inquiryId, '售后服务', 0.2, '售后服务质量评分');
  console.log('创建3个评分项');

  const quote1Id = uuidv4();
  await db.prepare(\`
    INSERT OR IGNORE INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  \`).run(quote1Id, inquiryId, supplier1Id, 45000, 7, '全新正品，原厂保修3年', 'valid');
  console.log('创建供应商A报价: 45000元，7天交货');

  const quote2Id = uuidv4();
  await db.prepare(\`
    INSERT OR IGNORE INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  \`).run(quote2Id, inquiryId, supplier2Id, 48000, 5, '含上门安装调试，保修2年', 'valid');
  console.log('创建供应商B报价: 48000元，5天交货');

  console.log('');
  console.log('种子数据创建完成！');
  console.log('');
  console.log('测试账号（密码均为 123456）：');
  console.log('  采购员: buyer01 / 123456');
  console.log('  需求部门: requester01 / 123456');
  console.log('  供应商A: supplier01 / 123456');
  console.log('  供应商B: supplier02 / 123456');
  console.log('  供应商C: supplier03 / 123456');
  console.log('  审批经理: approver01 / 123456');
  console.log('');
  console.log('测试场景说明：');
  console.log('  - 已创建1个采购需求和1个询价单');
  console.log('  - 已邀请3家供应商，但只有2家提交了有效报价');
  console.log('  - 此时尝试定标会返回"有效报价少于3家，不能定标"的400错误');
  console.log('  - 可以用 supplier03 登录提交第3家报价后再进行定标测试');
}

seed();
`;
fs.writeFileSync(path.join(__dirname, 'src/seed.js'), seedJs);
console.log('✓ src/seed.js 已修复');

// 10. 修复 index.js - 添加错误处理和异步 initDb
const indexJs = `const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const app = express();
const PORT = process.env.PORT || 19109;
app.use(cors());
app.use(express.json());

async function start() {
  await initDb();
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/requirements', require('./routes/requirements'));
  app.use('/api/inquiries', require('./routes/inquiries'));
  app.use('/api/quotes', require('./routes/quotes'));
  app.use('/api/scores', require('./routes/scores'));
  app.use('/api/awards', require('./routes/awards'));
  app.get('/api/health', function(req, res) {
    res.json({ status: 'ok', message: 'OK' });
  });
  app.use(function(err, req, res, next) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
  app.listen(PORT, function() {
    console.log('Server running on port ' + PORT);
  });
}

start();
`;
fs.writeFileSync(path.join(__dirname, 'src/index.js'), indexJs);
console.log('✓ src/index.js 已修复');

console.log('');
console.log('所有文件修复完成！');
