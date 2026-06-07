import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

const menuConfig = {
  buyer: [
    { path: '/requirements', title: '采购需求管理', desc: '管理采购需求，审核和发布需求' },
    { path: '/inquiries', title: '询价单管理', desc: '创建和管理询价单，邀请供应商' },
    { path: '/quotes', title: '报价管理', desc: '查看供应商报价，进行评分和定标' },
    { path: '/awards', title: '定标管理', desc: '管理定标结果，提交审批' }
  ],
  requester: [
    { path: '/requirements', title: '采购需求', desc: '提交和管理采购需求' }
  ],
  supplier: [
    { path: '/inquiries', title: '询价单', desc: '查看受邀询价单，提交报价' },
    { path: '/quotes', title: '我的报价', desc: '查看和管理已提交的报价' }
  ],
  approver: [
    { path: '/requirements', title: '需求审批', desc: '审批采购需求' },
    { path: '/awards', title: '待审批定标', desc: '审批采购定标结果' }
  ]
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const menus = menuConfig[user.role] || [];

  return (
    <div>
      <div className="header">
        <h1>采购管理系统</h1>
        <div className="user-info">
          <span>欢迎，{user.name} ({user.role})</span>
          <button onClick={logout}>退出登录</button>
        </div>
      </div>
      <div className="container">
        <h2 style={{ marginTop: '20px' }}>工作台</h2>
        <div className="dashboard-menu">
          {menus.map((menu, index) => (
            <div
              key={index}
              className="menu-card"
              onClick={() => navigate(menu.path)}
            >
              <h3>{menu.title}</h3>
              <p>{menu.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
