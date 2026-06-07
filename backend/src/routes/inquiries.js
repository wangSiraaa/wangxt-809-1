const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, function(req, res) {
  const inquiries = db.prepare(`
    SELECT i.*, pr.title as requirement_title, u.name as buyer_name
    FROM inquiries i
    LEFT JOIN purchase_requirements pr ON i.requirement_id = pr.id
    LEFT JOIN users u ON i.buyer_id = u.id
    ORDER BY i.created_at DESC
  `).all();
  res.json({ inquiries });
});

router.get('/:id', authMiddleware, function(req, res) {
  const inquiry = db.prepare(`
    SELECT i.*, pr.title as requirement_title, u.name as buyer_name
    FROM inquiries i
    LEFT JOIN purchase_requirements pr ON i.requirement_id = pr.id
    LEFT JOIN users u ON i.buyer_id = u.id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ error: '询价单不存在' });
  }
  const suppliers = db.prepare(`
    SELECT s.*, isu.invited_at
    FROM inquiry_suppliers isu
    LEFT JOIN users s ON isu.supplier_id = s.id
    WHERE isu.inquiry_id = ?
  `).all(req.params.id);
  const scoreItems = db.prepare('SELECT * FROM score_items WHERE inquiry_id = ?').all(req.params.id);
  res.json({ inquiry, suppliers, scoreItems });
});

router.post('/', authMiddleware, requireRole('buyer'), function(req, res) {
  const { requirement_id, title, description, deadline, score_items } = req.body;
  if (!requirement_id || !title) {
    return res.status(400).json({ error: '需求ID和标题不能为空' });
  }
  const id = uuidv4();
  const buyerId = req.user.id;
  db.prepare(`
    INSERT INTO inquiries (id, requirement_id, title, description, buyer_id, deadline)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, requirement_id, title, description || null, buyerId, deadline || null);
  if (score_items && Array.isArray(score_items)) {
    const insertItem = db.prepare('INSERT INTO score_items (id, inquiry_id, name, weight, description) VALUES (?, ?, ?, ?, ?)');
    for (const item of score_items) {
      insertItem.run(uuidv4(), id, item.name, item.weight, item.description || null);
    }
  }
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(id);
  res.status(201).json({ inquiry });
});

router.post('/:id/invite', authMiddleware, requireRole('buyer'), function(req, res) {
  const { supplier_ids } = req.body;
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ error: '询价单不存在' });
  }
  if (!supplier_ids || !Array.isArray(supplier_ids)) {
    return res.status(400).json({ error: '供应商ID列表不能为空' });
  }
  const insertSupplier = db.prepare('INSERT OR IGNORE INTO inquiry_suppliers (id, inquiry_id, supplier_id) VALUES (?, ?, ?)');
  for (const supplierId of supplier_ids) {
    insertSupplier.run(uuidv4(), req.params.id, supplierId);
  }
  res.json({ message: '邀请成功' });
});

router.put('/:id', authMiddleware, requireRole('buyer'), function(req, res) {
  const { title, description, deadline, status, score_items } = req.body;
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ error: '询价单不存在' });
  }
  db.prepare(`
    UPDATE inquiries
    SET title = ?, description = ?, deadline = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || inquiry.title,
    description !== undefined ? description : inquiry.description,
    deadline !== undefined ? deadline : inquiry.deadline,
    status || inquiry.status,
    req.params.id
  );
  if (score_items && Array.isArray(score_items)) {
    db.prepare('DELETE FROM score_items WHERE inquiry_id = ?').run(req.params.id);
    const insertItem = db.prepare('INSERT INTO score_items (id, inquiry_id, name, weight, description) VALUES (?, ?, ?, ?, ?)');
    for (const item of score_items) {
      insertItem.run(uuidv4(), req.params.id, item.name, item.weight, item.description || null);
    }
  }
  const updated = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  res.json({ inquiry: updated });
});

router.delete('/:id', authMiddleware, requireRole('buyer'), function(req, res) {
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ error: '询价单不存在' });
  }
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
