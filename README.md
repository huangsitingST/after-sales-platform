# 企业售后 MCP Host

这是第三章第 08 节的独立实战项目。项目按前端、服务端和 MCP 角色拆分：

- 前端使用 Vue 3 + TypeScript + Vite。
- 服务端使用 NestJS + TypeScript。
- MCP Client、MCP Server 和 MCP Host 分层实现。
- 命令行 Agent Host 已移除，统一使用浏览器 Host。

## 目录结构

```text
src/
├── frontend/
│   └── web-host/              # Vue 对话和确认弹窗
└── server/
    ├── main.ts                # Nest 启动入口
    ├── app.module.ts
    └── modules/
        ├── after-sales/       # 售后业务逻辑
        ├── auth/              # Token 鉴权
        ├── database/          # MongoDB 连接、集合校验和索引
        ├── model/             # DeepSeek 调用
        └── mcp/
            ├── contracts/     # Client、Server、Host 接口契约
            ├── client/        # MCP Client 实现
            ├── server/        # MCP Server 与能力注册
            └── host/          # Host 编排、Tool 代理、HTTP Transport
```

## 运行环境

- Node.js `20.19+`

当前项目使用 NestJS 11 和 Vue 3。首次运行：

```bash
nvm use
npm install
npm run db:init
npm run build
npm run server
```

MongoDB 会在应用启动时自动检查集合和索引，也可以单独执行
`npm run db:init`。该命令只维护数据库结构，不会写入业务数据。默认数据库为
`enterprise_after_sales`，包含用户、订单、物流、售后规则、退款申请、
批量审核任务和审计日志七类集合。

默认地址：

```text
Web Host：http://127.0.0.1:3100
MCP Server：http://127.0.0.1:3100/mcp
```

## 开发与验证

服务端开发模式：

```bash
npm run server:dev
```

类型检查：

```bash
npm run typecheck
```

保持服务端运行，在另一个进程执行 MCP 协议验证：

```bash
npm run verify
```

验证覆盖角色权限、多租户隔离、Tools、Resources、Prompts、人工确认、幂等退款和长任务。

## 环境变量

在项目根目录配置：

```dotenv
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
MCP_TOKEN=token-blue-service
REQUEST_STATE_SECRET=请替换为至少32字节的随机字符串
MONGODB_URI=mongodb://root:root_password@127.0.0.1:27017/?authSource=admin
MONGODB_DATABASE=enterprise_after_sales
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
PORT=3100
```

浏览器不会直接获取 `DEEPSEEK_API_KEY`，模型请求统一由 Nest Host 代理。

## 演示身份

| Token | 企业 | 角色 |
| --- | --- | --- |
| `token-blue-service` | 蓝鲸科技 | 客服 |
| `token-blue-finance` | 蓝鲸科技 | 财务 |
| `token-star-service` | 星河零售 | 客服 |

这些 Token 只用于本地演示，不能直接用于生产环境。
