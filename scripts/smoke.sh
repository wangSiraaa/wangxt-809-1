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
