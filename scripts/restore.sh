#!/usr/bin/env bash
# OneDeal · 恢复脚本
# 用法：bash scripts/restore.sh /path/to/onedeal-backup-YYYYMMDD-HHMMSS.tar.gz
# 恢复前会先备份当前数据为 onedeal-pre-restore-*.tar.gz，确认无误后可删除
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -ne 1 ]; then
  echo "用法：bash scripts/restore.sh <备份文件.tar.gz>"
  exit 1
fi
BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "!! 备份文件不存在：$BACKUP_FILE"
  exit 1
fi

DATA_DIR="${BACKUP_DATA_DIR:-$PROJECT_DIR/data}"
UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-$PROJECT_DIR/uploads}"

# 恢复前先备份当前状态
STAMP=$(date +%Y%m%d-%H%M%S)
PRE="$PROJECT_DIR/backups/onedeal-pre-restore-$STAMP.tar.gz"
mkdir -p "$PROJECT_DIR/backups"
if [ -f "$DATA_DIR/onedeal.db" ]; then
  tar -czf "$PRE" -C "$DATA_DIR" onedeal.db
  echo "已备份当前数据：$PRE（如确认恢复无误可删除）"
fi

# 备份内容结构：data 下 onedeal.db，uploads 下为附件
mkdir -p "$DATA_DIR" "$UPLOADS_DIR"

# 解压数据库
if tar -tzf "$BACKUP_FILE" | grep -q 'onedeal.db'; then
  tar -xzf "$BACKUP_FILE" -C "$DATA_DIR" onedeal.db
  echo "数据库已恢复：$DATA_DIR/onedeal.db"
else
  echo "!! 备份文件中未找到 onedeal.db"
fi

# 解压附件（若有 uploads 内容）
if tar -tzf "$BACKUP_FILE" | grep -q '^\./'; then
  tar -xzf "$BACKUP_FILE" -C "$UPLOADS_DIR" .
  echo "附件已恢复：$UPLOADS_DIR"
fi

echo ""
echo "===== 恢复完成 ====="
echo "请重启服务：systemctl restart onedeal（或 pm2 restart onedeal）"
echo "注意：若数据库结构有新增迁移，恢复旧库后请运行：npx prisma migrate deploy"
