#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

API_PORT=${API_PORT:-19109}
BASE_URL="http://localhost:${API_PORT}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

pass_test() {
  echo -e "${GREEN}[PASS]${NC} $1"
  PASSED=$((PASSED + 1))
}

fail_test() {
  echo -e "${RED}[FAIL]${NC} $1"
  FAILED=$((FAILED + 1))
}

info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

echo "========================================"
echo "  采购寻源系统冒烟测试"
echo "========================================"
echo ""

info "1. 健康检查..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/health" || echo "000")
if [ "$HEALTH_RESPONSE" = "200" ]; then
  pass_test "健康检查接口正常 (HTTP 200)"
else
  fail_test "健康检查接口失败 (HTTP $HEALTH_RESPONSE)"
fi

echo ""
info "2. 登录 buyer01/123456 获取 token..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"buyer01","password":"123456"}' || echo "000")
LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | tail -n1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$LOGIN_STATUS" = "200" ]; then
  pass_test "登录接口正常 (HTTP 200)"
  TOKEN=$(echo "$LOGIN_BODY" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -n "$TOKEN" ]; then
    pass_test "成功获取登录 Token"
  else
    fail_test "未获取到登录 Token"
  fi
else
  fail_test "登录接口失败 (HTTP $LOGIN_STATUS)"
  TOKEN=""
fi

echo ""
info "3. 获取询价单列表，解析第一个询价单的 id..."
INQUIRY_ID=""
if [ -n "$TOKEN" ]; then
  INQUIRY_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/inquiries" \
    -H "Authorization: Bearer ${TOKEN}" || echo "000")
  INQUIRY_STATUS=$(echo "$INQUIRY_RESPONSE" | tail -n1)
  INQUIRY_BODY=$(echo "$INQUIRY_RESPONSE" | sed '$d')
  if [ "$INQUIRY_STATUS" = "200" ]; then
    pass_test "获取询价单列表正常 (HTTP 200)"
    INQUIRY_ID=$(echo "$INQUIRY_BODY" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
    if [ -n "$INQUIRY_ID" ]; then
      pass_test "成功解析第一个询价单 ID: ${INQUIRY_ID}"
    else
      fail_test "未解析到询价单 ID"
    fi
  else
    fail_test "获取询价单列表失败 (HTTP $INQUIRY_STATUS)"
  fi
else
  fail_test "跳过询价单测试（无有效 Token）"
fi

echo ""
info "4. 尝试定标（传 inquiry_id 和任意的 winning_quote_id、final_price）..."
if [ -n "$TOKEN" ] && [ -n "$INQUIRY_ID" ]; then
  AWARD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/awards" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"inquiry_id\":\"${INQUIRY_ID}\",\"winning_quote_id\":\"fake-quote-id\",\"final_price\":1000}" || echo "000")
  AWARD_STATUS=$(echo "$AWARD_RESPONSE" | tail -n1)
  AWARD_BODY=$(echo "$AWARD_RESPONSE" | sed '$d')
  if [ "$AWARD_STATUS" = "400" ]; then
    pass_test "定标正确返回 400 错误"
    if echo "$AWARD_BODY" | grep -q "有效报价少于3家，不能定标"; then
      pass_test "错误信息正确：'有效报价少于3家，不能定标'"
    else
      fail_test "错误信息不正确，实际返回：${AWARD_BODY}"
    fi
  else
    fail_test "期望返回 400，实际返回 $AWARD_STATUS"
  fi
else
  fail_test "跳过定标测试（无有效 Token 或询价单 ID）"
fi


echo ""
info "5. 采购员创建补录申请..."
SUPP_APP_ID=""
if [ -n "$TOKEN" ] && [ -n "$INQUIRY_ID" ]; then
  SUPP_CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/supplementary" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"inquiry_id\":\"${INQUIRY_ID}\",\"reason\":\"供应商通过邮件发送报价，需补录系统\"}" || echo "000")
  SUPP_CREATE_STATUS=$(echo "$SUPP_CREATE_RESPONSE" | tail -n1)
  SUPP_CREATE_BODY=$(echo "$SUPP_CREATE_RESPONSE" | sed '$d')
  if [ "$SUPP_CREATE_STATUS" = "201" ]; then
    pass_test "创建补录申请成功 (HTTP 201)"
    SUPP_APP_ID=$(echo "$SUPP_CREATE_BODY" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
    if [ -n "$SUPP_APP_ID" ]; then
      pass_test "成功解析补录申请 ID: ${SUPP_APP_ID}"
    else
      fail_test "未解析到补录申请 ID"
    fi
  else
    fail_test "创建补录申请失败 (HTTP $SUPP_CREATE_STATUS) - $SUPP_CREATE_BODY"
  fi
else
  fail_test "跳过创建补录申请测试（无有效 Token 或询价单 ID）"
fi

echo ""
info "6. 登录审批经理获取 token..."
APPROVER_TOKEN=""
APPROVER_LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"approver01","password":"123456"}' || echo "000")
APPROVER_LOGIN_STATUS=$(echo "$APPROVER_LOGIN_RESPONSE" | tail -n1)
APPROVER_LOGIN_BODY=$(echo "$APPROVER_LOGIN_RESPONSE" | sed '$d')
if [ "$APPROVER_LOGIN_STATUS" = "200" ]; then
  pass_test "审批经理登录成功 (HTTP 200)"
  APPROVER_TOKEN=$(echo "$APPROVER_LOGIN_BODY" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
else
  fail_test "审批经理登录失败 (HTTP $APPROVER_LOGIN_STATUS)"
fi

echo ""
info "7. 审批经理审批通过补录申请..."
if [ -n "$APPROVER_TOKEN" ] && [ -n "$SUPP_APP_ID" ]; then
  APPROVE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/supplementary/${SUPP_APP_ID}/approve" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${APPROVER_TOKEN}" \
    -d '{"approval_remarks":"数据核实无误，同意补录"}' || echo "000")
  APPROVE_STATUS=$(echo "$APPROVE_RESPONSE" | tail -n1)
  APPROVE_BODY=$(echo "$APPROVE_RESPONSE" | sed '$d')
  if [ "$APPROVE_STATUS" = "200" ]; then
    pass_test "审批通过补录申请成功 (HTTP 200)"
    if echo "$APPROVE_BODY" | grep -q '"status":"approved"'; then
      pass_test "审批状态正确更新为 approved"
    else
      fail_test "审批状态未正确更新，实际返回：${APPROVE_BODY}"
    fi
  else
    fail_test "审批通过补录申请失败 (HTTP $APPROVE_STATUS) - $APPROVE_BODY"
  fi
