# 企业售后 Agent 接口文档

本文档基于当前项目代码整理，数据来源为 MongoDB。文档同时覆盖：

- 浏览器 Web Host 使用的 HTTP 接口
- MCP Client 使用的 MCP Tools、Resources 和 Prompts
- 前端请求函数与后端 Controller 的对应关系
- 每个接口对应的源码文件和定义行号

## 1. 基本信息

| 项目 | 值 |
| --- | --- |
| Web Host 地址 | `http://127.0.0.1:3100` |
| MCP Server 地址 | `http://127.0.0.1:3100/mcp` |
| Sandbox 地址 | `http://127.0.0.1:3201/sandbox.html` |
| HTTP JSON 请求内容类型 | `application/json` |
| MCP 身份认证 | `Authorization: Bearer <token>` |
| MongoDB 数据库 | `.env` 中的 `MONGODB_DATABASE`，当前为 `enterprise_after_sales` |

服务启动、端口和静态资源处理定义在
[src/server/main.ts](src/server/main.ts#L18)。

HTTP API 的根模块定义在
[src/server/app.module.ts](src/server/app.module.ts#L7)。

## 2. HTTP 接口总览

| 方法 | 路径 | 说明 | 鉴权 | 源码 |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | 检查服务状态 | 无 | [health.controller.ts](src/server/modules/health/health.controller.ts#L3) |
| `GET` | `/api/config` | 获取浏览器运行配置 | 无 | [runtime.controller.ts](src/server/runtime.controller.ts#L3) |
| `POST` | `/api/agent/sessions` | 创建 Agent 会话 | Token 放在 JSON 请求体中 | [agent.controller.ts](src/server/modules/agent/agent.controller.ts#L17) |
| `POST` | `/api/agent/sessions/:sessionId/messages` | 向会话发送消息 | 使用 `sessionId` | [agent.controller.ts](src/server/modules/agent/agent.controller.ts#L22) |
| `POST` | `/api/agent/confirmations/:confirmationId` | 接受或拒绝高风险操作 | 使用 `confirmationId` | [agent.controller.ts](src/server/modules/agent/agent.controller.ts#L31) |
| `ALL` | `/mcp` | MCP Streamable HTTP 协议入口 | `Authorization: Bearer <token>` | [mcp-transport.controller.ts](src/server/modules/mcp/host/mcp-transport.controller.ts#L7) |

## 3. HTTP 接口详情

### 3.1 健康检查

**接口**

```http
GET /health
```

**请求参数**

无。

**响应示例**

```json
{
  "ok": true,
  "service": "enterprise-after-sales-mcp"
}
```

**源码**

- Controller：[src/server/modules/health/health.controller.ts](src/server/modules/health/health.controller.ts#L5)

### 3.2 获取运行时配置

**接口**

```http
GET /api/config
```

**请求参数**

无。

**响应示例**

```json
{
  "sandboxUrl": "http://127.0.0.1:3201/sandbox.html"
}
```

Sandbox 端口从 `WEB_SANDBOX_PORT` 环境变量读取。

**源码**

- Controller：[src/server/runtime.controller.ts](src/server/runtime.controller.ts#L4)

### 3.3 创建 Agent 会话

**接口**

```http
POST /api/agent/sessions
Content-Type: application/json
```

**请求体**

```json
{
  "token": "用户数据库中的-token"
}
```

字段定义：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `token` | `string` | 是 | 用户 Token，后端通过 MongoDB `users` 集合校验 |

**响应示例**

```json
{
  "sessionId": "2c43c2c8-5f71-4de1-a79f-ec86656e3ac6",
  "model": "deepseek-v4-flash",
  "toolCount": 5
}
```

**可能的错误**

| HTTP 状态码 | 条件 |
| --- | --- |
| `400` | `token` 为空 |

**源码**

- Controller：[src/server/modules/agent/agent.controller.ts](src/server/modules/agent/agent.controller.ts#L17)
- 会话创建逻辑：[src/server/modules/agent/agent.service.ts](src/server/modules/agent/agent.service.ts#L133)
- Token 校验：[src/server/modules/auth/auth.service.ts](src/server/modules/auth/auth.service.ts#L17)
- 请求类型：[src/server/modules/agent/agent.contract.ts](src/server/modules/agent/agent.contract.ts#L61)

### 3.4 发送 Agent 消息

**接口**

```http
POST /api/agent/sessions/:sessionId/messages
Content-Type: application/json
```

**路径参数**

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `sessionId` | `string` | 创建会话时返回的会话 ID |

**请求体**

```json
{
  "message": "订单 A1024 可以退款吗？"
}
```

**请求字段**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | `string` | 是 | 用户发送给 Agent 的问题 |

**直接完成时的响应**

```json
{
  "kind": "completed",
  "events": [
    {
      "id": "event-id",
      "type": "message",
      "role": "assistant",
      "text": "当前订单满足退款预检条件。"
    }
  ]
}
```

**等待人工确认时的响应**

```json
{
  "kind": "confirmation_required",
  "confirmationId": "confirmation-id",
  "message": "即将创建退款申请，是否继续？",
  "events": []
}
```

**可能的错误**

| HTTP 状态码 | 条件 |
| --- | --- |
| `400` | `message` 为空，或当前会话还有待确认操作 |
| `404` | `sessionId` 不存在或已经过期 |

**源码**

- Controller：[src/server/modules/agent/agent.controller.ts](src/server/modules/agent/agent.controller.ts#L22)
- 消息处理：[src/server/modules/agent/agent.service.ts](src/server/modules/agent/agent.service.ts#L158)
- 请求类型：[src/server/modules/agent/agent.contract.ts](src/server/modules/agent/agent.contract.ts#L71)
- 响应类型：[src/server/modules/agent/agent.contract.ts](src/server/modules/agent/agent.contract.ts#L49)

### 3.5 处理人工确认

**接口**

```http
POST /api/agent/confirmations/:confirmationId
Content-Type: application/json
```

**路径参数**

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `confirmationId` | `string` | `confirmation_required` 响应中返回的确认 ID |

**请求体**

```json
{
  "accepted": true
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `accepted` | `boolean` | 是 | `true` 执行操作，`false` 取消操作 |

**响应**

返回确认后的 `AgentRunResponse`。

**可能的错误**

| HTTP 状态码 | 条件 |
| --- | --- |
| `404` | `confirmationId` 不存在或已经过期 |

**源码**

- Controller：[src/server/modules/agent/agent.controller.ts](src/server/modules/agent/agent.controller.ts#L35)
- 确认处理：[src/server/modules/agent/agent.service.ts](src/server/modules/agent/agent.service.ts#L230)
- 请求类型：[src/server/modules/agent/agent.contract.ts](src/server/modules/agent/agent.contract.ts#L75)

### 3.6 MCP HTTP 入口

**接口**

```http
ALL /mcp
Authorization: Bearer <token>
```

该路径不是普通 REST 接口，而是 MCP Streamable HTTP 入口。请求由 MCP Client 按
MCP 协议发送，不能直接把它当作普通 JSON CRUD 接口使用。

**鉴权**

```http
Authorization: Bearer <用户数据库中的-token>
```

Token 校验和租户身份解析：

- [src/server/modules/mcp/host/mcp-transport.controller.ts](src/server/modules/mcp/host/mcp-transport.controller.ts#L16)
- [src/server/modules/auth/auth.service.ts](src/server/modules/auth/auth.service.ts#L17)

**鉴权失败响应**

```json
{
  "error": "UNAUTHORIZED",
  "message": "请提供有效的 Bearer Token"
}
```

## 4. MCP Tools

MCP Tool 是 Agent 可以调用的业务能力。Tool 返回统一使用以下包装：

```json
{
  "isError": false,
  "structuredContent": {
    "ok": true
  },
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true}"
    }
  ]
}
```

结果包装定义在
[src/server/modules/mcp/server/tool-results.ts](src/server/modules/mcp/server/tool-results.ts#L1)。

Tool 注册入口：

- 通用 Tool：[src/server/modules/mcp/server/capabilities/common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L17)
- 财务 Tool：[src/server/modules/mcp/server/capabilities/finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L23)
- 角色权限控制：[src/server/modules/mcp/server/after-sales-mcp-server.factory.ts](src/server/modules/mcp/server/after-sales-mcp-server.factory.ts#L38)

### 4.1 Tool 总览

| Tool | 角色 | 是否写操作 | 源码 |
| --- | --- | --- | --- |
| `get_order_detail` | 客服、财务 | 否 | [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L22) |
| `get_logistics_trace` | 客服、财务 | 否 | [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L39) |
| `search_after_sales_policy` | 客服、财务 | 否 | [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L58) |
| `preview_refund` | 客服、财务 | 否 | [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L77) |
| `submit_refund_request` | 客服、财务 | 是，需要确认 | [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L104) |
| `start_batch_refund_review` | 财务 | 是，需要确认 | [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L29) |
| `get_batch_review_status` | 财务 | 否 | [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L100) |
| `cancel_batch_review` | 财务 | 是 | [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L114) |
| `get_batch_review_report` | 财务 | 否 | [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L151) |

### 4.2 查询订单详情

```text
Tool: get_order_detail
```

**输入**

```json
{
  "orderId": "订单号"
}
```

**输出**

```json
{
  "ok": true,
  "order": {
    "tenantId": "租户 ID",
    "orderId": "订单号",
    "productName": "商品名称",
    "category": "normal",
    "amount": 3000,
    "status": "delivered",
    "signedDays": 3,
    "customerName": "客户名称"
  }
}
```

**错误**

```json
{
  "ok": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "没有找到订单 ..."
  }
}
```

数据查询实现位于
[after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L159)。

### 4.3 查询物流轨迹

```text
Tool: get_logistics_trace
```

**输入**

```json
{
  "orderId": "订单号"
}
```

**成功输出**

```json
{
  "ok": true,
  "logistics": {
    "tenantId": "租户 ID",
    "orderId": "订单号",
    "company": "物流公司",
    "trackingNo": "物流单号",
    "events": [
      {
        "time": "2026-07-16 10:30",
        "message": "商品已签收"
      }
    ]
  }
}
```

**错误码**

- `ORDER_NOT_FOUND`
- `LOGISTICS_NOT_FOUND`

数据查询实现位于
[after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L175)。

### 4.4 检索售后规则

```text
Tool: search_after_sales_policy
```

**输入**

```json
{
  "query": "退款期限"
}
```

**输出**

```json
{
  "ok": true,
  "results": [
    {
      "tenantId": "租户 ID",
      "code": "refund-policy",
      "title": "退款规则",
      "content": "规则正文",
      "score": 2
    }
  ]
}
```

检索只读取当前登录用户的 `tenantId` 对应规则。

实现位于
[after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L213)。

### 4.5 退款预检

```text
Tool: preview_refund
```

该 Tool 只计算结果，不创建退款单。

**输入**

```json
{
  "orderId": "订单号",
  "reason": "退款原因"
}
```

**输出**

```json
{
  "ok": true,
  "preview": {
    "orderId": "订单号",
    "productName": "商品名称",
    "refundAmount": 699,
    "reason": "退款原因",
    "eligible": true,
    "manualReview": false,
    "conclusion": "订单满足自动退款条件。"
  }
}
```

退款资格规则定义在
[after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L246)。

### 4.6 提交退款申请

```text
Tool: submit_refund_request
```

**输入**

```json
{
  "orderId": "订单号",
  "reason": "退款原因",
  "idempotencyKey": "至少 8 位的唯一幂等键"
}
```

**两阶段确认**

1. 第一次调用执行幂等检查和退款预检，不写入退款单。
2. 如果预检通过，Tool 返回 `inputRequired`，请求客户端弹出确认。
3. 用户确认后，客户端携带原参数和 `requestState` 再次调用。
4. 服务端校验参数、身份和确认凭证后写入 `refund_requests` 集合。

**成功输出**

```json
{
  "ok": true,
  "duplicated": false,
  "refundRequest": {
    "refundId": "REF-XXXXXXXX",
    "tenantId": "租户 ID",
    "orderId": "订单号",
    "amount": 699,
    "reason": "退款原因",
    "status": "approved",
    "createdBy": "用户 ID",
    "createdAt": "2026-09-20T12:00:00.000Z"
  }
}
```

重复使用同一幂等键时，`duplicated` 为 `true`，返回原退款单。

**错误码**

- `REFUND_NOT_ELIGIBLE`
- `ORDER_ALREADY_REFUNDED`
- `INVALID_REQUEST_STATE`
- `USER_CANCELLED`

确认流程位于
[common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L97)，
数据库写入位于
[after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L299)。

### 4.7 启动批量退款审核

```text
Tool: start_batch_refund_review
```

仅财务角色可调用。

**输入**

```json
{
  "orderIds": ["订单号-1", "订单号-2"]
}
```

`orderIds` 最少 1 个，最多 20 个。

**确认流程**

首次调用返回 `inputRequired`，确认后创建 `review_jobs` 记录并返回任务快照。

**输出**

```json
{
  "ok": true,
  "job": {
    "jobId": "JOB-XXXXXXXX",
    "tenantId": "租户 ID",
    "orderIds": ["订单号-1"],
    "status": "working",
    "progress": 25,
    "message": "正在读取订单"
  }
}
```

**错误码**

- `FORBIDDEN`
- `ORDER_NOT_FOUND`
- `INVALID_REQUEST_STATE`
- `USER_CANCELLED`

源码：

- [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L29)
- [after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L433)

### 4.8 查询批量审核状态

```text
Tool: get_batch_review_status
```

**输入**

```json
{
  "jobId": "JOB-XXXXXXXX"
}
```

**输出中的状态**

| `status` | 说明 |
| --- | --- |
| `working` | 正在处理 |
| `completed` | 已完成并返回 `result.details` |
| `cancelled` | 已取消 |

**错误码**

- `JOB_NOT_FOUND`

源码：

- [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L100)
- [after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L477)

### 4.9 取消批量审核

```text
Tool: cancel_batch_review
```

**输入**

```json
{
  "jobId": "JOB-XXXXXXXX"
}
```

**成功输出**

```json
{
  "ok": true,
  "job": {
    "jobId": "JOB-XXXXXXXX",
    "status": "cancelled",
    "progress": 0,
    "message": "任务已取消"
  }
}
```

**错误码**

- `FORBIDDEN`
- `JOB_NOT_FOUND`
- `JOB_ALREADY_COMPLETED`

源码：

- [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L114)
- [after-sales.service.ts](src/server/modules/after-sales/after-sales.service.ts#L582)

### 4.10 查看批量审核报告

```text
Tool: get_batch_review_report
```

**输入**

```json
{
  "jobId": "JOB-XXXXXXXX"
}
```

返回批量审核任务快照，并通过 `_meta.ui.resourceUri` 关联 MCP App：

```text
ui://after-sales/batch-review-report.html
```

源码：

- [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L151)
- [server.constants.ts](src/server/modules/mcp/server/server.constants.ts#L1)

## 5. MCP Resources

| Resource URI | MIME Type | 说明 | 源码 |
| --- | --- | --- | --- |
| `after-sales://policies/refund-policy` | `text/markdown` | 当前租户退款规则 | [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L271) |
| `after-sales://audit/recent` | `application/json` | 当前租户最近 20 条审计记录 | [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L128) |
| `ui://after-sales/batch-review-report.html` | `text/html;profile=mcp-app` | 批量审核报告 MCP App | [finance.capabilities.ts](src/server/modules/mcp/server/capabilities/finance.capabilities.ts#L167) |

### 5.1 退款规则 Resource

**URI**

```text
after-sales://policies/refund-policy
```

**内容**

当前登录用户所在租户的 `refund-policy` 规则，转换为 Markdown 返回。

### 5.2 审计记录 Resource

**URI**

```text
after-sales://audit/recent
```

返回当前租户最近的退款、批量审核和取消操作记录。数据来自 MongoDB
`audit_logs` 集合。

### 5.3 MCP App Resource

**URI**

```text
ui://after-sales/batch-review-report.html
```

返回构建后的 HTML 页面，用于在 MCP App Sandbox 中展示批量审核报告。

## 6. MCP Prompt

### 6.1 售后问题处理模板

```text
Prompt: handle_after_sales_case
```

**输入参数**

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `orderId` | `string` | 是 | 订单号 |
| `customerQuestion` | `string` | 是 | 客户问题 |

**返回**

返回一条要求 Agent 先查询事实、再进行操作的提示词。

源码：

- [common.capabilities.ts](src/server/modules/mcp/server/capabilities/common.capabilities.ts#L299)

## 7. 共享响应结构

### 7.1 AgentRunResponse

源码：[agent.contract.ts](src/server/modules/agent/agent.contract.ts#L49)

```ts
type AgentRunResponse =
  | {
      kind: 'completed'
      events: AgentEvent[]
    }
  | {
      kind: 'confirmation_required'
      confirmationId: string
      message: string
      events: AgentEvent[]
    }
```

### 7.2 AgentEvent

源码：[agent.contract.ts](src/server/modules/agent/agent.contract.ts#L13)

支持四种事件：

| `type` | 说明 |
| --- | --- |
| `message` | Agent 或用户文本消息 |
| `status` | 长任务进度信息 |
| `tool` | Tool 调用状态和结果 |
| `app` | MCP App 的 HTML、资源 URI 和权限信息 |

### 7.3 MCP Tool Result

源码：[shared.types.ts](src/server/modules/mcp/contracts/shared.types.ts#L23)

```ts
interface McpToolResult {
  isError?: boolean
  content?: Array<{
    type: string
    text?: string
  }>
  structuredContent?: unknown
}
```

### 7.4 业务错误

业务错误通常使用：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误说明"
  }
}
```

## 8. 前端请求函数与后端接口对应关系

前端请求集中在
[agent-api.ts](src/frontend/web-host/src/api/agent-api.ts#L1)，
底层 `fetch` 封装位于
[http.ts](src/frontend/web-host/src/api/http.ts#L1)。

| 前端函数 | HTTP 接口 | 后端 Controller |
| --- | --- | --- |
| `getRuntimeConfig()` | `GET /api/config` | [runtime.controller.ts](src/server/runtime.controller.ts#L5) |
| `createAgentSession()` | `POST /api/agent/sessions` | [agent.controller.ts](src/server/modules/agent/agent.controller.ts#L17) |
| `sendAgentMessage()` | `POST /api/agent/sessions/:sessionId/messages` | [agent.controller.ts](src/server/modules/agent/agent.controller.ts#L22) |
| `resolveAgentConfirmation()` | `POST /api/agent/confirmations/:confirmationId` | [agent.controller.ts](src/server/modules/agent/agent.controller.ts#L31) |

前端调用链：

```text
Vue 页面
  -> composables/useAfterSalesAgent.ts
  -> api/agent-api.ts
  -> api/http.ts
  -> Nest Controller
  -> AgentService
  -> MCP Host
  -> MCP Server Tools/Resources
  -> AfterSalesService
  -> MongoDB
```

## 9. MongoDB 集合与接口关系

集合定义和索引位于
[schema.ts](src/server/modules/database/schema.ts#L9)。

| 集合 | 使用接口或能力 |
| --- | --- |
| `users` | 创建会话、MCP Bearer Token 鉴权 |
| `orders` | `get_order_detail`、`preview_refund`、批量审核 |
| `logistics` | `get_logistics_trace` |
| `policies` | `search_after_sales_policy`、退款规则 Resource |
| `refund_requests` | `submit_refund_request` |
| `review_jobs` | 批量审核的启动、状态查询、取消和报告 |
| `audit_logs` | 审计记录 Resource |

## 10. 调用示例

### 10.1 创建会话

```bash
curl -X POST http://127.0.0.1:3100/api/agent/sessions \
  -H 'Content-Type: application/json' \
  -d '{"token":"数据库 users 集合中的 token"}'
```

### 10.2 发送消息

```bash
curl -X POST http://127.0.0.1:3100/api/agent/sessions/<sessionId>/messages \
  -H 'Content-Type: application/json' \
  -d '{"message":"查询订单详情"}'
```

### 10.3 调用 MCP HTTP 入口

```bash
curl -X POST http://127.0.0.1:3100/mcp \
  -H 'Authorization: Bearer <数据库 users 集合中的 token>' \
  -H 'Content-Type: application/json' \
  -d '<MCP JSON-RPC 请求>'
```

`/mcp` 应优先通过项目中的
[McpClientService](src/server/modules/mcp/client/mcp-client.service.ts#L17)
或标准 MCP Client 调用。
