import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Supplementary() {
  const { user, apiCall } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [formData, setFormData] = useState({
    inquiry_id: '',
    reason: '',
    supplement_data: ''
  });

  useEffect(() => {
    loadApplications();
    loadInquiries();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    const { data } = await apiCall('/api/supplementary');
    if (data.applications) {
      setApplications(data.applications);
    }
    setLoading(false);
  };

  const loadInquiries = async () => {
    const { data } = await apiCall('/api/inquiries');
    if (data.inquiries) {
      setInquiries(data.inquiries);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const supplementData = formData.supplement_data
      ? JSON.parse(formData.supplement_data)
      : null;
    
    const { data } = await apiCall('/api/supplementary', {
      method: 'POST',
      body: JSON.stringify({
        inquiry_id: formData.inquiry_id,
        reason: formData.reason,
        supplement_data: supplementData
      })
    });
    
    if (data.application) {
      setShowCreateModal(false);
      setFormData({ inquiry_id: '', reason: '', supplement_data: '' });
      loadApplications();
    }
  };

  const handleApprove = async (id) => {
    const remarks = prompt('请输入审批意见（可选）:');
    const { data } = await apiCall(`/api/supplementary/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approval_remarks: remarks })
    });
    if (data.application) {
      loadApplications();
      setSelectedApp(null);
    }
  };

  const handleReject = async (id) => {
    const remarks = prompt('请输入驳回原因（必填）:');
    if (!remarks) {
      alert('驳回原因不能为空');
      return;
    }
    const { data } = await apiCall(`/api/supplementary/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ approval_remarks: remarks })
    });
    if (data.application) {
      loadApplications();
      setSelectedApp(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定要删除此补录申请吗？')) return;
    await apiCall(`/api/supplementary/${id}`, { method: 'DELETE' });
    loadApplications();
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'background: #fef3c7; color: #92400e;',
      approved: 'background: #d1fae5; color: #065f46;',
      rejected: 'background: #fee2e2; color: #991b1b;'
    };
    const labels = {
      pending: '待审批',
      approved: '已通过',
      rejected: '已驳回'
    };
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        ...styles[status]
      }}>
        {labels[status]}
      </span>
    );
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>加载中...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>补录申请管理</h2>
        {user.role === 'buyer' && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '10px 20px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            新建补录申请
          </button>
        )}
      </div>

      {applications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          暂无补录申请
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>询价单</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>申请人</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>补录原因</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>状态</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>创建时间</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px' }}>{app.inquiry_title}</td>
                  <td style={{ padding: '12px 16px' }}>{app.applicant_name}</td>
                  <td style={{ padding: '12px 16px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.reason}</td>
                  <td style={{ padding: '12px 16px' }}>{getStatusBadge(app.status)}</td>
                  <td style={{ padding: '12px 16px' }}>{new Date(app.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => setSelectedApp(app)}
                      style={{ marginRight: '8px', padding: '4px 8px', border: '1px solid #d1d5db', background: 'white', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      详情
                    </button>
                    {user.role === 'approver' && app.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(app.id)}
                          style={{ marginRight: '8px', padding: '4px 8px', border: 'none', background: '#059669', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          通过
                        </button>
                        <button
                          onClick={() => handleReject(app.id)}
                          style={{ padding: '4px 8px', border: 'none', background: '#dc2626', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          驳回
                        </button>
                      </>
                    )}
                    {user.role === 'buyer' && app.status === 'pending' && (
                      <button
                        onClick={() => handleDelete(app.id)}
                        style={{ padding: '4px 8px', border: '1px solid #fca5a5', color: '#dc2626', background: 'white', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '500px', maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>新建补录申请</h3>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>选择询价单</label>
                <select
                  value={formData.inquiry_id}
                  onChange={(e) => setFormData({ ...formData, inquiry_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  required
                >
                  <option value="">请选择询价单</option>
                  {inquiries.map((inq) => (
                    <option key={inq.id} value={inq.id}>{inq.title}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>补录原因</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '80px' }}
                  required
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>补录数据（JSON格式，可选）</label>
                <textarea
                  value={formData.supplement_data}
                  onChange={(e) => setFormData({ ...formData, supplement_data: e.target.value })}
                  placeholder='{"quotes": [{"supplier_id": "xxx", "total_price": 1000}]}'
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', minHeight: '100px', fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 16px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 16px', border: 'none', background: '#2563eb', color: 'white', borderRadius: '6px', cursor: 'pointer' }}
                >
                  提交
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedApp && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '8px', width: '600px', maxWidth: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>补录申请详情</h3>
            <div style={{ marginBottom: '12px' }}>
              <strong>询价单：</strong>{selectedApp.inquiry_title}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>申请人：</strong>{selectedApp.applicant_name}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>状态：</strong>{getStatusBadge(selectedApp.status)}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>补录原因：</strong>
              <p style={{ marginTop: '6px', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>{selectedApp.reason}</p>
            </div>
            {selectedApp.approver_name && (
              <div style={{ marginBottom: '12px' }}>
                <strong>审批人：</strong>{selectedApp.approver_name}
              </div>
            )}
            {selectedApp.approval_remarks && (
              <div style={{ marginBottom: '12px' }}>
                <strong>审批意见：</strong>
                <p style={{ marginTop: '6px', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>{selectedApp.approval_remarks}</p>
              </div>
            )}
            {selectedApp.supplement_data && (
              <div style={{ marginBottom: '12px' }}>
                <strong>补录数据：</strong>
                <pre style={{ marginTop: '6px', padding: '12px', background: '#f9fafb', borderRadius: '6px', overflow: 'auto', fontSize: '12px' }}>
                  {JSON.stringify(selectedApp.supplement_data, null, 2)}
                </pre>
              </div>
            )}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedApp(null)}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer' }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