else
  fail_test "跳过审批通过测试（无有效审批经理 Token 或补录申请 ID）"
fi

echo ""
info "8. 采购员创建另一条补录申请用于测试驳回..."
SUPP_APP2_ID=""
if [ -n "$TOKEN" ] && [ -n "$INQUIRY_ID" ]; then
  SUPP_CREATE2_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/supplementary" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"inquiry_id\":\"${INQUIRY_ID}\",\"reason\":\"线下议价结果补录\"}" || echo "000")
  SUPP_CREATE2_STATUS=$(echo "$SUPP_CREATE2_RESPONSE" | tail -n1)
  SUPP_CREATE2_BODY=$(echo "$SUPP_CREATE2_RESPONSE" | sed '$d')
  if [ "$SUPP_CREATE2_STATUS" = "201" ]; then
    pass_test "创建第二条补录申请成功 (HTTP 201)"
    SUPP_APP2_ID=$(echo "$SUPP_CREATE2_BODY" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  else
    fail_test "创建第二条补录申请失败 (HTTP $SUPP_CREATE2_STATUS)"
  fi
else
  fail_test "跳过创建第二条补录申请测试"
fi

echo ""
info "9. 审批经理驳回补录申请..."
if [ -n "$APPROVER_TOKEN" ] && [ -n "$SUPP_APP2_ID" ]; then
  REJECT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/supplementary/${SUPP_APP2_ID}/reject" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${APPROVER_TOKEN}" \
    -d '{"approval_remarks":"补录数据不完整，缺少供应商资质证明，请补充后重新提交"}' || echo "000")
  REJECT_STATUS=$(echo "$REJECT_RESPONSE" | tail -n1)
  REJECT_BODY=$(echo "$REJECT_RESPONSE" | sed '$d')
  if [ "$REJECT_STATUS" = "200" ]; then
    pass_test "驳回补录申请成功 (HTTP 200)"
    if echo "$REJECT_BODY" | grep -q '"status":"rejected"'; then
      pass_test "审批状态正确更新为 rejected"
    else
      fail_test "审批状态未正确更新，实际返回：${REJECT_BODY}"
    fi
  else
    fail_test "驳回补录申请失败 (HTTP $REJECT_STATUS) - $REJECT_BODY"
  fi
else
  fail_test "跳过驳回测试（无有效审批经理 Token 或补录申请 ID）"
fi

echo ""
info "10. 验证供应商角色无权限访问补录申请..."
SUPPLIER_TOKEN=""
SUPPLIER_LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"supplier01","password":"123456"}' || echo "000")
SUPPLIER_LOGIN_STATUS=$(echo "$SUPPLIER_LOGIN_RESPONSE" | tail -n1)
if [ "$SUPPLIER_LOGIN_STATUS" = "200" ]; then
  SUPPLIER_TOKEN=$(echo "$SUPPLIER_LOGIN_RESPONSE" | sed '$d' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  SUPPLIER_ACCESS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/supplementary" \
    -H "Authorization: Bearer ${SUPPLIER_TOKEN}" || echo "000")
  SUPPLIER_ACCESS_STATUS=$(echo "$SUPPLIER_ACCESS_RESPONSE" | tail -n1)
  if [ "$SUPPLIER_ACCESS_STATUS" = "403" ]; then
    pass_test "供应商角色正确被拒绝访问补录申请 (HTTP 403)"
  else
    fail_test "供应商角色应被拒绝访问，实际返回 HTTP $SUPPLIER_ACCESS_STATUS"
  fi
else
  fail_test "供应商登录失败，跳过权限测试"
fi
echo ""
echo "========================================"
echo "  测试结果汇总"
echo "========================================"
echo -e "通过: ${GREEN}${PASSED}${NC}"
echo -e "失败: ${RED}${FAILED}${NC}"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}冒烟测试未通过！${NC}"
  exit 1
else
  echo -e "${GREEN}冒烟测试全部通过！${NC}"
  exit 0
fi
