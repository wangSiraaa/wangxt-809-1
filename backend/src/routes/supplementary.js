const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async function(req, res) {
  const { status, inquiry_id } = req.query;
  
  let sql = "SELECT sa.*, i.title as inquiry_title, u.name as applicant_name, a.name as approver_name FROM supplementary_applications sa LEFT JOIN inquiries i ON sa.inquiry_id = i.id LEFT JOIN users u ON sa.applicant_id = u.id LEFT JOIN users a ON sa.approver_id = a.id WHERE 1=1";
  const params = [];
  
  if (status) {
    sql += " AND sa.status = ?";
    params.push(status);
  }
  
  if (inquiry_id) {
    sql += " AND sa.inquiry_id = ?";
    params.push(inquiry_id);
  }
  
  if (req.user.role === 'buyer') {
    sql += " AND sa.applicant_id = ?";
    params.push(req.user.id);
  } else if (req.user.role === 'approver') {
  } else if (req.user.role === 'requester') {
    sql += " AND i.buyer_id IN (SELECT id FROM users WHERE role = ?)";
    params.push('buyer');
  } else {
    return res.status(403).json({ error: '权限不足' });
  }
  
  sql += " ORDER BY sa.created_at DESC";
  
  const applications = await db.prepare(sql).all(...params);
  res.json({ applications });
});

router.get('/:id', authMiddleware, async function(req, res) {
  const application = await db.prepare("SELECT sa.*, i.title as inquiry_title, i.description as inquiry_description, pr.title as requirement_title, u.name as applicant_name, a.name as approver_name FROM supplementary_applications sa LEFT JOIN inquiries i ON sa.inquiry_id = i.id LEFT JOIN purchase_requirements pr ON i.requirement_id = pr.id LEFT JOIN users u ON sa.applicant_id = u.id LEFT JOIN users a ON sa.approver_id = a.id WHERE sa.id = ?").get(req.params.id);
  
  if (!application) {
    return res.status(404).json({ error: '补录申请不存在' });
  }
  
  if (req.user.role === 'buyer' && application.applicant_id !== req.user.id) {
    return res.status(403).json({ error: '无权限查看此申请' });
  }
  
  if (application.supplement_data) {
    try {
      application.supplement_data = JSON.parse(application.supplement_data);
    } catch (e) {
    }
  }
  
  res.json({ application });
});

router.post('/', authMiddleware, requireRole('buyer'), async function(req, res) {
  const { inquiry_id, reason, supplement_data } = req.body;
  
  if (!inquiry_id || !reason) {
    return res.status(400).json({ error: '询价单ID和补录原因不能为空' });
  }
  
  const inquiry = await db.prepare("SELECT * FROM inquiries WHERE id = ?").get(inquiry_id);
  if (!inquiry) {
    return res.status(404).json({ error: '询价单不存在' });
  }
  
  const id = uuidv4();
  const applicantId = req.user.id;
  
  const supplementDataStr = supplement_data ? JSON.stringify(supplement_data) : null;
  
  await db.prepare("INSERT INTO supplementary_applications (id, inquiry_id, applicant_id, reason, supplement_data, status) VALUES (?, ?, ?, ?, ?, 'pending')").run(id, inquiry_id, applicantId, reason, supplementDataStr);
  
  const application = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(id);
  res.status(201).json({ application });
});

router.put('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  const { reason, supplement_data, status } = req.body;
  
  const application = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  if (!application) {
    return res.status(404).json({ error: '补录申请不存在' });
  }
  
  if (application.applicant_id !== req.user.id) {
    return res.status(403).json({ error: '无权限修改此申请' });
  }
  
  if (application.status !== 'pending') {
    return res.status(400).json({ error: '只能修改待审批状态的申请' });
  }
  
  const supplementDataStr = supplement_data !== undefined ? JSON.stringify(supplement_data) : application.supplement_data;
  
  await db.prepare("UPDATE supplementary_applications SET reason = ?, supplement_data = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    reason || application.reason,
    supplementDataStr,
    status || application.status,
    req.params.id
  );
  
  const updated = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  res.json({ application: updated });
});

router.post('/:id/approve', authMiddleware, requireRole('approver'), async function(req, res) {
  const { approval_remarks } = req.body;
  
  const application = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  if (!application) {
    return res.status(404).json({ error: '补录申请不存在' });
  }
  
  if (application.status !== 'pending') {
    return res.status(400).json({ error: '只能审批待审批状态的申请' });
  }
  
  await db.prepare("UPDATE supplementary_applications SET status = 'approved', approver_id = ?, approval_remarks = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.user.id, approval_remarks || null, req.params.id);
  
  if (application.supplement_data) {
    try {
      const data = JSON.parse(application.supplement_data);
      if (data.quotes && Array.isArray(data.quotes)) {
        const insertQuote = db.prepare("INSERT OR IGNORE INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
        for (const quote of data.quotes) {
          if (quote.supplier_id && quote.total_price != null) {
            await insertQuote.run(uuidv4(), application.inquiry_id, quote.supplier_id, quote.total_price, quote.delivery_days || null, quote.remarks || null, 'valid');
          }
        }
      }
    } catch (e) {
      console.error('处理补录数据失败:', e);
    }
  }
  
  const updated = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  res.json({ application: updated, message: '审批通过' });
});

router.post('/:id/reject', authMiddleware, requireRole('approver'), async function(req, res) {
  const { approval_remarks } = req.body;
  
  if (!approval_remarks) {
    return res.status(400).json({ error: '驳回原因不能为空' });
  }
  
  const application = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  if (!application) {
    return res.status(404).json({ error: '补录申请不存在' });
  }
  
  if (application.status !== 'pending') {
    return res.status(400).json({ error: '只能审批待审批状态的申请' });
  }
  
  await db.prepare("UPDATE supplementary_applications SET status = 'rejected', approver_id = ?, approval_remarks = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.user.id, approval_remarks, req.params.id);
  
  const updated = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  res.json({ application: updated, message: '已驳回' });
});

router.delete('/:id', authMiddleware, requireRole('buyer'), async function(req, res) {
  const application = await db.prepare("SELECT * FROM supplementary_applications WHERE id = ?").get(req.params.id);
  if (!application) {
    return res.status(404).json({ error: '补录申请不存在' });
  }
  
  if (application.applicant_id !== req.user.id) {
    return res.status(403).json({ error: '无权限删除此申请' });
  }
  
  if (application.status !== 'pending') {
    return res.status(400).json({ error: '只能删除待审批状态的申请' });
  }
  
  await db.prepare("DELETE FROM supplementary_applications WHERE id = ?").run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
