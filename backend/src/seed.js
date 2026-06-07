const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, initDb } = require('./db');

function seed() {
  initDb();
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
    insertUser.run(user.id, user.username, user.password, user.name, user.role);
    console.log(`创建用户: ${user.username} (${user.name}) - 角色: ${user.role}`);
  }

  const buyerId = users[0].id;
  const requesterId = users[1].id;
  const supplier1Id = users[2].id;
  const supplier2Id = users[3].id;
  const supplier3Id = users[4].id;

  const requirementId = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO purchase_requirements (id, title, description, department, requester_id, status, budget)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(requirementId, '办公电脑采购', '需要采购10台办公用笔记本电脑', '信息技术部', requesterId, 'approved', 50000);
  console.log('创建采购需求: 办公电脑采购');

  const inquiryId = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO inquiries (id, requirement_id, title, description, buyer_id, status, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(inquiryId, requirementId, '办公电脑采购询价', '采购10台笔记本电脑，配置要求：i5处理器，16G内存，512G固态硬盘', buyerId, 'published', '2024-12-31 23:59:59');
  console.log('创建询价单: 办公电脑采购询价');

  const insertInquirySupplier = db.prepare('INSERT OR IGNORE INTO inquiry_suppliers (id, inquiry_id, supplier_id) VALUES (?, ?, ?)');
  insertInquirySupplier.run(uuidv4(), inquiryId, supplier1Id);
  insertInquirySupplier.run(uuidv4(), inquiryId, supplier2Id);
  insertInquirySupplier.run(uuidv4(), inquiryId, supplier3Id);
  console.log('邀请3家供应商参与询价');

  const scoreItem1Id = uuidv4();
  const scoreItem2Id = uuidv4();
  const scoreItem3Id = uuidv4();
  const insertScoreItem = db.prepare('INSERT OR IGNORE INTO score_items (id, inquiry_id, name, weight, description) VALUES (?, ?, ?, ?, ?)');
  insertScoreItem.run(scoreItem1Id, inquiryId, '价格', 0.5, '报价价格评分，越低得分越高');
  insertScoreItem.run(scoreItem2Id, inquiryId, '交货期', 0.3, '交货时间评分，越短得分越高');
  insertScoreItem.run(scoreItem3Id, inquiryId, '售后服务', 0.2, '售后服务质量评分');
  console.log('创建3个评分项');

  const quote1Id = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(quote1Id, inquiryId, supplier1Id, 45000, 7, '全新正品，原厂保修3年', 'valid');
  console.log('创建供应商A报价: 45000元，7天交货');

  const quote2Id = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO quotes (id, inquiry_id, supplier_id, total_price, delivery_days, remarks, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(quote2Id, inquiryId, supplier2Id, 48000, 5, '含上门安装调试，保修2年', 'valid');
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
