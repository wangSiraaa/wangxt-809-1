#!/usr/bin/env python3
import urllib.request
import urllib.error
import json
import sys
import os

API_PORT = os.environ.get('API_PORT', '19109')
BASE_URL = f'http://localhost:{API_PORT}'

GREEN = '\033[0;32m'
RED = '\033[0;31m'
YELLOW = '\033[1;33m'
NC = '\033[0m'

passed = 0
failed = 0

def pass_test(msg):
    global passed
    print(f'{GREEN}[PASS]{NC} {msg}')
    passed += 1

def fail_test(msg):
    global failed
    print(f'{RED}[FAIL]{NC} {msg}')
    failed += 1

def info(msg):
    print(f'{YELLOW}[INFO]{NC} {msg}')

def http_request(url, method='GET', data=None, headers=None):
    try:
        req_data = json.dumps(data).encode('utf-8') if data else None
        req = urllib.request.Request(url, data=req_data, method=method)
        if headers:
            for k, v in headers.items():
                req.add_header(k, v)
        if data:
            req.add_header('Content-Type', 'application/json')
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read().decode('utf-8')
            return resp.status, resp_body
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8')
        return e.code, resp_body
    except Exception as e:
        return None, str(e)

print('=' * 40)
print('  定标规则测试 (Python + urllib 版本)')
print('=' * 40)
print()

info('1. 健康检查...')
status, body = http_request(f'{BASE_URL}/api/health')
if status == 200:
    pass_test('健康检查正常 (HTTP 200)')
else:
    fail_test(f'健康检查失败，状态码: {status}')

print()
info('2. 登录 buyer01/123456 获取 token...')
token = None
status, body = http_request(
    f'{BASE_URL}/api/auth/login',
    method='POST',
    data={'username': 'buyer01', 'password': '123456'}
)
if status == 200:
    try:
        data = json.loads(body)
        token = data.get('token')
        if token:
            pass_test('登录成功，获取到 Token')
        else:
            fail_test('登录成功但未返回 Token')
    except:
        fail_test('登录响应解析失败')
else:
    fail_test(f'登录失败，状态码: {status}')

print()
info('3. 获取询价单列表...')
inquiry_id = None
valid_quotes_count = 0
if token:
    status, body = http_request(
        f'{BASE_URL}/api/inquiries',
        headers={'Authorization': f'Bearer {token}'}
    )
    if status == 200:
        try:
            data = json.loads(body)
            inquiries = data.get('inquiries', [])
            if inquiries:
                inquiry_id = inquiries[0].get('id')
                pass_test(f'获取询价单列表成功，共 {len(inquiries)} 条')
                if inquiry_id:
                    pass_test(f'第一个询价单 ID: {inquiry_id}')
                else:
                    fail_test('未获取到询价单 ID')
            else:
                fail_test('询价单列表为空')
        except:
            fail_test('询价单列表解析失败')
    else:
        fail_test(f'获取询价单失败，状态码: {status}')
else:
    fail_test('跳过询价单测试（无有效 Token）')

print()
info('4. 打印有效报价数量...')
if token and inquiry_id:
    status, body = http_request(
        f'{BASE_URL}/api/inquiries/{inquiry_id}',
        headers={'Authorization': f'Bearer {token}'}
    )
    if status == 200:
        try:
            data = json.loads(body)
            inquiry = data.get('inquiry', {})
            quotes = inquiry.get('quotes', [])
            valid_quotes = [q for q in quotes if q.get('status') == 'valid']
            valid_quotes_count = len(valid_quotes)
            info(f'有效报价数量: {valid_quotes_count} 家')
            if valid_quotes_count == 2:
                pass_test('有效报价数量为 2 家（符合预期）')
            else:
                fail_test(f'期望有效报价 2 家，实际为 {valid_quotes_count} 家')
        except:
            fail_test('询价单详情解析失败')
    else:
        fail_test(f'获取询价单详情失败，状态码: {status}')
else:
    fail_test('跳过报价数量统计（无有效 Token 或询价单 ID）')

print()
info('5. 尝试定标，验证返回 400 和正确的错误信息...')
if token and inquiry_id:
    status, body = http_request(
        f'{BASE_URL}/api/awards',
        method='POST',
        data={
            'inquiry_id': inquiry_id,
            'winning_quote_id': 'fake-quote-id',
            'final_price': 1000
        },
        headers={'Authorization': f'Bearer {token}'}
    )
    if status == 400:
        pass_test('定标正确返回 400 错误')
        try:
            data = json.loads(body)
            error_msg = data.get('error', '')
            info(f'错误信息: {error_msg}')
            if '有效报价少于3家，不能定标' in error_msg:
                pass_test('错误信息正确：有效报价少于3家，不能定标')
            else:
                fail_test(f'错误信息不正确，实际为：{error_msg}')
        except:
            fail_test('错误响应解析失败')
    else:
        fail_test(f'期望返回 400，实际返回 {status}')
else:
    fail_test('跳过定标测试（无有效 Token 或询价单 ID）')

print()
print('=' * 40)
print('  测试结果汇总')
print('=' * 40)
print(f'通过: {GREEN}{passed}{NC}')
print(f'失败: {RED}{failed}{NC}')
print()

if failed > 0:
    print(f'{RED}测试未通过！{NC}')
    sys.exit(1)
else:
    print(f'{GREEN}测试全部通过！{NC}')
    sys.exit(0)
