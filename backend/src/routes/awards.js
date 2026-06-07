const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, function(req, res) {
  const awards = db.prepare(`
    SELECT a.*, q.supplier_id, q.total_price, u.name as winning_supplier_name,
           i.title as inquiry_title, u2.name as created_by_name
    FROM award_results a
    LEFT JOIN quotes q ON a.winning_quote_id = q.id
    LEFT JOIN users u ON q.supplier_id = u.id
    LEFT JOIN inquiries i ON a.inquiry_id = i.id
    LEFT JOIN users u2 ON a.created_by = u2.id
    ORDER BY a.created_at DESC
  `).all();
  res.json({ awards });
});

router.get('/:id', authMiddleware, function(req, res) {
  const award = db.prepare(`
    SELECT a.*, q.supplier_id, q.total_price, q.delivery_days, q.remarks as quote_remarks,
           u.name as winning_supplier_name, i.title as inquiry_title, i.description as inquiry_description,
           u2.name as created_by_name
    FROM award_results a
    LEFT JOIN quotes q ON a.winning_quote_id = q.id
    LEFT JOIN users u ON q.supplier_id = u.id
    LEFT JOIN inquiries i ON a.inquiry_id = i.id
    LEFT JOIN users u2 ON a.created_by = u2.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!award) {
    return res.status(404).json({ error: '定标结果不存在' });
  }
  res.json({ award });
});

router.post('/', authMiddleware, requireRole('buyer'), function(req, res) {
  const { inquiry_id, winning_quote_id, final_price, remarks } = req.body;
  if (!inquiry_id || !winning_quote_id || final_price === undefined || final_price === null) {
    return res.status(400).json({ error: '参数不完整' });
  }
  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inquiry_id);
  if (!inquiry) {
    return res.status(404).json({ error: '询价单不存在' });
  }
  const validQuotes = db.prepare(`
    SELECT COUNT(*) as count
    FROM quotes
    WHERE inquiry_id = ? AND status = 'valid'
  `).get(inquiry_id);
  if (validQuotes.count < 3) {
    return res.status(400).json({ error: '有效报价少于3家，不能定标' });
  }
  const winningQuote = db.prepare('SELECT * FROM quotes WHERE id = ? AND inquiry_id = ?').get(winning_quote_id, inquiry_id);
  if (!winningQuote) {
    return res.status(404).json({ error: '中选报价不存在' });
  }
  if (winningQuote.status !== 'valid') {
    return res.status(400).json({ error: '中选报价无效' });
  }
  const existing = db.prepare('SELECT * FROM award_results WHERE inquiry_id = ?').get(inquiry_id);
  if (existing) {
    return res.status(400).json({ error: '此询价单已存在定标结果' });
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO award_results (id, inquiry_id, winning_quote_id, final_price, remarks, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, inquiry_id, winning_quote_id, final_price, remarks || null, req.user.id);
  const award = db.prepare('SELECT * FROM award_results WHERE id = ?').get(id);
  res.status(201).json({ award });
});

router.put('/:id', authMiddleware, requireRole('buyer', 'approver'), function(req, res) {
  const { final_price, remarks, status } = req.body;
  const award = db.prepare('SELECT * FROM award_results WHERE id = ?').get(req.params.id);
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
    db.prepare(`
      UPDATE award_results
      SET final_price = ?, remarks = ?, status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(updateData.final_price, updateData.remarks, updateData.status, req.user.id, req.params.id);
  } else {
    db.prepare(`
      UPDATE award_results
      SET final_price = ?, remarks = ?, status = ?
      WHERE id = ?
    `).run(updateData.final_price, updateData.remarks, updateData.status, req.params.id);
  }
  const updated = db.prepare('SELECT * FROM award_results WHERE id = ?').get(req.params.id);
  res.json({ award: updated });
});

router.delete('/:id', authMiddleware, requireRole('buyer'), function(req, res) {
  const award = db.prepare('SELECT * FROM award_results WHERE id = ?').get(req.params.id);
  if (!award) {
    return res.status(404).json({ error: '定标结果不存在' });
  }
  if (award.created_by !== req.user.id) {
    return res.status(403).json({ error: '无权限删除此定标结果' });
  }
  db.prepare('DELETE FROM award_results WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
