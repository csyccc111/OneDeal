#!/usr/bin/env bash
# OneDeal 订单系统 · Linux 部署脚本（Debian/Ubuntu，可重复执行）
# 用法：
#   1. 把项目代码放到服务器（git clone 或 rsync），进入项目根目录
#   2. sudo bash deploy/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/onedeal}"        # 部署目录（代码）
APP_USER="${APP_USER:-onedeal}"           # 运行用户
APP_PORT="${APP_PORT:-3000}"              # 监听端口
NODE_MAJOR="${NODE_MAJOR:-22}"            # Node 主版本（better-sqlite3@13 要求 >=22）

echo "==> 1/8 安装编译工具 + Node.js $NODE_MAJOR（已满足则跳过）"
# better-sqlite3 是原生模块：预编译包下载失败时会走源码编译，需要 make/gcc/python3
if ! dpkg -s build-essential >/dev/null 2>&1; then
  apt-get update && apt-get install -y build-essential python3
fi
# node 不存在或主版本低于要求时安装/升级
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 2/8 创建运行用户（幂等）"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -r -m -d "/home/$APP_USER" -s /usr/sbin/nologin "$APP_USER"

echo "==> 3/8 复制代码到 $APP_DIR"
mkdir -p "$APP_DIR"
# 当前目录即项目根（排除 node_modules/.next/data/uploads 等）
rsync -a --exclude node_modules --exclude .next --exclude data --exclude uploads --exclude .git ./ "$APP_DIR/" 2>/dev/null || {
  echo "未安装 rsync，改用 cp（请确认当前目录是项目根）"
  mkdir -p "$APP_DIR.tmp"
  cp -r . "$APP_DIR.tmp/"
  rm -rf "$APP_DIR.tmp/node_modules" "$APP_DIR.tmp/.next" "$APP_DIR.tmp/data" "$APP_DIR.tmp/uploads" "$APP_DIR.tmp/.git"
  mv "$APP_DIR.tmp"/* "$APP_DIR/" 2>/dev/null || true
  rm -rf "$APP_DIR.tmp"
}

echo "==> 4/8 生成 .env（若不存在）"
if [ ! -f "$APP_DIR/.env" ]; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
  HASH=$(node -e "const{scryptSync,randomBytes}=require('crypto');const s=randomBytes(16);console.log('scrypt:'+s.toString('hex')+':'+scryptSync('admin123',s,64).toString('hex'))")
  cat > "$APP_DIR/.env" <<EOF
DATABASE_URL="file:$APP_DIR/.next/standalone/data/onedeal.db"
AUTH_SECRET="$SECRET"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="$HASH"
EOF
  echo "!! 已生成默认账号 admin / admin123（部署完成后请立即改密：node scripts/set-password.mjs）"
else
  echo "   已存在 .env，保留现有配置"
fi

echo "==> 5/8 安装依赖并构建（standalone）"
cd "$APP_DIR"
# 重要：npm run build 会清空 .next 目录（含 standalone/data 数据库、password.json、uploads 附件）
# 先保护运行数据，构建完成后恢复（2026-08-22 事故：未保护导致生产库被重建，教训）
DATA_BACKUP="/tmp/onedeal-data-backup-$(date +%Y%m%d%H%M%S)"
if [ -d "$APP_DIR/.next/standalone/data" ] || [ -d "$APP_DIR/.next/standalone/uploads" ]; then
  mkdir -p "$DATA_BACKUP"
  [ -d "$APP_DIR/.next/standalone/data" ] && cp -r "$APP_DIR/.next/standalone/data" "$DATA_BACKUP/"
  [ -d "$APP_DIR/.next/standalone/uploads" ] && cp -r "$APP_DIR/.next/standalone/uploads" "$DATA_BACKUP/"
  echo "   已保护运行数据：$DATA_BACKUP"
else
  DATA_BACKUP=""
fi
# npm ci 会清空 node_modules 干净安装（避免上次失败残留导致跳过）
npm ci
npx prisma generate
npm run build

echo "==> 6/8 准备 standalone 运行目录"
STANDALONE="$APP_DIR/.next/standalone"
mkdir -p "$STANDALONE/data" "$STANDALONE/uploads"
# 恢复构建前保护的数据（数据库/password.json/附件）；构建失败也执行（trap EXIT）
restore_data() {
  if [ -n "$DATA_BACKUP" ] && [ -d "$DATA_BACKUP" ]; then
    [ -d "$DATA_BACKUP/data" ] && cp -rn "$DATA_BACKUP/data/." "$STANDALONE/data/"
    [ -d "$DATA_BACKUP/uploads" ] && cp -rn "$DATA_BACKUP/uploads/." "$STANDALONE/uploads/"
    echo "   已恢复运行数据（数据库/密码/附件）"
    rm -rf "$DATA_BACKUP"
  fi
}
trap restore_data EXIT
[ -d .next/static ] && cp -r .next/static "$STANDALONE/.next/static"
[ -d public ] && cp -r public "$STANDALONE/public"

echo "==> 7/8 应用数据库迁移"
# 生产环境应用迁移（不会创建新迁移，只应用已存在的）
cd "$APP_DIR" && npx prisma migrate deploy

echo "==> 8/8 配置 systemd 服务并开机自启"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
cat > /etc/systemd/system/onedeal.service <<EOF
[Unit]
Description=OneDeal 订单追踪系统
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$STANDALONE
Environment=PORT=$APP_PORT
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable onedeal
systemctl restart onedeal

echo ""
echo "===== 部署完成 ====="
echo "访问：http://<服务器IP>:$APP_PORT"
echo "账号：admin（默认密码 admin123，请改密）"
echo "查看状态：systemctl status onedeal"
echo "日志：journalctl -u onedeal -f"
echo "手动备份：bash scripts/backup.sh"
echo "自动备份：crontab -e 添加  0 2 * * * cd $APP_DIR && bash scripts/backup.sh"
