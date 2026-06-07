const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, function(req, res) {
  const { inquiry_id } = req.query;
  let sql = `
    SELECT q.*, u.name as supplier_name, i.title as inquiry_title
    FROM quotes q
    LEFT JOIN users u ON q.supplier_id = u.id
    LEFT JOIN inquiries i ON q.inquiry_id = i.id
  `;
  const params = [];
  if (inquiry_id) {
    sql += ' WHERE q.inquiry_id = ?';
    params.push(inquiry_id);
  }
  sql += ' ORDER BY q.submitted_at DESC';
  const quotes = db.prepare(sql).all(...params);
  res.json({ quotes });
});

router.get('/:id', authMiddleware, function(req, res) {
  const quote = db.prepare(`
    SELECT q.*, u.name as supplier_name, i.title as inquiry_title
    FROM quotes q
    LEFT JOIN users u ON q.supplier_id = u.id
    LEFT JOIN inquiries i ON q.inquiry_id = i.id
    WHERE q.id = ?
  `).get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: '报价不存在' });
  }
  res.json({ quote });
});

router.post('/', authMiddleware, requireRole('supplier'), function(req, res) {
  const { inquiry_id, total_price, delivery_days, remarks } = req.body;
  if (!inquiry_id || total_price === undefined || total_price === null) {
    return res.status(400).json({ error: '询价单ID和总价不能为空' });
  }
  const invited = db.prepare('SELECT * FROM inquiry_suppliers WHERE inquiry_id = ? AND supplier_id = ?').get(inquiry_id, req.user.id);
  if (!invited) {
    return res.status(403).json({ error: '未被邀请参与此询价' });
  }
  const existing = db.prepare('SELECT * FROM quotes WHERE inquiry_id = ? AND supplier_id = ?').get(inquiry_id, req.user.id);
  if (existing) {
    return res.status(400).json({ error: '已提交过报价' });
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, inquiry_id, req.user.id, total_price, delivery_days || null, remarks || null);
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
  res.status(201).json({ quote });
});

router.put('/:id', authMiddleware, requireRole('supplier'), function(req, res) {
  const { total_price, delivery_days, remarks, status } = req.body;
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: '报价不存在' });
  }
  if (quote.supplier_id !== req.user.id) {
    return res.status(403).json({ error: '无权限修改此报价' });
  }
  db.prepare(`
    UPDATE quotes
    SET total_price = ?, delivery_days = ?, remarks = ?, status = ?
    WHERE id = ?
  `).run(
    total_price !== undefined ? total_price : quote.total_price,
    delivery_days !== undefined ? delivery_days : quote.delivery_days,
    remarks !== undefined ? remarks : quote.remarks,
    status || quote.status,
    req.params.id
  );
  const updated = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  res.json({ quote: updated });
});

router.put('/:id/status', authMiddleware, requireRole('buyer'), function(req, res) {
  const { status } = req.body;
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: '报价不存在' });
  }
  if (!['valid', 'invalid'].includes(status)) {
    return res.status(400).json({ error: '状态值无效' });
  }
  db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, req.params.id);
  const updated = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  res.json({ quote: updated });
});

router.delete('/:id', authMiddleware, requireRole('supplier'), function(req, res) {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!quote) {
    return res.status(404).json({ error: '报价不存在' });
  }
  if (quote.supplier_id !== req.user.id) {
    return res.status(403).json({ error: '无权限删除此报价' });
  }
  db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
