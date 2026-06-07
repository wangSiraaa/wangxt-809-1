const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  const requirements = db.prepare(`
    SELECT pr.*, u.name as requester_name
    FROM purchase_requirements pr
    LEFT JOIN users u ON pr.requester_id = u.id
    ORDER BY pr.created_at DESC
  `).all();
  res.json({ requirements });
});

router.get('/:id', authMiddleware, async function(req, res) {
  const requirement = db.prepare(`
    SELECT pr.*, u.name as requester_name
    FROM purchase_requirements pr
    LEFT JOIN users u ON pr.requester_id = u.id
    WHERE pr.id = ?
  `).get(req.params.id);
  if (!requirement) {
    return res.status(404).json({ error: '采购需求不存在' });
  }
  res.json({ requirement });
});

router.post('/', authMiddleware, requireRole('requester', 'buyer'), async function(req, res) {
  const { title, description, department, budget } = req.body;
  if (!title) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  const id = uuidv4();
  const requesterId = req.user.id;
  await db.prepare(`
    INSERT INTO purchase_requirements (id, title, description, department, requester_id, budget)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title, description || null, department || null, requesterId, budget || null);
  const requirement = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(id);
  res.status(201).json({ requirement });
});

router.put('/:id', authMiddleware, async function(req, res) {
  const { title, description, department, budget, status } = req.body;
  const requirement = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(req.params.id);
  if (!requirement) {
    return res.status(404).json({ error: '采购需求不存在' });
  }
  if (req.user.role !== 'buyer' && requirement.requester_id !== req.user.id) {
    return res.status(403).json({ error: '无权限修改此需求' });
  }
  await db.prepare(`
    UPDATE purchase_requirements
    SET title = ?, description = ?, department = ?, budget = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || requirement.title,
    description !== undefined ? description : requirement.description,
    department !== undefined ? department : requirement.department,
    budget !== undefined ? budget : requirement.budget,
    status || requirement.status,
    req.params.id
  );
  const updated = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(req.params.id);
  res.json({ requirement: updated });
});

router.delete('/:id', authMiddleware, requireRole('buyer', 'requester'), async function(req, res) {
  const requirement = await db.prepare('SELECT * FROM purchase_requirements WHERE id = ?').get(req.params.id);
  if (!requirement) {
    return res.status(404).json({ error: '采购需求不存在' });
  }
  if (req.user.role !== 'buyer' && requirement.requester_id !== req.user.id) {
    return res.status(403).json({ error: '无权限删除此需求' });
  }
  await db.prepare('DELETE FROM purchase_requirements WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
