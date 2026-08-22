# OneDeal · 轻量订单追踪与结算系统

面向**微型企业**的一站式订单管理工具：接单 → 排产 → 生产 → 发货 → 结算全链路记录，客户/供应商台账与应收应付一目了然。单文件数据库、零运维、局域网/公网均可访问，手机浏览器和电脑一样好用。

> 设计目标：让小微企业主（或小团队）用最低成本把订单、货款、单据管起来，不再依赖 Excel 手工转录。

## ✨ 功能特性

- **订单全流程**：订单台账 + 状态机（待确认→排产→生产中→已发货→已结算）+ 变更留痕（改价/改量有日志）
- **发货/退货/废品**：订单行级记账，未发量自动计算；**送货单开单即自动记发货**，不会重复扣量
- **送货单打印**：按真实模板复刻（241×219mm 针式一联），中文大写金额、客户订单号、打印计数
- **结算管理**：一笔款冲多单、开票记录、未收账龄（>30 黄 / >60 红）、月度对账（按创建/发货日期口径）
- **对账单**：客户格式可配置（标题/条款/列），导出 Excel 与打印预览同源渲染
- **供应商模块**：采购单 + 付款冲抵 + 应付/已付/余额与账龄（与客户侧完全对称）
- **统计报表**：月度趋势 / 欠款排行 / 客户年累计，Excel（单文件三 Sheet）+ 打印预览
- **附件管理**：图纸、微信截图上传（电脑拖拽 / 手机拍照直传），按订单归档
- **Excel 批量导入**：历史数据迁移（列映射、客户归并、欠款带入）
- **输入联想**：品名 / 规格 / 物料编号智能联想（频率 + 最近使用排序）
- **PWA**：手机可"添加到主屏幕"，离线壳加载
- **零运维**：SQLite 单文件数据库、一键备份下载、每日自动备份脚本

## 🛠 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ TypeScript |
| UI | shadcn/ui + Tailwind CSS v4（中文界面，基础字号 16px） |
| 数据库 | Prisma 7 + SQLite（better-sqlite3 driver adapter） |
| 认证 | Auth.js v5（Credentials + JWT，scrypt 密码哈希） |
| 金额 | 整数分存储；单价支持厘级精度（0.105 元，1 元 = 1000 厘） |

## 🚀 快速开始

环境要求：Node.js ≥ 20

```bash
npm install
npm run dev
```

打开 http://localhost:3000，默认账号 `admin` / `admin123`（登录后请立即在「设置」页修改密码）。

数据库迁移（修改 `prisma/schema.prisma` 后执行）：

```bash
npx prisma generate                 # Prisma 7 的 migrate 不会自动 generate
npx prisma migrate dev --name <迁移名>
```

## 🏭 生产部署（Linux / Debian / Ubuntu）

```bash
# 1. 代码放到服务器（git clone），进入项目根目录
# 2. 一键部署（自动装 Node 22、构建、配置 systemd 开机自启）
sudo bash deploy/deploy.sh
```

- 服务管理：`systemctl status onedeal`、日志 `journalctl -u onedeal -f`
- 环境变量模板见 `.env.example`（`AUTH_SECRET` 必须唯一）
- 部署后立即改密：登录「设置」页（即时生效）；或 `node scripts/set-password.mjs`
- 可选 PM2：`deploy/ecosystem.config.js`（与 systemd 二选一）
- 外网访问：花生壳 / frp / Tailscale 等内网穿透方案均可，系统本身不依赖公网

## 💾 备份与恢复

- **手动**：登录系统 → 首页「一键备份下载」（打包数据库 + 附件为 zip）
- **自动**：服务器 cron 每日备份（保留最近 30 份）：

  ```bash
  0 2 * * * cd /opt/onedeal && bash scripts/backup.sh /var/backups/onedeal >> /var/log/onedeal-backup.log 2>&1
  ```

  可通过 `BACKUP_DATA_DIR` / `BACKUP_UPLOADS_DIR` / `BACKUP_KEEP` 环境变量调整目录与保留份数
- **恢复**：`bash scripts/restore.sh /var/backups/onedeal/onedeal-backup-日期.tar.gz`（恢复前自动留存当前数据）

## 📁 目录结构

| 路径 | 说明 |
|---|---|
| `app/` | 路由与页面（App Router） |
| `components/` | 组件（`components/ui/` 为 shadcn/ui 基础组件） |
| `lib/` | 公共工具与服务（`lib/services/` 业务逻辑、`lib/import/` 导入解析） |
| `prisma/` | `schema.prisma` 与迁移记录 |
| `deploy/` | Linux 部署脚本（deploy.sh、PM2 生态文件） |
| `scripts/` | 改密、备份、恢复脚本 |
| `data/` | SQLite 数据库文件（git 忽略，备份核心） |
| `uploads/` | 订单附件目录（git 忽略） |
| `public/` | 静态资源（PWA 图标等） |

## 📄 License

MIT
