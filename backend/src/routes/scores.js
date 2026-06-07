const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, function(req, res) {
  const { quote_id, inquiry_id } = req.query;
  let sql = `
    SELECT s.*, si.name as score_item_name, si.weight, u.name as scorer_name
    FROM scores s
    LEFT JOIN score_items si ON s.score_item_id = si.id
    LEFT JOIN users u ON s.scorer_id = u.id
  `;
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
  const scores = db.prepare(sql).all(...params);
  res.json({ scores });
});

router.post('/batch', authMiddleware, requireRole('buyer'), function(req, res) {
  const { quote_id, scores } = req.body;
  if (!quote_id || !scores || !Array.isArray(scores)) {
    return res.status(400).json({ error: '参数不完整' });
  }
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote_id);
  if (!quote) {
    return res.status(404).json({ error: '报价不存在' });
  }
  const insertScore = db.prepare(`
    INSERT OR REPLACE INTO scores (id, quote_id, score_item_id, score, scorer_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const item of scores) {
    const existing = db.prepare('SELECT id FROM scores WHERE quote_id = ? AND score_item_id = ? AND scorer_id = ?').get(quote_id, item.score_item_id, req.user.id);
    const id = existing ? existing.id : uuidv4();
    insertScore.run(id, quote_id, item.score_item_id, item.score, req.user.id);
  }
  res.json({ message: '评分保存成功' });
});

router.post('/', authMiddleware, requireRole('buyer'), function(req, res) {
  const { quote_id, score_item_id, score } = req.body;
  if (!quote_id || !score_item_id || score === undefined || score === null) {
    return res.status(400).json({ error: '参数不完整' });
  }
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quote_id);
  if (!quote) {
    return res.status(404).json({ error: '报价不存在' });
  }
  const scoreItem = db.prepare('SELECT * FROM score_items WHERE id = ?').get(score_item_id);
  if (!scoreItem) {
    return res.status(404).json({ error: '评分项不存在' });
  }
  const existing = db.prepare('SELECT id FROM scores WHERE quote_id = ? AND score_item_id = ? AND scorer_id = ?').get(quote_id, score_item_id, req.user.id);
  const id = existing ? existing.id : uuidv4();
  db.prepare(`
    INSERT OR REPLACE INTO scores (id, quote_id, score_item_id, score, scorer_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, quote_id, score_item_id, score, req.user.id);
  const savedScore = db.prepare('SELECT * FROM scores WHERE id = ?').get(id);
  res.status(201).json({ score: savedScore });
});

router.put('/:id', authMiddleware, requireRole('buyer'), function(req, res) {
  const { score } = req.body;
  const existing = db.prepare('SELECT * FROM scores WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: '评分不存在' });
  }
  if (existing.scorer_id !== req.user.id) {
    return res.status(403).json({ error: '无权限修改此评分' });
  }
  db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(score, req.params.id);
  const updated = db.prepare('SELECT * FROM scores WHERE id = ?').get(req.params.id);
  res.json({ score: updated });
});

router.delete('/:id', authMiddleware, requireRole('buyer'), function(req, res) {
  const score = db.prepare('SELECT * FROM scores WHERE id = ?').get(req.params.id);
  if (!score) {
    return res.status(404).json({ error: '评分不存在' });
  }
  if (score.scorer_id !== req.user.id) {
    return res.status(403).json({ error: '无权限删除此评分' });
  }
  db.prepare('DELETE FROM scores WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
